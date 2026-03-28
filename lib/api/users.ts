import { supabase } from '../supabase';
import { User } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('usersAPI');

export const usersAPI = {
  async getAllUsers(): Promise<User[]> {
    return log.withTiming('getAllUsers', {}, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare gli utenti');
      log.info('getAllUsers', `Trovati ${(data || []).length} utenti attivi`);
      return data || [];
    });
  },

  async getTeamUsers(teamId: string): Promise<User[]> {
    return log.withTiming('getTeamUsers', { teamId }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('team_id', teamId)
        .eq('is_active', true)
        .order('full_name', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare gli utenti del team');
      return data || [];
    });
  },

  async getUser(userId: string): Promise<User | null> {
    return log.withTiming('getUser', { userId }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        log.warn('getUser', 'Utente non trovato', { userId });
        return null;
      }
      if (error) throw toAppError(error, 'Impossibile caricare il profilo utente');
      return data;
    });
  },

  async getUserByEmail(email: string): Promise<User | null> {
    return log.withTiming('getUserByEmail', { email }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code === 'PGRST116') {
        log.info('getUserByEmail', 'Nessun utente con questa email', { email });
        return null;
      }
      if (error) throw toAppError(error, 'Errore nella ricerca utente per email');
      return data;
    });
  },

  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'user',
    seniorityDate: string,
    teamId?: string,
  ): Promise<User> {
    return log.withTiming('createUser', { email, role, teamId }, async () => {
      // 1. Auth signup
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
      });

      if (authError) {
        log.error('createUser', 'Auth signup fallito', new Error(authError.message), { email });
        throw toAppError(authError, 'Impossibile creare l\'utente in Auth');
      }
      if (!authData.user) {
        throw toAppError(new Error('No user returned'), 'Auth signup non ha restituito un utente');
      }

      log.info('createUser', 'Auth user creato', { authId: authData.user.id });

      // 2. Profile insert
      const { data, error } = await supabase
        .from('users')
        .insert({
          id: authData.user.id,
          email,
          full_name: fullName,
          role,
          seniority_date: seniorityDate,
          team_id: teamId || null,
          password_hash: '',
        })
        .select()
        .single();

      if (error) {
        log.error('createUser', 'Insert profilo fallito', new Error(error.message), {
          authId: authData.user.id,
        });
        throw toAppError(error, 'Impossibile creare il profilo utente');
      }

      log.info('createUser', `Utente ${fullName} creato con successo`, { id: data.id, role });
      return data;
    });
  },

  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    return log.withTiming('updateUser', { userId, fields: Object.keys(updates) }, async () => {
      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile aggiornare l\'utente');
      return data;
    });
  },

  async deactivateUser(userId: string): Promise<User> {
    return log.withTiming('deactivateUser', { userId }, async () => {
      const { data, error } = await supabase
        .from('users')
        .update({ is_active: false })
        .eq('id', userId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile disattivare l\'utente');
      log.info('deactivateUser', `Utente ${userId} disattivato`);
      return data;
    });
  },

  async getUsersBySeniority(): Promise<User[]> {
    return log.withTiming('getUsersBySeniority', {}, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_active', true)
        .order('seniority_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare utenti per anzianità');
      return data || [];
    });
  },

  async searchUsers(query: string): Promise<User[]> {
    return log.withTiming('searchUsers', { query }, async () => {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
        .eq('is_active', true);

      if (error) throw toAppError(error, 'Errore nella ricerca utenti');
      return data || [];
    });
  },
};
