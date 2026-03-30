import { supabase } from '../supabase';
import { Shift, ShiftWithUser, ShiftType, LeaveType } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('shiftsAPI');

export const shiftsAPI = {
  async getUserShifts(userId: string, startDate: string, endDate: string): Promise<Shift[]> {
    return log.withTiming('getUserShifts', { userId, startDate, endDate }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .order('shift_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare i turni utente');
      return data || [];
    });
  },

  async getShiftsForDate(date: string): Promise<ShiftWithUser[]> {
    return log.withTiming('getShiftsForDate', { date }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select(`*, users:user_id(id, full_name, email, seniority_date, team_id)`)
        .eq('shift_date', date)
        .order('shift_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare i turni del giorno');
      return (data || []).map((shift: any) => ({ ...shift, user: shift.users }));
    });
  },

  async getMonthShifts(year: number, month: number): Promise<ShiftWithUser[]> {
    return log.withTiming('getMonthShifts', { year, month }, async () => {
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
      const endDate = new Date(year, month, 0);
      const endDateStr = `${year}-${String(month).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`;

      const { data, error } = await supabase
        .from('shifts')
        .select(`*, users:user_id(id, full_name, email, seniority_date, team_id)`)
        .gte('shift_date', startDate)
        .lte('shift_date', endDateStr)
        .order('shift_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare i turni del mese');
      log.info('getMonthShifts', `Caricati ${(data || []).length} turni`, { year, month });
      return (data || []).map((shift: any) => ({ ...shift, user: shift.users }));
    });
  },

  async upsertShift(userId: string, shiftDate: string, shiftType: ShiftType, leaveType?: LeaveType | null): Promise<Shift> {
    return log.withTiming('upsertShift', { userId, shiftDate, shiftType, leaveType }, async () => {
      const row: Record<string, unknown> = {
        user_id: userId,
        shift_date: shiftDate,
        shift_type: shiftType,
      };
      // Explicitly set leave_type (null clears it)
      if (leaveType !== undefined) row.leave_type = leaveType ?? null;

      const { data, error } = await supabase
        .from('shifts')
        .upsert(row, { onConflict: 'user_id,shift_date' })
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile salvare il turno');
      return data;
    });
  },

  /** Update only the leave_type of an existing shift (without changing shift_type) */
  async setLeaveType(userId: string, shiftDate: string, leaveType: LeaveType | null): Promise<Shift> {
    return log.withTiming('setLeaveType', { userId, shiftDate, leaveType }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .update({ leave_type: leaveType })
        .eq('user_id', userId)
        .eq('shift_date', shiftDate)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile aggiornare il tipo di assenza');
      return data;
    });
  },

  async bulkUpsertShifts(
    shifts: Array<{ user_id: string; shift_date: string; shift_type: ShiftType; leave_type?: LeaveType | null }>,
  ): Promise<Shift[]> {
    return log.withTiming('bulkUpsertShifts', { count: shifts.length }, async () => {
      if (shifts.length === 0) {
        log.warn('bulkUpsertShifts', 'Chiamata con array vuoto');
        return [];
      }
      const { data, error } = await supabase
        .from('shifts')
        .upsert(shifts, { onConflict: 'user_id,shift_date' })
        .select();

      if (error) throw toAppError(error, 'Impossibile salvare i turni in blocco');
      log.info('bulkUpsertShifts', `Salvati ${(data || []).length} turni`);
      return data || [];
    });
  },

  async deleteShift(userId: string, shiftDate: string): Promise<void> {
    return log.withTiming('deleteShift', { userId, shiftDate }, async () => {
      const { error } = await supabase
        .from('shifts')
        .delete()
        .eq('user_id', userId)
        .eq('shift_date', shiftDate);

      if (error) throw toAppError(error, 'Impossibile eliminare il turno');
    });
  },

  async lockShift(userId: string, shiftDate: string, lockedBy: string): Promise<Shift> {
    return log.withTiming('lockShift', { userId, shiftDate, lockedBy }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .update({ locked: true, locked_by: lockedBy })
        .eq('user_id', userId)
        .eq('shift_date', shiftDate)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile bloccare il turno');
      return data;
    });
  },

  async unlockShift(userId: string, shiftDate: string): Promise<Shift> {
    return log.withTiming('unlockShift', { userId, shiftDate }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .update({ locked: false, locked_by: null })
        .eq('user_id', userId)
        .eq('shift_date', shiftDate)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile sbloccare il turno');
      return data;
    });
  },

  async getOfficeCountForDate(date: string): Promise<number> {
    return log.withTiming('getOfficeCountForDate', { date }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('id', { count: 'exact' })
        .eq('shift_date', date)
        .eq('shift_type', 'office');

      if (error) throw toAppError(error, 'Impossibile contare le presenze in ufficio');
      return data?.length || 0;
    });
  },

  async getShiftStatsForDate(date: string) {
    return log.withTiming('getShiftStatsForDate', { date }, async () => {
      const { data, error } = await supabase
        .from('shifts')
        .select('shift_type, leave_type, id')
        .eq('shift_date', date);

      if (error) throw toAppError(error, 'Impossibile caricare le statistiche dei turni');

      const stats = { office: 0, smartwork: 0, sick: 0, vacation: 0, permission: 0 };
      (data || []).forEach((shift: any) => {
        // Count work location
        if (shift.shift_type === 'office') stats.office++;
        else if (shift.shift_type === 'smartwork') stats.smartwork++;
        // Count leave overlay (independent)
        if (shift.leave_type === 'sick') stats.sick++;
        else if (shift.leave_type === 'vacation') stats.vacation++;
        else if (shift.leave_type === 'permission') stats.permission++;
      });
      return stats;
    });
  },
};
