import { supabase } from '../supabase';
import { Shift, ShiftWithUser, ShiftType } from '@/types';

export const shiftsAPI = {
  // Get all shifts for a user in a date range
  async getUserShifts(userId: string, startDate: string, endDate: string): Promise<Shift[]> {
    const { data, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', userId)
      .gte('shift_date', startDate)
      .lte('shift_date', endDate)
      .order('shift_date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get all shifts for a date with user details
  async getShiftsForDate(date: string): Promise<ShiftWithUser[]> {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        users:user_id(id, full_name, email, seniority_date, team_id)
      `)
      .eq('shift_date', date)
      .order('shift_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((shift: any) => ({
      ...shift,
      user: shift.users,
    }));
  },

  // Get all shifts for a month
  async getMonthShifts(year: number, month: number): Promise<ShiftWithUser[]> {
    const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0);
    const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

    const { data, error } = await supabase
      .from('shifts')
      .select(`
        *,
        users:user_id(id, full_name, email, seniority_date, team_id)
      `)
      .gte('shift_date', startDate)
      .lte('shift_date', endDateStr)
      .order('shift_date', { ascending: true });

    if (error) throw error;
    return (data || []).map((shift: any) => ({
      ...shift,
      user: shift.users,
    }));
  },

  // Create or update a shift
  async upsertShift(userId: string, shiftDate: string, shiftType: ShiftType): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .upsert(
        {
          user_id: userId,
          shift_date: shiftDate,
          shift_type: shiftType,
        },
        {
          onConflict: 'user_id,shift_date',
        }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Bulk create/update shifts (for scheduling)
  async bulkUpsertShifts(shifts: Array<{ user_id: string; shift_date: string; shift_type: ShiftType }>): Promise<Shift[]> {
    const { data, error } = await supabase
      .from('shifts')
      .upsert(shifts, {
        onConflict: 'user_id,shift_date',
      })
      .select();

    if (error) throw error;
    return data || [];
  },

  // Delete a shift
  async deleteShift(userId: string, shiftDate: string): Promise<void> {
    const { error } = await supabase
      .from('shifts')
      .delete()
      .eq('user_id', userId)
      .eq('shift_date', shiftDate);

    if (error) throw error;
  },

  // Lock a shift
  async lockShift(userId: string, shiftDate: string, lockedBy: string): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .update({
        locked: true,
        locked_by: lockedBy,
      })
      .eq('user_id', userId)
      .eq('shift_date', shiftDate)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Unlock a shift
  async unlockShift(userId: string, shiftDate: string): Promise<Shift> {
    const { data, error } = await supabase
      .from('shifts')
      .update({
        locked: false,
        locked_by: null,
      })
      .eq('user_id', userId)
      .eq('shift_date', shiftDate)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get office count for a date
  async getOfficeCountForDate(date: string): Promise<number> {
    const { data, error } = await supabase
      .from('shifts')
      .select('id', { count: 'exact' })
      .eq('shift_date', date)
      .eq('shift_type', 'office');

    if (error) throw error;
    return data?.length || 0;
  },

  // Get shift stats for a date
  async getShiftStatsForDate(date: string) {
    const { data, error } = await supabase
      .from('shifts')
      .select(`
        shift_type,
        id
      `)
      .eq('shift_date', date);

    if (error) throw error;

    const stats = {
      office: 0,
      smartwork: 0,
      sick: 0,
      vacation: 0,
      permission: 0,
    };

    (data || []).forEach((shift: any) => {
      if (shift.shift_type in stats) {
        stats[shift.shift_type as keyof typeof stats]++;
      }
    });

    return stats;
  },
};
