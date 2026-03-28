import { supabase } from '../supabase';
import { Settings } from '@/types';

export const settingsAPI = {
  // Get a setting value
  async getSetting(key: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code === 'PGRST116') {
      return null;
    }
    if (error) throw error;
    return data?.value || null;
  },

  // Get all settings
  async getAllSettings(): Promise<Record<string, string>> {
    const { data, error } = await supabase
      .from('settings')
      .select('key, value');

    if (error) throw error;

    const settings: Record<string, string> = {};
    (data || []).forEach((item) => {
      settings[item.key] = item.value;
    });
    return settings;
  },

  // Set a setting value
  async setSetting(key: string, value: string): Promise<Settings> {
    const { data, error } = await supabase
      .from('settings')
      .upsert(
        { key, value },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get max office capacity
  async getMaxOfficeCapacity(): Promise<number> {
    const value = await this.getSetting('max_office_capacity');
    return value ? parseInt(value, 10) : 30;
  },

  // Set max office capacity
  async setMaxOfficeCapacity(capacity: number): Promise<void> {
    await this.setSetting('max_office_capacity', capacity.toString());
  },

  // Get on-call count
  async getOnCallCount(): Promise<number> {
    const value = await this.getSetting('on_call_count');
    return value ? parseInt(value, 10) : 1;
  },

  // Set on-call count
  async setOnCallCount(count: number): Promise<void> {
    await this.setSetting('on_call_count', count.toString());
  },

  // Get timezone
  async getTimezone(): Promise<string> {
    const value = await this.getSetting('timezone');
    return value || 'Europe/Rome';
  },

  // Set timezone
  async setTimezone(timezone: string): Promise<void> {
    await this.setSetting('timezone', timezone);
  },
};
