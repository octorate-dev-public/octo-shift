import { supabase } from '../supabase';
import { User } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('usersAPI');

/** Supabase returns user_teams as nested array; flatten to string[] */
function mapUser(raw: any): User {
  return {
    ...raw,
    team_ids: (raw.user_teams ?? []).map((ut: { team_id: string }) => ut.team_id),
    renounce_smart: raw.renounce_smart ?? false,
    on_call_available: raw.on_call_available ?? true,
  };
}

const USER_SELECT = '*, user_teams(team_id)';

/** Try joined select; if user_teams table doesn't exist yet, fall back to plain select */
async function selectUsers(query: ReturnType<typeof supabase.from>): Promise<any[]> {
  const { data, error } = await (query as any).select(USER_SELECT);
  if (error) {
    // user_teams table might not exist yet (migration pending) — graceful fallback
    log.warn('selectUsers', 'Fallback: user_teams non disponibile', { code: error.code });
    const { data: plain, error: e2 } = await (query as any).select('*');
    if (e2) throw toAppError(e2, 'Impossibile caricare gli utenti');
    return (plain || []).map((u: any) => ({ ...u, team_ids: u.team_id ? [u.team_id] : [] }));
  }
  return (data || []).map(mapUser);
}

export const usersAPI = {
  async getAllUsers(): Promise<User[]> {
    return log.withTiming('getAllUsers', {}, async () => {
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) {
        log.warn('getAllUsers', 'Fallback senza user_teams', { code: error.code });
        const { data: plain, error: e2 } = await supabase
          .from('users')
          .select('*')
          .eq('is_active', true)
          .order('full_name', { ascending: true });
        if (e2) throw toAppError(e2, 'Impossibile caricare gli utenti');
        return (plain || []).map((u: any) => ({ ...u, team_ids: u.team_id ? [u.team_id] : [] }));
      }

      log.info('getAllUsers', `Trovati ${(data || []).length} utenti attivi`);
      return (data || []).map(mapUser);
    });
  },

  async getTeamUsers(teamId: string): Promise<User[]> {
    return log.withTiming('getTeamUsers', { teamId }, async () => {
      // Users belonging to this team via user_teams
      const { data: teamLinks, error: e1 } = await supabase
        .from('user_teams')
        .select('user_id')
        .eq('team_id', teamId);

      if (e1) throw toAppError(e1, 'Impossibile caricare i membri del team');
      if (!teamLinks || teamLinks.length === 0) return [];

      const ids = teamLinks.map((r: any) => r.user_id);
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .in('id', ids)
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare gli utenti del team');
      return (data || []).map(mapUser);
    });
  },

  async getUser(userId: string): Promise<User | null> {
    return log.withTiming('getUser', { userId }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        log.warn('getUser', 'Utente non trovato', { userId });
        return null;
      }
      if (error) throw toAppError(error, 'Impossibile caricare il profilo utente');
      return mapUser(data);
    });
  },

  async getUserByEmail(email: string): Promise<User | null> {
    return log.withTiming('getUserByEmail', { email }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .eq('email', email)
        .single();

      if (error && error.code === 'PGRST116') return null;
      if (error) throw toAppError(error, 'Errore nella ricerca utente per email');
      return mapUser(data);
    });
  },

  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'user',
    seniorityDate: string,
    teamIds?: string[],
  ): Promise<User> {
    return log.withTiming('createUser', { email, role }, async () => {
      const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
      if (authError) throw toAppError(authError, "Impossibile creare l'utente in Auth");
      if (!authData.user) throw toAppError(new Error('No user returned'), 'Auth signup non ha restituito un utente');

      const { data, error } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name: fullName,
          role,
          seniority_date: seniorityDate,
          team_id: teamIds?.[0] ?? null,
          password_hash: '',
        })
        .select(USER_SELECT)
        .single();

      if (error) throw toAppError(error, 'Impossibile creare il profilo utente');

      if (teamIds && teamIds.length > 0) {
        await this._setUserTeams(authData.user.id, teamIds);
      }

      log.info('createUser', `Utente ${fullName} creato`, { id: data.id, role });
      return mapUser(data);
    });
  },

  async updateUser(userId: string, updates: Partial<User> & { team_ids?: string[] }): Promise<User> {
    return log.withTiming('updateUser', { userId, fields: Object.keys(updates) }, async () => {
      const { team_ids, ...rest } = updates as any;

      // Update main user record (excluding team_ids which is virtual)
      const dbUpdates = { ...rest };
      delete dbUpdates.user_teams;

      if (Object.keys(dbUpdates).length > 0) {
        const { error } = await supabase
          .from('users')
          .update(dbUpdates)
          .eq('id', userId);
        if (error) throw toAppError(error, "Impossibile aggiornare l'utente");
      }

      // Update team memberships if provided
      if (Array.isArray(team_ids)) {
        await this._setUserTeams(userId, team_ids);
        // Also update legacy team_id to first team for compatibility
        const legacyTeamId = team_ids.length > 0 ? team_ids[0] : null;
        await supabase.from('users').update({ team_id: legacyTeamId }).eq('id', userId);
      }

      const user = await this.getUser(userId);
      if (!user) throw toAppError(new Error('User not found'), 'Utente non trovato dopo aggiornamento');
      return user;
    });
  },

  async deactivateUser(userId: string): Promise<User> {
    return log.withTiming('deactivateUser', { userId }, async () => {
      const { data, error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)
        .select(USER_SELECT)
        .single();

      if (error) throw toAppError(error, 'Impossibile disattivare il dipendente');
      log.info('deactivateUser', `Utente ${userId} disattivato`);
      return mapUser(data);
    });
  },

  async getUsersBySeniority(): Promise<User[]> {
    return log.withTiming('getUsersBySeniority', {}, async () => {
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .eq('is_active', true)
        .order('seniority_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare utenti per anzianità');
      return (data || []).map(mapUser);
    });
  },

  async searchUsers(query: string): Promise<User[]> {
    return log.withTiming('searchUsers', { query }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select(USER_SELECT)
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .eq('is_active', true);

      if (error) throw toAppError(error, 'Errore nella ricerca utenti');
      return (data || []).map(mapUser);
    });
  },

  /** Replace all team memberships for a user */
  async _setUserTeams(userId: string, teamIds: string[]): Promise<void> {
    // Delete existing
    await supabase.from('user_teams').delete().eq('user_id', userId);
    // Insert new
    if (teamIds.length > 0) {
      const rows = teamIds.map((team_id) => ({ user_id: userId, team_id }));
      const { error } = await supabase.from('user_teams').insert(rows);
      if (error) throw toAppError(error, 'Impossibile aggiornare i team del dipendente');
    }
  },
};
