import { supabase } from '../supabase';
import { User } from '@/types';

export const usersAPI = {
  // Get all active users
  async getAllUsers(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get all users for a team
  async getTeamUsers(teamId: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('team_id', teamId)
      .eq('is_active', true)
      .order('full_name', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Get a single user by ID
  async getUser(userId: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error && error.code === 'PGRST116') {
      return null; // User not found
    }
    if (error) throw error;
    return data;
  },

  // Get a user by email
  async getUserByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    return data;
  },

  // Create a new user (for admin)
  async createUser(
    email: string,
    password: string,
    fullName: string,
    role: 'admin' | 'user',
    seniorityDate: string,
    teamId?: string
  ): Promise<User> {
    // First create auth user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) throw authError;
    if (!authData.user) throw new Error('Failed to create user');

    // Then create user profile
    const { data, error } = await supabase
      .from('users')
      .insert({
        id: authData.user.id,
        email,
        full_name: fullName,
        role,
        seniority_date: seniorityDate,
        team_id: teamId || null,
        password_hash: '', // In real app, handle password differently
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update user
  async updateUser(userId: string, updates: Partial<User>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Deactivate user
  async deactivateUser(userId: string): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .update({ is_active: false })
      .eq('id', userId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get users sorted by seniority (oldest first)
  async getUsersBySeniority(): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('is_active', true)
      .order('seniority_date', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  // Search users
  async searchUsers(query: string): Promise<User[]> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
      .eq('is_active', true);

    if (error) throw error;
    return data || [];
  },
};
