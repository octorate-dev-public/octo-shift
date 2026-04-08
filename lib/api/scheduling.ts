import { shiftsAPI } from './shifts';
import { usersAPI } from './users';
import { settingsAPI } from './settings';
import { preferencesAPI } from './preferences';
import { getMonthDays, getSeniorityDays, formatDate } from '../utils';
import { User, Shift, ShiftType, LeaveType, PreferenceType } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('schedulingAPI');

export const schedulingAPI = {
  /**
   * Generate the monthly schedule respecting:
   *  1. Max office capacity
   *  2. Locked shifts are never touched
   *  3. Weekends/holidays → skipped
   *  4. renounce_smart users → always office first (excluded from equity pool)
   *  5. Equity-first: users with more accumulated smart days than the running
   *     average get higher office priority, ensuring equitable distribution
   *     regardless of daily preferences
   *  6. Preferences (home/office/indifferent) act as secondary score modifiers
   *  7. Team meeting days add office priority
   *  8. Seniority is the final tiebreaker
   */
  async generateMonthlySchedule(year: number, month: number): Promise<Shift[]> {
    return log.withTiming('generateMonthlySchedule', { year, month }, async () => {
      const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
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
      // Also track existing leave_type for ALL shifts (not just locked) so we preserve them
      const existingLeaveMap = new Map<string, LeaveType | null>();
      existingShifts.forEach((s) => {
        const key = `${s.user_id}:${s.shift_date}`;
        if (s.locked) lockedMap.set(key, { shiftType: s.shift_type, leaveType: s.leave_type });
        if (s.leave_type) existingLeaveMap.set(key, s.leave_type);
      });
      log.info('generateMonthlySchedule', `Trovati ${lockedMap.size} turni bloccati da preservare`);

      const { supabase } = await import('../supabase');

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

      // Load user preferences for this month
      const monthYearStr = `${year}-${String(month).padStart(2, '0')}`;
      const allPreferences = await preferencesAPI.getAllMonthPreferences(monthYearStr);
      const prefMap = new Map<string, PreferenceType>();
      allPreferences.forEach((p) => prefMap.set(`${p.user_id}:${p.preference_date}`, p.preference));
      log.info('generateMonthlySchedule', `Caricate ${allPreferences.length} preferenze utente`);

      // Scoring weights for equity-first office assignment:
      //   equity term: each smart day above average is worth EQUITY_WEIGHT priority points
      //   preference term: office preference worth ~2 smart-days of priority over home
      //   meeting term: meeting day worth ~1.5 smart-days of priority
      const EQUITY_WEIGHT = 2;
      const MEETING_BONUS = 3;
      const PREF_OFFICE_SCORE = 4;
      const PREF_INDIFF_SCORE = 2;
      // home preference = 0 (no office bonus)

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
        //    Shifts with a leave overlay (ferie/permessi/malattia) are absences
        //    and do NOT consume office capacity.
        let officeCount = 0;
        sortedUsers.forEach((u) => {
          const lockKey = `${u.id}:${dateStr}`;
          const locked = lockedMap.get(lockKey);
          if (locked && locked.shiftType === 'office' && !locked.leaveType) officeCount++;
        });

        // 3. Persist locked shifts. Leave days don't count toward smart-day equity.
        for (const user of sortedUsers) {
          const lockKey = `${user.id}:${dateStr}`;
          if (lockedMap.has(lockKey)) {
            const locked = lockedMap.get(lockKey)!;
            newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: locked.shiftType, leave_type: locked.leaveType });
            if (locked.shiftType === 'smartwork' && !locked.leaveType) {
              userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
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

        // Preserve absence rows without touching office/smart counts.
        // We keep their previous shift_type if any, otherwise default to smartwork
        // (purely cosmetic — it does not count toward totals).
        for (const user of onLeaveToday) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          const prevType = existingShifts.find(
            (s) => s.user_id === user.id && s.shift_date === dateStr,
          )?.shift_type ?? 'smartwork';
          newShifts.push({
            user_id: user.id,
            shift_date: dateStr,
            shift_type: prevType,
            leave_type: existingLeave,
          });
        }

        // 5. Compute running equity average over regular (non-renouncing) users only
        const avgSmartDays = regularUnlocked.length > 0
          ? regularUnlocked.reduce((sum, u) => sum + (userSmartDays.get(u.id) ?? 0), 0) / regularUnlocked.length
          : 0;

        // 6. Score each regular user for office assignment (higher = more office priority)
        //    Equity is primary: surplus smart days above average push toward office.
        //    Preference is secondary: can shift priority by ~1–2 smart-days worth,
        //    so home users get corrected once they're ~2 days above average.
        const getPref = (userId: string): PreferenceType =>
          prefMap.get(`${userId}:${dateStr}`) ?? 'indifferent';

        const scoreUser = (user: User): number => {
          const smartDays = userSmartDays.get(user.id) ?? 0;
          const equityScore = (smartDays - avgSmartDays) * EQUITY_WEIGHT;
          const meetingBonus = meetingUserIds.has(user.id) ? MEETING_BONUS : 0;
          const pref = getPref(user.id);
          const prefScore = pref === 'office' ? PREF_OFFICE_SCORE : pref === 'indifferent' ? PREF_INDIFF_SCORE : 0;
          const seniorityTiebreak = -(seniorityIndex.get(user.id) ?? 0) * 0.01;
          return equityScore + meetingBonus + prefScore + seniorityTiebreak;
        };

        regularUnlocked.sort((a, b) => scoreUser(b) - scoreUser(a));

        // 7. Assign renouncing users first (office if capacity, else smart)
        for (const user of renouncingUnlocked) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          const type: ShiftType = officeCount < maxCapacity ? 'office' : 'smartwork';
          newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: type, leave_type: existingLeave });
          if (type === 'office') {
            officeCount++;
          } else {
            // Capacity forced them into smart — still track, but they're outside the equity pool
            userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
          }
        }

        // 8. Assign regular users by equity score (top scorers → office)
        for (const user of regularUnlocked) {
          const existingLeave = existingLeaveMap.get(`${user.id}:${dateStr}`) ?? null;
          const type: ShiftType = officeCount < maxCapacity ? 'office' : 'smartwork';
          newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: type, leave_type: existingLeave });
          if (type === 'office') {
            officeCount++;
          } else {
            userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
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
        // Shifts with a leave overlay are absences and don't occupy the office
        const officeShifts = dayShifts.filter((s) => s.shift_type === 'office' && !s.leave_type);

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
        const officeCount = dayShifts.filter((s) => s.shift_type === 'office' && !s.leave_type).length;
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
