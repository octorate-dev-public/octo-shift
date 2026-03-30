import { shiftsAPI } from './shifts';
import { usersAPI } from './users';
import { settingsAPI } from './settings';
import { preferencesAPI } from './preferences';
import { getMonthDays, getSeniorityDays, formatDate } from '../utils';
import { User, Shift, ShiftType, PreferenceType } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('schedulingAPI');

export const schedulingAPI = {
  /**
   * Generate the monthly schedule respecting:
   *  1. Max office capacity
   *  2. Team meeting days → team members get office priority
   *  3. Seniority → when capacity overflows on meeting days the most-senior stay
   *  4. Locked shifts are never touched
   *  5. Weekends → everyone smartwork
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
      const lockedMap = new Map<string, ShiftType>(); // key = `userId:date`
      existingShifts.forEach((s) => {
        if (s.locked) lockedMap.set(`${s.user_id}:${s.shift_date}`, s.shift_type);
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

      // Seniority index for stable tiebreaking when smart days are equal
      const seniorityIndex = new Map<string, number>();
      sortedUsers.forEach((u, i) => seniorityIndex.set(u.id, i));

      // Running smart-day counter per user — drives fairness across the month
      const userSmartDays = new Map<string, number>();
      sortedUsers.forEach((u) => userSmartDays.set(u.id, 0));

      // Load user preferences for this month
      const monthYearStr = `${year}-${String(month).padStart(2, '0')}`;
      const allPreferences = await preferencesAPI.getAllMonthPreferences(monthYearStr);
      // Build preference map: `userId:date` → preference
      const prefMap = new Map<string, PreferenceType>();
      allPreferences.forEach((p) => prefMap.set(`${p.user_id}:${p.preference_date}`, p.preference));
      log.info('generateMonthlySchedule', `Caricate ${allPreferences.length} preferenze utente`);

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

      const newShifts: Array<{ user_id: string; shift_date: string; shift_type: ShiftType }> = [];

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
              const lockedType = lockedMap.get(lockKey)!;
              newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: lockedType });
              // Locked smart on a non-working day still counts for the balance
              if (lockedType === 'smartwork') {
                userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
              }
            }
          }
          continue;
        }

        // ---- Working day logic ----

        // 1. Determine which users have their team meeting today
        const meetingUserIds = new Set<string>();
        sortedUsers.forEach((u) => {
          const ids = u.team_ids?.length ? u.team_ids : (u.team_id ? [u.team_id] : []);
          if (ids.some((tid) => teamMeetingDay.get(tid) === dayName)) {
            meetingUserIds.add(u.id);
          }
        });

        // 2. Count already-locked office shifts for capacity
        let officeCount = 0;
        sortedUsers.forEach((u) => {
          const lockKey = `${u.id}:${dateStr}`;
          if (lockedMap.has(lockKey) && lockedMap.get(lockKey) === 'office') officeCount++;
        });

        // 3. Build ordered list considering preferences:
        //    Priority tiers (higher = assigned to office first):
        //    a) Meeting day users who prefer office (or indifferent)
        //    b) Non-meeting users who prefer office
        //    c) Meeting day users who are indifferent
        //    d) Non-meeting indifferent users (fairness sort: most smart days first, seniority tiebreak)
        //    e) Users who prefer home (assigned to smartwork unless capacity allows)
        //
        //    Within each tier: seniority breaks ties.

        const getPref = (userId: string): PreferenceType =>
          prefMap.get(`${userId}:${dateStr}`) ?? 'indifferent';

        // Separate into preference groups
        const wantsOffice: User[] = [];
        const indifferentMeeting: User[] = [];
        const indifferentOther: User[] = [];
        const wantsHome: User[] = [];

        for (const user of sortedUsers) {
          if (lockedMap.has(`${user.id}:${dateStr}`)) continue; // handled separately
          const pref = getPref(user.id);
          const hasMeeting = meetingUserIds.has(user.id);

          if (pref === 'office') {
            wantsOffice.push(user);
          } else if (pref === 'home') {
            wantsHome.push(user);
          } else if (hasMeeting) {
            indifferentMeeting.push(user);
          } else {
            indifferentOther.push(user);
          }
        }

        // Sort indifferentOther by fairness (most smart days → office priority), seniority tiebreak
        indifferentOther.sort((a, b) => {
          const diff = (userSmartDays.get(b.id) ?? 0) - (userSmartDays.get(a.id) ?? 0);
          if (diff !== 0) return diff;
          return (seniorityIndex.get(a.id) ?? 0) - (seniorityIndex.get(b.id) ?? 0);
        });

        // When wantsOffice has more people than remaining capacity, seniority decides who gets in
        // (already sorted by seniority via sortedUsers order)

        // Final order: office-preferring first, then meeting-indifferent, then other-indifferent, then home-preferring
        const officeFirst = [...wantsOffice, ...indifferentMeeting, ...indifferentOther, ...wantsHome];

        // 4. Handle locked shifts first
        for (const user of sortedUsers) {
          const lockKey = `${user.id}:${dateStr}`;
          if (lockedMap.has(lockKey)) {
            const lockedType = lockedMap.get(lockKey)!;
            newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: lockedType });
            if (lockedType === 'smartwork') {
              userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
            }
          }
        }

        // 5. Assign non-locked users respecting preference order
        for (const user of officeFirst) {
          const pref = getPref(user.id);

          // If user wants home and there are still office slots → assign smartwork anyway
          // (unless everyone who wants office is already assigned and capacity remains)
          if (pref === 'home') {
            // Honour home preference: assign smartwork
            newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: 'smartwork' });
            userSmartDays.set(user.id, (userSmartDays.get(user.id) ?? 0) + 1);
            continue;
          }

          const type: ShiftType = officeCount < maxCapacity ? 'office' : 'smartwork';
          newShifts.push({ user_id: user.id, shift_date: dateStr, shift_type: type });
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
        const officeShifts = dayShifts.filter((s) => s.shift_type === 'office');

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
        const officeCount = dayShifts.filter((s) => s.shift_type === 'office').length;
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
