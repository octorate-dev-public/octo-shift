import { supabase } from '../supabase';
import { OnCallAssignment } from '@/types';
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
      const startDate = formatDate(getWeekStart(new Date(date)));

      const { data, error } = await supabase
        .from('on_call_assignments')
        .select(`*, users:user_id(id, full_name, email)`)
        .eq('week_start_date', startDate);

      if (error) throw toAppError(error, 'Impossibile caricare la reperibilità di oggi');
      const result = (data || []).map((item: any) => ({ ...item, user: item.users }));
      log.info('getOnCallForDate', `Trovati ${result.length} reperibili`, { date, startDate });
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
};
