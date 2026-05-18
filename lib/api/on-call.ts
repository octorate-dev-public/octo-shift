import { supabase } from '../supabase';
import { OnCallAssignment, OnCallDailyAssignment } from '@/types';
import { formatDate, getWeekStart } from '../utils';
import { createLogger, toAppError } from '../logger';

const log = createLogger('onCallAPI');

export const onCallAPI = {
  async getWeekOnCall(weekStartDate: string): Promise<OnCallAssignment[]> {
    return log.withTiming('getWeekOnCall', { weekStartDate }, async () => {
      const { data, error } = await supabase
        .from('on_call_assignments')
        .select('*')
        .eq('week_start_date', weekStartDate);

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità della settimana');
      return data || [];
    });
  },

  async getOnCallForDate(date: string) {
    return log.withTiming('getOnCallForDate', { date }, async () => {
      // 1. Controlla prima la tabella giornaliera (nuova)
      const { data: daily, error: dailyErr } = await supabase
        .from('on_call_daily_assignments')
        .select('*, users:user_id(id, full_name, email)')
        .eq('assignment_date', date)
        .maybeSingle();

      if (!dailyErr && daily) {
        // Normalizza verso la stessa forma che si aspetta il client
        // (week_start_date / week_end_date vengono calcolati dal blocco corrente)
        const d = new Date(date);
        const dow = d.getDay();
        const mon = new Date(d);
        mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);

        const result = [{
          ...daily,
          user: daily.users,
          week_start_date: formatDate(mon),
          week_end_date: formatDate(sun),
        }];
        log.info('getOnCallForDate', 'Trovato 1 reperibile (daily)', { date });
        return result;
      }

      // 2. Fallback: tabella settimanale legacy
      const startDate = formatDate(getWeekStart(new Date(date)));
      const { data, error } = await supabase
        .from('on_call_assignments')
        .select('*, users:user_id(id, full_name, email)')
        .eq('week_start_date', startDate);

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità di oggi');
      const result = (data || []).map((item: any) => ({ ...item, user: item.users }));
      log.info('getOnCallForDate', `Trovati ${result.length} reperibili (weekly fallback)`, { date, startDate });
      return result;
    });
  },

  async getMonthOnCall(year: number, month: number): Promise<OnCallAssignment[]> {
    return log.withTiming('getMonthOnCall', { year, month }, async () => {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      const { data, error } = await supabase
        .from('on_call_assignments')
        .select('*')
        .gte('week_start_date', formatDate(startDate))
        .lte('week_end_date', formatDate(endDate));

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità del mese');
      return data || [];
    });
  },

  async createOnCallAssignment(userId: string, weekStartDate: string): Promise<OnCallAssignment> {
    return log.withTiming('createOnCallAssignment', { userId, weekStartDate }, async () => {
      const startDate = new Date(weekStartDate);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      const { data, error } = await supabase
        .from('on_call_assignments')
        .insert({
          user_id: userId,
          week_start_date: weekStartDate,
          week_end_date: formatDate(endDate),
        })
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile creare il turno di reperibilità');
      return data;
    });
  },

  async updateOnCallAssignment(assignmentId: string, userId: string): Promise<OnCallAssignment> {
    return log.withTiming('updateOnCallAssignment', { assignmentId, userId }, async () => {
      const { data, error } = await supabase
        .from('on_call_assignments')
        .update({ user_id: userId })
        .eq('id', assignmentId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile aggiornare la reperibilità');
      return data;
    });
  },

  async deleteOnCallAssignment(assignmentId: string): Promise<void> {
    return log.withTiming('deleteOnCallAssignment', { assignmentId }, async () => {
      const { error } = await supabase
        .from('on_call_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw toAppError(error, 'Impossibile eliminare la reperibilità');
    });
  },

  async generateMonthOnCall(
    year: number,
    month: number,
    userIds: string[],
  ): Promise<OnCallAssignment[]> {
    return log.withTiming('generateMonthOnCall', { year, month, usersCount: userIds.length }, async () => {
      if (userIds.length === 0) {
        log.warn('generateMonthOnCall', 'Nessun utente fornito per la rotazione on-call');
        return [];
      }

      const assignments: OnCallAssignment[] = [];
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0);

      let currentDate = getWeekStart(startDate);
      let userIndex = 0;

      while (currentDate <= endDate) {
        const userId = userIds[userIndex % userIds.length];

        const assignment = await this.createOnCallAssignment(userId, formatDate(currentDate));
        assignments.push(assignment);

        userIndex++;
        currentDate.setDate(currentDate.getDate() + 7);
      }

      log.info('generateMonthOnCall', `Generati ${assignments.length} turni on-call per ${month}/${year}`);
      return assignments;
    });
  },

  async getOnCallUsers(): Promise<any[]> {
    return log.withTiming('getOnCallUsers', {}, async () => {
      const { data, error } = await supabase
        .from('on_call_assignments')
        .select('user_id, users:user_id(id, full_name, email)');

      if (error) throw toAppError(error, 'Impossibile caricare gli utenti in rotazione on-call');

      // Deduplicate by user_id
      const seen = new Set<string>();
      return (data || []).filter((row: any) => {
        if (seen.has(row.user_id)) return false;
        seen.add(row.user_id);
        return true;
      });
    });
  },

  // ─────────────────────────────────────────────
  // DAILY ASSIGNMENTS (matrice annuale)
  // ─────────────────────────────────────────────

  /** Recupera le assegnazioni giornaliere di un mese specifico (join con users). */
  async getMonthDailyOnCall(year: number, month: number): Promise<(OnCallDailyAssignment & { user?: any })[]> {
    return log.withTiming('getMonthDailyOnCall', { year, month }, async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('on_call_daily_assignments')
        .select('*, users:user_id(id, full_name, email)')
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate)
        .order('assignment_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità del mese');
      return (data || []).map((item: any) => ({ ...item, user: item.users }));
    });
  },

  /** Recupera tutte le assegnazioni giornaliere di un anno. */
  async getYearDailyOnCall(year: number): Promise<OnCallDailyAssignment[]> {
    return log.withTiming('getYearDailyOnCall', { year }, async () => {
      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      const { data, error } = await supabase
        .from('on_call_daily_assignments')
        .select('*')
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate)
        .order('assignment_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità annuale');
      return data || [];
    });
  },

  /** Recupera l'assegnazione giornaliera per una data specifica (join con users). */
  async getDailyOnCallForDate(date: string): Promise<(OnCallDailyAssignment & { user?: any }) | null> {
    return log.withTiming('getDailyOnCallForDate', { date }, async () => {
      const { data, error } = await supabase
        .from('on_call_daily_assignments')
        .select('*, users:user_id(id, full_name, email)')
        .eq('assignment_date', date)
        .maybeSingle();

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità del giorno');
      if (!data) return null;
      return { ...data, user: data.users };
    });
  },

  /**
   * Genera le assegnazioni giornaliere per un intero anno.
   * Regole:
   *  - Blocchi di 7 giorni (lun–dom).
   *  - Round-robin tra utenti con on_call_available = true.
   *  - Se l'utente ha ferie (leave_type = 'vacation') per ≥ 4 giorni della settimana, viene saltato.
   *  - Massimo 7 giorni consecutivi per blocco (garantito dalla struttura a blocchi).
   *  - Cancella e ricrea le assegnazioni per l'anno specificato.
   */
  async generateAnnualOnCall(
    year: number,
    userIds: string[],
  ): Promise<OnCallDailyAssignment[]> {
    return log.withTiming('generateAnnualOnCall', { year, usersCount: userIds.length }, async () => {
      if (userIds.length === 0) {
        log.warn('generateAnnualOnCall', 'Nessun utente disponibile per la rotazione');
        return [];
      }

      const startDate = `${year}-01-01`;
      const endDate = `${year}-12-31`;

      // 1. Carica tutte le ferie (vacation) per l'anno
      const { data: vacationShifts, error: vErr } = await supabase
        .from('shifts')
        .select('user_id, shift_date')
        .eq('leave_type', 'vacation')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate);

      if (vErr) throw toAppError(vErr, 'Impossibile caricare le ferie per la generazione');

      // Mappa: userId → Set<YYYY-MM-DD>
      const vacationMap = new Map<string, Set<string>>();
      for (const s of vacationShifts || []) {
        if (!vacationMap.has(s.user_id)) vacationMap.set(s.user_id, new Set());
        vacationMap.get(s.user_id)!.add(s.shift_date);
      }

      // 2. Costruisci la lista dei blocchi settimanali per l'anno
      //    Primo lunedì dell'anno (o 1 gen se è lunedì)
      const firstDay = new Date(year, 0, 1);
      // Trova il primo lunedì: getDay() 0=dom,1=lun,...,6=sab
      const dayOfWeek = firstDay.getDay(); // 0=dom
      // Differenza per arrivare al lunedì precedente (o lo stesso giorno se è lun)
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const firstMonday = new Date(year, 0, 1 + daysToMonday);

      const lastDay = new Date(year, 11, 31);

      const weeks: Array<{ start: Date; end: Date; dates: string[] }> = [];
      let cursor = new Date(firstMonday);

      while (cursor <= lastDay) {
        const weekStart = new Date(cursor);
        const weekDates: string[] = [];
        for (let d = 0; d < 7; d++) {
          const dd = new Date(cursor);
          dd.setDate(dd.getDate() + d);
          const ds = formatDate(dd);
          // Includi solo date che appartengono all'anno target
          if (ds >= startDate && ds <= endDate) {
            weekDates.push(ds);
          }
        }
        if (weekDates.length > 0) {
          const weekEnd = new Date(cursor);
          weekEnd.setDate(weekEnd.getDate() + 6);
          weeks.push({ start: weekStart, end: weekEnd, dates: weekDates });
        }
        cursor.setDate(cursor.getDate() + 7);
      }

      // 3. Elimina le assegnazioni esistenti per l'anno
      const { error: delErr } = await supabase
        .from('on_call_daily_assignments')
        .delete()
        .gte('assignment_date', startDate)
        .lte('assignment_date', endDate);

      if (delErr) throw toAppError(delErr, 'Impossibile eliminare le assegnazioni esistenti');

      // 4. Assegna utenti in round-robin, saltando chi è in ferie per ≥ 4 giorni della settimana
      const rows: Array<{ user_id: string; assignment_date: string }> = [];
      let userIndex = 0;

      for (const week of weeks) {
        // Cerca l'utente disponibile a partire dalla posizione corrente
        let assigned = false;
        for (let attempt = 0; attempt < userIds.length; attempt++) {
          const uid = userIds[(userIndex + attempt) % userIds.length];
          const userVacations = vacationMap.get(uid) ?? new Set<string>();
          const vacationDaysInWeek = week.dates.filter((d) => userVacations.has(d)).length;

          // Se l'utente ha ferie per ≥ 4 giorni della settimana, salta
          if (vacationDaysInWeek >= 4) continue;

          // Assegna tutti i giorni della settimana a questo utente
          for (const date of week.dates) {
            rows.push({ user_id: uid, assignment_date: date });
          }
          userIndex = (userIndex + attempt + 1) % userIds.length;
          assigned = true;
          break;
        }

        // Se nessun utente è disponibile (tutti in ferie), assegna comunque al successivo in lista
        if (!assigned) {
          const uid = userIds[userIndex % userIds.length];
          for (const date of week.dates) {
            rows.push({ user_id: uid, assignment_date: date });
          }
          userIndex = (userIndex + 1) % userIds.length;
        }
      }

      // 5. Inserisci in batch
      const BATCH = 100;
      const all: OnCallDailyAssignment[] = [];
      for (let i = 0; i < rows.length; i += BATCH) {
        const { data, error } = await supabase
          .from('on_call_daily_assignments')
          .insert(rows.slice(i, i + BATCH))
          .select();
        if (error) throw toAppError(error, 'Errore nell\'inserimento delle assegnazioni');
        all.push(...(data || []));
      }

      log.info('generateAnnualOnCall', `Generati ${all.length} giorni di reperibilità per ${year}`);
      return all;
    });
  },

  /** Riassegna un singolo giorno a un nuovo utente. */
  async reassignDay(date: string, newUserId: string): Promise<OnCallDailyAssignment> {
    return log.withTiming('reassignDay', { date, newUserId }, async () => {
      const { data, error } = await supabase
        .from('on_call_daily_assignments')
        .upsert(
          { user_id: newUserId, assignment_date: date },
          { onConflict: 'assignment_date' },
        )
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile riassegnare il giorno di reperibilità');
      return data;
    });
  },

  /**
   * Scambia le assegnazioni di due intervalli di date tra due utenti.
   * Utile per swap di blocchi interi (es. settimana A con settimana B).
   */
  async swapDayRanges(
    userId1: string,
    dates1: string[],
    userId2: string,
    dates2: string[],
  ): Promise<void> {
    return log.withTiming('swapDayRanges', { userId1, userId2, count1: dates1.length, count2: dates2.length }, async () => {
      // Aggiorna range 1 → userId2
      const rows1 = dates1.map((d) => ({ assignment_date: d, user_id: userId2 }));
      // Aggiorna range 2 → userId1
      const rows2 = dates2.map((d) => ({ assignment_date: d, user_id: userId1 }));

      const allRows = [...rows1, ...rows2];
      const { error } = await supabase
        .from('on_call_daily_assignments')
        .upsert(allRows, { onConflict: 'assignment_date' });

      if (error) throw toAppError(error, 'Impossibile effettuare lo scambio di reperibilità');
    });
  },

  /** Elimina tutte le assegnazioni giornaliere di un anno. */
  async clearYearDailyOnCall(year: number): Promise<void> {
    return log.withTiming('clearYearDailyOnCall', { year }, async () => {
      const { error } = await supabase
        .from('on_call_daily_assignments')
        .delete()
        .gte('assignment_date', `${year}-01-01`)
        .lte('assignment_date', `${year}-12-31`);

      if (error) throw toAppError(error, 'Impossibile eliminare le assegnazioni annuali');
    });
  },
};
