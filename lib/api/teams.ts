import { supabase } from '../supabase';
import { Team } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('teamsAPI');

export const teamsAPI = {
  async getAllTeams(): Promise<Team[]> {
    return log.withTiming('getAllTeams', {}, async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare i team');
      return data || [];
    });
  },

  async getTeam(id: string): Promise<Team | null> {
    return log.withTiming('getTeam', { id }, async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', id)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null;
        throw toAppError(error, 'Impossibile caricare il team');
      }
      return data;
    });
  },

  async createTeam(
    name: string,
    description?: string,
    weeklyMeetingDay?: string,
  ): Promise<Team> {
    return log.withTiming('createTeam', { name, weeklyMeetingDay }, async () => {
      const { data, error } = await supabase
        .from('teams')
        .insert({
          name,
          description: description ?? null,
          weekly_meeting_day: weeklyMeetingDay ?? null,
        })
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile creare il team');
      log.info('createTeam', `Team "${name}" creato`, { id: data.id });
      return data;
    });
  },

  async updateTeam(
    id: string,
    updates: Partial<Pick<Team, 'name' | 'description' | 'weekly_meeting_day'>>,
  ): Promise<Team> {
    return log.withTiming('updateTeam', { id, ...updates }, async () => {
      const { data, error } = await supabase
        .from('teams')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile aggiornare il team');
      log.info('updateTeam', `Team ${id} aggiornato`);
      return data;
    });
  },

  async deleteTeam(id: string): Promise<void> {
    return log.withTiming('deleteTeam', { id }, async () => {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw toAppError(error, 'Impossibile eliminare il team');
      log.info('deleteTeam', `Team ${id} eliminato`);
    });
  },
};
