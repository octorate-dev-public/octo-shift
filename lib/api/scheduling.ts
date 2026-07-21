import { shiftsAPI } from './shifts';
import { usersAPI } from './users';
import { settingsAPI } from './settings';
import { preferencesAPI } from './preferences';
import { getMonthDays, getSeniorityDays, formatDate, isAbsenceShiftType, isOfficePresence } from '../utils';
import { User, Shift, ShiftType, LeaveType, PreferenceType } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('schedulingAPI');

/**
 * Pseudo-random deterministico in [0,1) da una stringa seed (hash FNV-1a).
 * Deterministico: lo stesso seed dà sempre lo stesso valore, così il "random
 * settimanale" resta stabile entro la settimana e non cambia a ogni rigenerazione
 * per la stessa settimana.
 */
function seededUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100000) / 100000;
}

export const schedulingAPI = {
  /**
   * Generate the monthly schedule respecting:
   *  1. Office capacity per giorno ∈ [ceil(max/3), max] — NON deve saturare al max
   *  2. Ogni dipendente ha ≥ minSmartDays giorni smart/mese (cap officeBudget = presenza - minSmartDays)
   *  3. Locked shifts are never touched
   *  4. Weekends/holidays → skipped
   *  5. renounce_smart users → always office first (excluded from equity pool, no smart minimum)
   *  6. Equity-first: chi ha più smart del proprio target proporzionale va in ufficio
   *  7. Preferences (home/office/indifferent) act as secondary score modifiers
   *  8. Team meeting days add office priority; seniority + mix + random settimanale come tiebreaker
   */
  async generateMonthlySchedule(year: number, month: number): Promise<Shift[]> {
    return log.withTiming('generateMonthlySchedule', { year, month }, async () => {
      const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
      const minSmartDays = await settingsAPI.getMinSmartDays();
      // Capienza ufficio giornaliera: floor = ceil(max/3), non deve per forza
      // riempirsi al massimo. Il floor garantisce presenza minima in ufficio;
      // il cap per-persona (presenza - minSmartDays) garantisce lo smart minimo.
      // Floor SEMPRE ≥ 1 quando la capienza lo consente: mai ufficio vuoto se c'è
      // qualcuno assegnabile, ANCHE a costo di togliere a qualcuno lo smart minimo
      // (pass 2 sfora il budget smart). Con maxCapacity = 0 l'ufficio è chiuso → 0.
      const minOfficePerDay = maxCapacity >= 1
        ? Math.min(maxCapacity, Math.max(1, Math.ceil(maxCapacity / 3)))
        : 0;
      const workDays = await settingsAPI.getWorkDays();
      const holidayDates = await settingsAPI.getHolidayDates();
      const holidaySet = new Set(holidayDates);
      const allUsers = await usersAPI.getAllUsers();

      if (allUsers.length === 0) {
        log.warn('generateMonthlySchedule', 'Nessun utente attivo, schedule vuoto');
        return [];
      }

      // Fetch existing locked shifts so we can preserve them
      const existingShifts = await shiftsAPI.getMonthShifts(year, month);
      const lockedMap = new Map<string, { shiftType: ShiftType; leaveType: LeaveType | null }>(); // key = `userId:date`
      // Track existing leave for ALL shifts (not just locked) so we preserve them.
      // This covers BOTH representations: the new `leave_type` overlay column
      // and the legacy `shift_type = 'vacation' | 'permission' | 'sick'` rows.
      const existingLeaveMap = new Map<string, LeaveType | null>();
      existingShifts.forEach((s) => {
        const key = `${s.user_id}:${s.shift_date}`;
        const leave: LeaveType | null =
          s.leave_type ?? (isAbsenceShiftType(s.shift_type) ? (s.shift_type as LeaveType) : null);
        if (s.locked) {
          // If it's a legacy leave row, normalise shiftType to 'smartwork' so
          // the locked row doesn't silently consume office capacity later.
          const normalisedShiftType: ShiftType =
            s.shift_type === 'office' || s.shift_type === 'smartwork' ? s.shift_type : 'smartwork';
          lockedMap.set(key, { shiftType: normalisedShiftType, leaveType: leave });
        }
        if (leave) existingLeaveMap.set(key, leave);
      });
      log.info('generateMonthlySchedule', `Trovati ${lockedMap.size} turni bloccati da preservare`);

      const { supabase } = await import('../supabase');

      // Rimuovi i turni delle risorse disattivate (is_active = false).
      // getAllUsers() restituisce solo utenti attivi, quindi la generazione non
      // li riassegna mai; ma le righe già presenti nel mese resterebbero orfane
      // e continuerebbero a comparire nel calendario. Le eliminiamo qui così che
      // rigenerando il mese le risorse disattivate non vengano più considerate.
      const activeUserIds = new Set(allUsers.map((u) => u.id));
      const staleShiftIds = existingShifts
        .filter((s) => !activeUserIds.has(s.user_id))
        .map((s) => s.id);
      if (staleShiftIds.length > 0) {
        await supabase.from('shifts').delete().in('id', staleShiftIds);
        log.info('generateMonthlySchedule', `Rimossi ${staleShiftIds.length} turni di risorse disattivate`);
      }

      // Fetch teams for meeting-day logic
      const { data: teamsRaw } = await supabase
        .from('teams')
        .select('id, name, weekly_meeting_day');
      const teamMeetingDay = new Map<string, string>();
      (teamsRaw || []).forEach((t: any) => {
        if (t.weekly_meeting_day) teamMeetingDay.set(t.id, t.weekly_meeting_day.toLowerCase());
      });

      // Sort users by seniority (most senior first)
      const sortedUsers = [...allUsers].sort((a, b) =>
        getSeniorityDays(b.seniority_date) - getSeniorityDays(a.seniority_date),
      );

      // Seniority index for stable tiebreaking (lower index = more senior)
      const seniorityIndex = new Map<string, number>();
      sortedUsers.forEach((u, i) => seniorityIndex.set(u.id, i));

      // Running smart-day counter per user — drives equity across the month
      // renounce_smart users are tracked but excluded from the equity average
      const userSmartDays = new Map<string, number>();
      sortedUsers.forEach((u) => userSmartDays.set(u.id, 0));

      // Giorni effettivamente LAVORATI (ufficio + smart, no ferie/permessi).
      // L'equità è proporzionale alla presenza: il target smart di ciascuno è
      // `giorni_lavorati × frazione_smart_media`. Così chi rientra dopo settimane
      // di ferie NON si vede scaricare tutta la coda del mese in smart per
      // "recuperare" un conteggio assoluto: ha pochi giorni lavorati, quindi un
      // target basso, e riceve la stessa proporzione ufficio/smart degli altri.
      const userWorkedDays = new Map<string, number>();
      sortedUsers.forEach((u) => userWorkedDays.set(u.id, 0));

      // Load user preferences for this month
      const monthYearStr = `${year}-${String(month).padStart(2, '0')}`;
      const allPreferences = await preferencesAPI.getAllMonthPreferences(monthYearStr);
      const prefMap = new Map<string, PreferenceType>();
      allPreferences.forEach((p) => prefMap.set(`${p.user_id}:${p.preference_date}`, p.preference));
      log.info('generateMonthlySchedule', `Caricate ${allPreferences.length} preferenze utente`);

      // ─── Gerarchia dei pesi (dal più importante al meno importante) ────────
      //
      //  1. EQUITÀ      → sempre primaria: chi ha più giorni smart va in ufficio
      //  2. RIUNIONE    → quasi-garantisce ufficio nel giorno del team meeting
      //  3. SENIORITY   → i più senior hanno priorità ufficio a parità di equity
      //  4. PREFERENZA  → home/office/indifferente (seconda-scelta giornaliera)
      //  5. STILE       → stable/random (tono fine, non deve battere i precedenti)
      //  6. RANDOM SETT.→ jitter per settimana del mese (±0.3): ogni tanto pairing diversi
      //  7. MIX ANZIAN. → micro-nudge alternato senior/junior per settimana (mescola le età)
      //
      // Esempio: Devin (senior, riunione giovedì, preferenza stabile) deve
      // andare in ufficio giovedì ANCHE se il suo pattern stabile dice smart.
      // MEETING_BONUS (10) >> STABLE (-0.8) + qualsiasi equity ragionevole.

      const EQUITY_WEIGHT    = 2;   // ogni giorno smart sopra il target proporzionale = +2 office priority
      const MEETING_BONUS    = 10;  // riunione → priorità ufficio quasi assoluta
      const SENIORITY_BONUS  = 2;   // il più senior prende +2, il meno senior +0 (lineare)
      const PREF_OFFICE_SCORE  = 3; // preferenza ufficio (secondaria a meeting+seniority)
      const PREF_INDIFF_SCORE  = 1; // preferenza indifferente
      // home preference = 0
      const STABLE_WEEKDAY_BONUS = 0.8; // ±0.8: stile stabile crea coerenza ma NON batte riunioni
      const RANDOM_JITTER        = 0.5; // ±0.25: variazione visibile ma subordinata a tutto
      const WEEKLY_MIX_JITTER    = 0.6; // ±0.3: random dipendente dalla settimana del mese → ogni tanto composizioni ufficio diverse
      const SENIORITY_MIX        = 0.35; // a parità, alterna il micro-nudge senior/junior per settimana → mescola anziani e giovani

      // Numero di utenti regular per normalizzare la seniority
      const regularCount = sortedUsers.filter(u => !u.renounce_smart).length || 1;

      // Traccia i pattern weekday intra-mese per gli utenti 'stable'.
      // Se lunedì hanno avuto ufficio nelle settimane precedenti, oggi lunedì
      // ricevono un bonus ufficio; se hanno avuto smart, ricevono un malus.
      const userOfficeWeekdays = new Map<string, Set<number>>();
      const userSmartWeekdays  = new Map<string, Set<number>>();
      sortedUsers.forEach((u) => {
        userOfficeWeekdays.set(u.id, new Set());
        userSmartWeekdays.set(u.id, new Set());
      });

      const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const monthDays = getMonthDays(year, month - 1); // getMonthDays expects 0-based month

      // Collect non-working dates so we can delete stale shifts from previous runs
      const nonWorkingDates = monthDays
        .filter((date) => {
          const dateStr = formatDate(date);
          const dayName = DAY_NAMES[date.getDay()];
          return !workDays.includes(dayName) || holidaySet.has(dateStr);
        })
        .map((date) => formatDate(date));

      if (nonWorkingDates.length > 0) {
        await supabase
          .from('shifts')
          .delete()
          .in('shift_date', nonWorkingDates)
          .eq('locked', false);
        log.info('generateMonthlySchedule', `Rimossi turni su ${nonWorkingDates.length} giorni non lavorativi`);
      }

      // ── Budget ufficio per-persona (garanzia smart minimo) ──────────────
      // Giorni lavorativi del mese in cui l'utente NON è assente (né leave overlay
      // né locked-leave). officeBudget = giorni_presente - minSmartDays: è il numero
      // massimo di giorni ufficio che può fare restando sopra il minimo smart.
      const nonWorkingSet = new Set(nonWorkingDates);
      const workingDatesArr = monthDays
        .map((d) => formatDate(d))
        .filter((ds) => !nonWorkingSet.has(ds));

      const userOfficeBudget = new Map<string, number>();
      const userOfficeUsed = new Map<string, number>();
      sortedUsers.forEach((u) => {
        let present = 0;
        for (const ds of workingDatesArr) {
          const key = `${u.id}:${ds}`;
          const absent = !!existingLeaveMap.get(key) || !!lockedMap.get(key)?.leaveType;
          if (!absent) present++;
        }
        userOfficeBudget.set(u.id, Math.max(0, present - minSmartDays));
        userOfficeUsed.set(u.id, 0);
      });

      const newShifts: Array<{ user_id: string; shift_date: string; shift_type: ShiftType; leave_type: LeaveType | null }> = [];

      for (const date of monthDays) {
        const dateStr = formatDate(date);
        const dayOfWeek = date.getDay();
        const dayName = DAY_NAMES[dayOfWeek];
        const isNonWorkingDay = !workDays.includes(dayName) || holidaySet.has(dateStr);

        if (isNonWorkingDay) {
          // Non-working day: skip completely. Only preserve explicitly locked shifts.
          for (const user of sortedUsers) {
            const lockKey = `${user.id}:${dateStr}`;
            if (lockedMap.has(lockKey)) {
              const locked = lockedMap.get(lockKey)!;
              newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: locked.shiftType, leave_type: locked.leaveType });
              if (locked.shiftType === 'smartwork') {
                userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
                userWorkedDays.set(user.id, (userWorkedDays.get(user.id) ?? 0) + 1);
              }
            }
          }
          continue;
        }

        // ── Working day ──────────────────────────────────────────────

        // 1. Which users have a team meeting today?
        const meetingUserIds = new Set<string>();
        sortedUsers.forEach((u) => {
          const ids = u.team_ids?.length ? u.team_ids : (u.team_id ? [u.team_id] : []);
          if (ids.some((tid) => teamMeetingDay.get(tid) === dayName)) {
            meetingUserIds.add(u.id);
          }
        });

        // 2. Count locked-office shifts toward today's capacity.
        //    IMPORTANTE: un locked con base 'office' consuma capienza ANCHE se ha
        //    un overlay ferie/permesso. I permessi possono essere revocati: se non
        //    li contassimo, alla revoca l'ufficio sfonderebbe la capienza. Quindi
        //    prenotiamo comunque il posto.
        let officeCount = 0;
        sortedUsers.forEach((u) => {
          const lockKey = `${u.id}:${dateStr}`;
          const locked = lockedMap.get(lockKey);
          if (locked && locked.shiftType === 'office') {
            officeCount++;
            userOfficeUsed.set(u.id, (userOfficeUsed.get(u.id) ?? 0) + 1);
          }
        });

        // 3. Persist locked shifts. Leave days don't count toward smart-day equity.
        for (const user of sortedUsers) {
          const lockKey = `${user.id}:${dateStr}`;
          if (lockedMap.has(lockKey)) {
            const locked = lockedMap.get(lockKey)!;
            newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: locked.shiftType, leave_type: locked.leaveType });
            if (!locked.leaveType && (locked.shiftType === 'smartwork' || locked.shiftType === 'office')) {
              userWorkedDays.set(user.id, (userWorkedDays.get(user.id) ?? 0) + 1);
              if (locked.shiftType === 'smartwork') {
                userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
              }
            }
          }
        }

        // 4. Split non-locked users into renouncing vs regular
        //    renounce_smart = true → waives smart days, gets highest office priority,
        //    and is excluded from the equity average so they don't inflate it.
        //    Users with an existing leave overlay (ferie/permessi/malattia) are
        //    absent today: they keep their leave record but are excluded from
        //    both assignment and equity so they don't influence who sits in
        //    office or smartwork.
        const unlockedUsers = sortedUsers.filter((u) => !lockedMap.has(`${u.id}:${dateStr}`));
        const onLeaveToday = unlockedUsers.filter((u) => existingLeaveMap.get(`${u.id}:${dateStr}`));
        const workingUnlocked = unlockedUsers.filter((u) => !existingLeaveMap.get(`${u.id}:${dateStr}`));
        const renouncingUnlocked = workingUnlocked.filter((u) => u.renounce_smart);
        const regularUnlocked = workingUnlocked.filter((u) => !u.renounce_smart);

        // Righe di assenza (ferie/permesso/malattia) NON bloccate: la base sotto
        // l'overlay è SEMPRE 'smartwork', mai 'office'. Motivo: il permesso può
        // essere revocato; con base smart la revoca non aggiunge mai un posto in
        // ufficio → capienza sempre rispettata. La base smart dà inoltre credito
        // smart "equità" mostrato nei totali (giorni smart anche in ferie).
        // Non tocca i contatori di equità (l'utente è assente).
        for (const user of onLeaveToday) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          newShifts.push({
            user_id: user.id,
            shift_date: dateStr,
            shift_type: 'smartwork',
            leave_type: existingLeave,
          });
        }

        // 5. Frazione smart media (proporzionale alla presenza), calcolata sul
        //    pool regular presente. È il rapporto smart/lavorati aggregato: si
        //    autoregola verso l'equilibrio imposto dalla capienza ufficio.
        //    Fallback 0.5 finché nessuno ha ancora lavorato (inizio mese).
        const poolSmart  = regularUnlocked.reduce((s, u) => s + (userSmartDays.get(u.id) ?? 0), 0);
        const poolWorked = regularUnlocked.reduce((s, u) => s + (userWorkedDays.get(u.id) ?? 0), 0);
        const targetSmartFrac = poolWorked > 0 ? poolSmart / poolWorked : 0.5;

        // 6. Score each regular user for office assignment (higher = more office priority)
        //    Equity is primary: chi ha PIÙ smart del proprio target proporzionale
        //    (giorni_lavorati × frazione media) va spinto in ufficio. Il target è
        //    scalato sulla presenza, quindi un rientro da ferie non "recupera"
        //    smart: ha pochi giorni lavorati → target basso → nessun surplus.
        const getPref = (userId: string): PreferenceType =>
          prefMap.get(`${userId}:${dateStr}`) ?? 'indifferent';

        const scoreUser = (user: User): number => {
          // 1. EQUITÀ — primaria, proporzionale ai giorni lavorati
          const smartDays  = userSmartDays.get(user.id) ?? 0;
          const workedDays = userWorkedDays.get(user.id) ?? 0;
          const expectedSmart = workedDays * targetSmartFrac;
          // surplus smart rispetto al proprio target → priorità ufficio
          const equityScore = (smartDays - expectedSmart) * EQUITY_WEIGHT;

          // 2. RIUNIONE — quasi-garantisce ufficio (10 punti >> qualsiasi altro termine)
          const meetingBonus = meetingUserIds.has(user.id) ? MEETING_BONUS : 0;

          // 3. SENIORITY — peso reale, non semplice tiebreaker.
          //    Il più senior (index 0) prende SENIORITY_BONUS pieno,
          //    il meno senior (index N-1) prende ~0. Scala lineare.
          const idx = seniorityIndex.get(user.id) ?? 0;
          const seniorityScore = ((regularCount - 1 - idx) / Math.max(regularCount - 1, 1)) * SENIORITY_BONUS;

          // 4. PREFERENZA giornaliera (home/office/indifferente)
          const pref = getPref(user.id);
          const prefScore = pref === 'office'
            ? PREF_OFFICE_SCORE
            : pref === 'indifferent'
            ? PREF_INDIFF_SCORE
            : 0; // home = 0

          // 5. STILE (stable/random) — subordinato a tutto il resto.
          //    ±0.8 non può battere meeting (10) né seniority (0–2).
          let styleScore = 0;
          if (user.schedule_style === 'stable') {
            if (userOfficeWeekdays.get(user.id)?.has(dayOfWeek)) {
              styleScore = +STABLE_WEEKDAY_BONUS;
            } else if (userSmartWeekdays.get(user.id)?.has(dayOfWeek)) {
              styleScore = -STABLE_WEEKDAY_BONUS;
            }
          } else {
            styleScore = (Math.random() - 0.5) * RANDOM_JITTER;
          }

          // 6. RANDOM SETTIMANALE — piccolo, dipende dalla settimana del mese.
          //    Stabile entro la settimana (seed = utente+mese+settimana), varia tra
          //    settimane: ogni tanto la composizione ufficio cambia e gente che di
          //    norma non si incrocia finisce insieme. ±0.3 → tiebreaker, non batte
          //    equità/riunione/seniority.
          const weekOfMonth = Math.ceil(date.getDate() / 7);
          const weeklyMix =
            (seededUnit(`${user.id}:${year}-${month}:w${weekOfMonth}`) - 0.5) * WEEKLY_MIX_JITTER;

          // 7. MIX ANZIANITÀ — piccolissimo. A parità, alterna quale metà
          //    (senior/junior) riceve un micro-nudge verso l'ufficio a seconda
          //    della settimana, così i turni ufficio mescolano anziani e giovani
          //    invece di raggrupparli (la seniority da sola tende a riempire
          //    l'ufficio di senior). idx 0 = più senior.
          const isSenior = idx < regularCount / 2;
          const seniorityMix = ((weekOfMonth % 2 === 0) === isSenior) ? SENIORITY_MIX : 0;

          return equityScore + meetingBonus + seniorityScore + prefScore + styleScore + weeklyMix + seniorityMix;
        };

        regularUnlocked.sort((a, b) => scoreUser(b) - scoreUser(a));

        // 7. Assign renouncing users first (office if capacity, else smart).
        //    Rinunciano allo smart → nessun budget/minimo smart per loro.
        for (const user of renouncingUnlocked) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          const type: ShiftType = officeCount < maxCapacity ? 'office' : 'smartwork';
          newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: type, leave_type: existingLeave });
          if (type === 'office') {
            officeCount++;
            userOfficeUsed.set(user.id, (userOfficeUsed.get(user.id) ?? 0) + 1);
          } else {
            // Capacity forced them into smart — still track, but they're outside the equity pool
            userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
          }
        }

        // 8. Assegna i regular con DUE vincoli oltre lo score:
        //    • cap per-persona: max officeBudget giorni ufficio (garantisce ≥ minSmartDays smart)
        //    • capienza giornaliera: officeCount ∈ [minOfficePerDay, maxCapacity]
        //
        //    Pass 1 — greedy per score: ufficio ai migliori CHE HANNO ancora budget,
        //    fino a maxCapacity. Chi ha esaurito il budget va in smart anche se ci
        //    sarebbe posto (così l'ufficio NON si riempie per forza al massimo e
        //    tutti maturano il minimo smart).
        const regDecision = new Map<string, ShiftType>();
        for (const user of regularUnlocked) {
          const used = userOfficeUsed.get(user.id) ?? 0;
          const budget = userOfficeBudget.get(user.id) ?? 0;
          if (officeCount < maxCapacity && used < budget) {
            regDecision.set(user.id, 'office');
            officeCount++;
            userOfficeUsed.set(user.id, used + 1);
          } else {
            regDecision.set(user.id, 'smartwork');
          }
        }

        //    Pass 2 — copertura minima: se l'ufficio è sotto il floor, promuovi a
        //    ufficio i regular con score più alto tra quelli in smart (sforando il
        //    loro budget smart), finché raggiungi minOfficePerDay o finiscono i
        //    candidati. Garantisce che se c'è almeno un regular assegnabile ci sia
        //    ≥ 1 persona in ufficio (floor ≥ 1), ANCHE a costo di non dare a
        //    qualcuno lo smart minimo. I renounce_smart, assegnati prima, coprono
        //    già il floor quando presenti.
        if (officeCount < minOfficePerDay) {
          for (const user of regularUnlocked) {
            if (officeCount >= minOfficePerDay) break;
            if (regDecision.get(user.id) === 'smartwork') {
              regDecision.set(user.id, 'office');
              officeCount++;
              userOfficeUsed.set(user.id, (userOfficeUsed.get(user.id) ?? 0) + 1);
            }
          }
        }

        //    Persist + contatori equità/pattern
        for (const user of regularUnlocked) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          const type = regDecision.get(user.id)!;
          newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: type, leave_type: existingLeave });
          userWorkedDays.set(user.id, (userWorkedDays.get(user.id) ?? 0) + 1);
          if (type === 'office') {
            if (user.schedule_style === 'stable') {
              userOfficeWeekdays.get(user.id)?.add(dayOfWeek);
            }
          } else {
            userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
            if (user.schedule_style === 'stable') {
              userSmartWeekdays.get(user.id)?.add(dayOfWeek);
            }
          }
        }
      }

      log.info('generateMonthlySchedule', `Preparati ${newShifts.length} turni`, {
        users: sortedUsers.length,
        days: monthDays.length,
        locked: lockedMap.size,
        smartDistribution: Object.fromEntries(
          [...userSmartDays.entries()].map(([id, n]) => [
            sortedUsers.find((u) => u.id === id)?.full_name ?? id,
            n,
          ]),
        ),
      });

      const created = await shiftsAPI.bulkUpsertShifts(newShifts);
      return created;
    });
  },

  async rebalanceSchedule(year: number, month: number): Promise<void> {
    return log.withTiming('rebalanceSchedule', { year, month }, async () => {
      const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
      const allShifts = await shiftsAPI.getMonthShifts(year, month);
      const allUsers = await usersAPI.getAllUsers();

      const shiftsByDate: Record<string, any[]> = {};
      allShifts.forEach((shift) => {
        if (!shiftsByDate[shift.shift_date]) shiftsByDate[shift.shift_date] = [];
        shiftsByDate[shift.shift_date].push(shift);
      });

      let movedCount = 0;

      for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
        // Absences (ferie/permessi/malattia, via overlay or legacy shift_type)
        // don't occupy the office
        const officeShifts = dayShifts.filter(isOfficePresence);

        if (officeShifts.length <= maxCapacity) continue;

        const overflow = officeShifts.length - maxCapacity;
        log.warn('rebalanceSchedule', `${dateStr}: overflow di ${overflow} persone`, {
          office: officeShifts.length,
          max: maxCapacity,
        });

        // Sort by seniority (least senior first → they get moved)
        const sorted = officeShifts.sort((a: any, b: any) => {
          const aUser = allUsers.find((u) => u.id === a.user_id);
          const bUser = allUsers.find((u) => u.id === b.user_id);
          if (!aUser || !bUser) return 0;
          return getSeniorityDays(aUser.seniority_date) - getSeniorityDays(bUser.seniority_date);
        });

        for (let i = 0; i < overflow; i++) {
          const shift = sorted[i];
          if (!shift.locked) {
            await shiftsAPI.upsertShift(shift.user_id, dateStr, 'smartwork');
            movedCount++;
          } else {
            log.warn('rebalanceSchedule', `Turno bloccato, non spostato`, {
              userId: shift.user_id,
              date: dateStr,
            });
          }
        }
      }

      log.info('rebalanceSchedule', `Ribilanciamento completato: ${movedCount} turni spostati`);
    });
  },

  async validateSchedule(year: number, month: number): Promise<string[]> {
    return log.withTiming('validateSchedule', { year, month }, async () => {
      const errors: string[] = [];
      const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
      const allShifts = await shiftsAPI.getMonthShifts(year, month);

      const shiftsByDate: Record<string, any[]> = {};
      allShifts.forEach((shift) => {
        if (!shiftsByDate[shift.shift_date]) shiftsByDate[shift.shift_date] = [];
        shiftsByDate[shift.shift_date].push(shift);
      });

      for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
        const officeCount = dayShifts.filter(isOfficePresence).length;
        if (officeCount > maxCapacity) {
          const msg = `${dateStr}: Capienza superata (${officeCount}/${maxCapacity})`;
          errors.push(msg);
        }
      }

      if (errors.length > 0) {
        log.warn('validateSchedule', `${errors.length} problemi trovati`, { errors });
      } else {
        log.info('validateSchedule', 'Schedule valido, nessun problema');
      }
      return errors;
    });
  },
};
