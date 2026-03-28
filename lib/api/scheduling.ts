import { shiftsAPI } from './shifts';
import { usersAPI } from './users';
import { settingsAPI } from './settings';
import { getMonthDays, getSeniorityDays } from '../utils';
import { User, Shift, ShiftType } from '@/types';

export const schedulingAPI = {
  // Generate monthly schedule with rules
  async generateMonthlySchedule(year: number, month: number): Promise<Shift[]> {
    // Get all settings
    const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
    const allUsers = await usersAPI.getAllUsers();

    // Sort users by seniority (most senior first)
    const sortedUsers = allUsers.sort((a, b) => {
      const aDays = getSeniorityDays(a.seniority_date);
      const bDays = getSeniorityDays(b.seniority_date);
      return bDays - aDays;
    });

    const shifts: Shift[] = [];
    const monthDays = getMonthDays(year, month);
    const officeCountByDay: Record<string, number> = {};

    // Initialize office count
    monthDays.forEach((date) => {
      const dateStr = date.toISOString().split('T')[0];
      officeCountByDay[dateStr] = 0;
    });

    // For each day in month
    for (const date of monthDays) {
      const dateStr = date.toISOString().split('T')[0];
      const dayOfWeek = date.getDay();
      const dayName = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][dayOfWeek];

      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        // Assign smartwork for weekends
        for (const user of sortedUsers) {
          shifts.push({
            id: '', // Will be assigned by DB
            user_id: user.id,
            shift_date: dateStr,
            shift_type: 'smartwork',
            locked: false,
            locked_by: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
        continue;
      }

      // Get users with team meetings on this day
      const meetingUsers = sortedUsers.filter((user) => {
        return user.team_id; // Has team
      });

      // Sort meeting users by seniority for this day's team meeting
      let usersToAssignOffice = [...sortedUsers];

      // Prioritize team meeting members for their meeting days
      const prioritizedUsers: User[] = [];
      const regularUsers: User[] = [];

      for (const user of usersToAssignOffice) {
        // Note: In real implementation, check actual team meeting day
        // For now, rotate team members through meeting days
        if (user.team_id) {
          prioritizedUsers.push(user);
        } else {
          regularUsers.push(user);
        }
      }

      usersToAssignOffice = [...prioritizedUsers, ...regularUsers];

      // Assign shifts for the day
      for (const user of usersToAssignOffice) {
        const shiftType: ShiftType = officeCountByDay[dateStr] < maxCapacity ? 'office' : 'smartwork';

        shifts.push({
          id: '',
          user_id: user.id,
          shift_date: dateStr,
          shift_type: shiftType,
          locked: false,
          locked_by: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        if (shiftType === 'office') {
          officeCountByDay[dateStr]++;
        }
      }
    }

    // Bulk insert shifts
    const createdShifts = await shiftsAPI.bulkUpsertShifts(
      shifts.map(({ id, ...rest }) => rest)
    );

    return createdShifts;
  },

  // Rebalance schedule when capacity is exceeded
  async rebalanceSchedule(year: number, month: number): Promise<void> {
    const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
    const allShifts = await shiftsAPI.getMonthShifts(year, month);
    const allUsers = await usersAPI.getAllUsers();

    // Group shifts by date
    const shiftsByDate: Record<string, any[]> = {};
    allShifts.forEach((shift) => {
      if (!shiftsByDate[shift.shift_date]) {
        shiftsByDate[shift.shift_date] = [];
      }
      shiftsByDate[shift.shift_date].push(shift);
    });

    // For each day, check capacity and rebalance by seniority
    for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
      const officeShifts = dayShifts.filter((s) => s.shift_type === 'office');

      if (officeShifts.length > maxCapacity) {
        // Too many office, move least senior to smartwork
        const usersToMove = officeShifts.length - maxCapacity;

        // Sort by seniority
        const sorted = officeShifts.sort((a, b) => {
          const aUser = allUsers.find((u) => u.id === a.user_id);
          const bUser = allUsers.find((u) => u.id === b.user_id);
          if (!aUser || !bUser) return 0;

          const aDays = getSeniorityDays(aUser.seniority_date);
          const bDays = getSeniorityDays(bUser.seniority_date);
          return aDays - bDays; // Least senior first
        });

        // Move least senior to smartwork
        for (let i = 0; i < usersToMove; i++) {
          const shift = sorted[i];
          if (!shift.locked) {
            await shiftsAPI.upsertShift(shift.user_id, dateStr, 'smartwork');
          }
        }
      }
    }
  },

  // Validate schedule
  async validateSchedule(year: number, month: number): Promise<string[]> {
    const errors: string[] = [];
    const maxCapacity = await settingsAPI.getMaxOfficeCapacity();
    const allShifts = await shiftsAPI.getMonthShifts(year, month);

    // Group shifts by date
    const shiftsByDate: Record<string, any[]> = {};
    allShifts.forEach((shift) => {
      if (!shiftsByDate[shift.shift_date]) {
        shiftsByDate[shift.shift_date] = [];
      }
      shiftsByDate[shift.shift_date].push(shift);
    });

    // Check each day
    for (const [dateStr, dayShifts] of Object.entries(shiftsByDate)) {
      const officeShifts = dayShifts.filter((s) => s.shift_type === 'office');

      if (officeShifts.length > maxCapacity) {
        errors.push(`${dateStr}: Office capacity exceeded (${officeShifts.length}/${maxCapacity})`);
      }
    }

    return errors;
  },
};
