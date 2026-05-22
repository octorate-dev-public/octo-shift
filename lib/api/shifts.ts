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
      // NON usa ON CONFLICT perché il constraint UNIQUE(user_id, shift_date) è DEFERRABLE
      // (necessario per lo swap atomico dei turni) e PostgreSQL non supporta
      // constraint deferrable come arbitri di ON CONFLICT.
      const { data: existing } = await supabase
        .from('shifts')
        .select('id')
        .eq('user_id', userId)
        .eq('shift_date', shiftDate)
        .maybeSingle();

      const row: Record<string, unknown> = { shift_type: shiftType };
      if (leaveType !== undefined) row.leave_type = leaveType ?? null;

      if (existing) {
        const { data, error } = await supabase
          .from('shifts')
          .update(row)
          .eq('user_id', userId)
          .eq('shift_date', shiftDate)
          .select()
          .single();
        if (error) throw toAppError(error, 'Impossibile aggiornare il turno');
        return data;
      }

      const { data, error } = await supabase
        .from('shifts')
        .insert({ user_id: userId, shift_date: shiftDate, ...row })
        .select()
        .single();
      if (error) throw toAppError(error, 'Impossibile creare il turno');
      return data;
    });
  },

  /**
   * Imposta il leave_type (e opzionalmente leave_note) per un giorno specifico.
   *
   * NON usa upsert/ON CONFLICT perché il constraint UNIQUE(user_id, shift_date)
   * è stato reso DEFERRABLE per supportare lo swap atomico dei turni, e
   * PostgreSQL non permette constraint deferrable come arbitri di ON CONFLICT.
   *
   * Strategia: check esistenza → INSERT se assente, UPDATE se presente.
   */
  async setLeaveType(
    userId: string,
    shiftDate: string,
    leaveType: LeaveType | null,
    note?: string | null,
  ): Promise<Shift> {
    return log.withTiming('setLeaveType', { userId, shiftDate, leaveType }, async () => {
      // 1. Controlla se lo shift esiste già
      const { data: existing, error: fetchErr } = await supabase
        .from('shifts')
        .select('*')
        .eq('user_id', userId)
        .eq('shift_date', shiftDate)
        .maybeSingle();

      if (fetchErr) throw toAppError(fetchErr, 'Impossibile verificare il turno esistente');

      // 2a. Rimozione assenza su riga esistente
      if (leaveType === null) {
        if (!existing) {
          return { id: '', user_id: userId, shift_date: shiftDate, shift_type: 'smartwork', leave_type: null, leave_note: null, locked: false, locked_by: null, created_at: '', updated_at: '' } as unknown as Shift;
        }
        const { data, error } = await supabase
          .from('shifts')
          .update({ leave_type: null, leave_note: null })
          .eq('user_id', userId)
          .eq('shift_date', shiftDate)
          .select()
          .single();
        if (error) throw toAppError(error, 'Impossibile rimuovere il tipo di assenza');
        return data;
      }

      // 2b. Aggiornamento riga esistente: preserva shift_type già pianificato
      if (existing) {
        const row: Record<string, unknown> = { leave_type: leaveType };
        if (note !== undefined) row.leave_note = note ?? null;
        const { data, error } = await supabase
          .from('shifts')
          .update(row)
          .eq('user_id', userId)
          .eq('shift_date', shiftDate)
          .select()
          .single();
        if (error) throw toAppError(error, 'Impossibile aggiornare il tipo di assenza');
        return data;
      }

      // 2c. Nessuna riga: crea un nuovo shift con smartwork come tipo default
      const insertRow: Record<string, unknown> = {
        user_id: userId,
        shift_date: shiftDate,
        shift_type: 'smartwork',
        leave_type: leaveType,
      };
      if (note !== undefined) insertRow.leave_note = note ?? null;
      const { data, error } = await supabase
        .from('shifts')
        .insert(insertRow)
        .select()
        .single();
      if (error) throw toAppError(error, 'Impossibile creare il turno con assenza');
      return data;
    });
  },

  /**
   * Imposta leave_type per tutti i giorni lavorativi (lun-ven) in un range di date.
   * Usato per inserire ferie multigiorno.
   */
  async setLeaveTypeRange(
    userId: string,
    startDate: string,
    endDate: string,
    leaveType: LeaveType,
  ): Promise<Shift[]> {
    return log.withTiming('setLeaveTypeRange', { userId, startDate, endDate, leaveType }, async () => {
      const dates: string[] = [];
      const [sy, sm, sd] = startDate.split('-').map(Number);
      const [ey, em, ed] = endDate.split('-').map(Number);
      const cur = new Date(sy, sm - 1, sd);
      const end = new Date(ey, em - 1, ed);
      while (cur <= end) {
        const dow = cur.getDay();
        if (dow !== 0 && dow !== 6) {
          // lun-ven
          const y = cur.getFullYear();
          const mo = String(cur.getMonth() + 1).padStart(2, '0');
          const d = String(cur.getDate()).padStart(2, '0');
          dates.push(`${y}-${mo}-${d}`);
        }
        cur.setDate(cur.getDate() + 1);
      }
      const results = await Promise.all(
        dates.map((date) => this.setLeaveType(userId, date, leaveType)),
      );
      log.info('setLeaveTypeRange', `Impostati ${results.length} giorni di ${leaveType}`, { userId });
      return results;
    });
  },

  /**
   * Rimuove leave_type (e leave_note) da tutti i turni nel range indicato per l'utente.
   * Usato per eliminare in blocco un range di ferie.
   */
  async clearLeaveTypeRange(userId: string, startDate: string, endDate: string): Promise<void> {
    return log.withTiming('clearLeaveTypeRange', { userId, startDate, endDate }, async () => {
      const { error } = await supabase
        .from('shifts')
        .update({ leave_type: null, leave_note: null })
        .eq('user_id', userId)
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .not('leave_type', 'is', null);

      if (error) throw toAppError(error, 'Impossibile rimuovere le assenze nel range');
      log.info('clearLeaveTypeRange', `Rimosso leave_type nel range ${startDate}–${endDate}`, { userId });
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

      // NON usa ON CONFLICT — constraint UNIQUE(user_id, shift_date) è DEFERRABLE
      // (necessario per lo swap atomico). Strategia: fetch esistenti → INSERT nuovi, UPDATE esistenti.

      // 1. Recupera tutti gli ID per le combinazioni (user_id, shift_date) che stiamo per salvare
      const userIds  = [...new Set(shifts.map(s => s.user_id))];
      const dates    = [...new Set(shifts.map(s => s.shift_date))];

      const { data: existing, error: fetchErr } = await supabase
        .from('shifts')
        .select('id, user_id, shift_date')
        .in('user_id', userIds)
        .in('shift_date', dates);

      if (fetchErr) throw toAppError(fetchErr, 'Impossibile verificare i turni esistenti');

      // Mappa "userId:date" → id esistente
      const existingMap = new Map<string, string>();
      for (const s of existing || []) {
        existingMap.set(`${s.user_id}:${s.shift_date}`, s.id);
      }

      const toInsert = shifts.filter(s => !existingMap.has(`${s.user_id}:${s.shift_date}`));
      const toUpdate = shifts.filter(s =>  existingMap.has(`${s.user_id}:${s.shift_date}`));

      const results: Shift[] = [];

      // 2. INSERT in batch per i nuovi turni
      const INSERT_BATCH = 200;
      for (let i = 0; i < toInsert.length; i += INSERT_BATCH) {
        const batch = toInsert.slice(i, i + INSERT_BATCH);
        const { data, error } = await supabase
          .from('shifts')
          .insert(batch)
          .select();
        if (error) throw toAppError(error, 'Impossibile inserire i nuovi turni');
        results.push(...(data || []));
      }

      // 3. UPDATE in parallelo per i turni già esistenti (batch di 50)
      const UPDATE_BATCH = 50;
      for (let i = 0; i < toUpdate.length; i += UPDATE_BATCH) {
        const batch = toUpdate.slice(i, i + UPDATE_BATCH);
        const updateResults = await Promise.all(
          batch.map(s => {
            const id = existingMap.get(`${s.user_id}:${s.shift_date}`)!;
            return supabase
              .from('shifts')
              .update({ shift_type: s.shift_type, leave_type: s.leave_type ?? null })
              .eq('id', id)
              .select()
              .single();
          }),
        );
        for (const { data, error } of updateResults) {
          if (error) throw toAppError(error, 'Impossibile aggiornare il turno esistente');
          if (data) results.push(data);
        }
      }

      log.info('bulkUpsertShifts', `Salvati ${results.length} turni (${toInsert.length} nuovi, ${toUpdate.length} aggiornati)`);
      return results;
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
      // Absences (ferie / permessi / malattia) — whether expressed as a
      // leave_type overlay or as a legacy shift_type = 'vacation'|'permission'|
      // 'sick' — must NOT count toward office presence. We filter legacy
      // values out at query time by keying on shift_type='office', and then
      // ignore any row with a leave_type overlay by requiring leave_type IS NULL.
      const { data, error } = await supabase
        .from('shifts')
        .select('id')
        .eq('shift_date', date)
        .eq('shift_type', 'office')
        .is('leave_type', null);

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
        // Absences (ferie / permessi / malattia) never count toward office or
        // smartwork presence, whether expressed as a leave_type overlay or as
        // a legacy shift_type of 'vacation' | 'permission' | 'sick'.
        const legacyLeave =
          shift.shift_type === 'vacation' || shift.shift_type === 'permission' || shift.shift_type === 'sick'
            ? shift.shift_type
            : null;
        const leave = shift.leave_type ?? legacyLeave;
        if (!leave) {
          if (shift.shift_type === 'office') stats.office++;
          else if (shift.shift_type === 'smartwork') stats.smartwork++;
        }
        if (leave === 'sick') stats.sick++;
        else if (leave === 'vacation') stats.vacation++;
        else if (leave === 'permission') stats.permission++;
      });
      return stats;
    });
  },

  /**
   * Recupera tutte le assenze (vacation / permission / sick) di un anno intero.
   * Usato dall'AI Assistant ferie per l'analisi annuale.
   */
  async getYearLeaves(year: number): Promise<Shift[]> {
    return log.withTiming('getYearLeaves', { year }, async () => {
      const startDate = `${year}-01-01`;
      const endDate   = `${year}-12-31`;

      const { data, error } = await supabase
        .from('shifts')
        .select('*')
        .gte('shift_date', startDate)
        .lte('shift_date', endDate)
        .not('leave_type', 'is', null)
        .order('shift_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare le assenze annuali');
      log.info('getYearLeaves', `Caricate ${(data || []).length} assenze per ${year}`);
      return data || [];
    });
  },
};
