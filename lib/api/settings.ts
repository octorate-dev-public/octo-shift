import { supabase } from '../supabase';
import { Settings } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('settingsAPI');

export const settingsAPI = {
  async getSetting(key: string): Promise<string | null> {
    return log.withTiming('getSetting', { key }, async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', key)
        .single();

      if (error && error.code === 'PGRST116') {
        log.debug('getSetting', `Chiave "${key}" non trovata, restituisco null`);
        return null;
      }
      if (error) throw toAppError(error, `Impossibile leggere l'impostazione "${key}"`);
      return data?.value || null;
    });
  },

  async getAllSettings(): Promise<Record<string, string>> {
    return log.withTiming('getAllSettings', {}, async () => {
      const { data, error } = await supabase.from('settings').select('key, value');

      if (error) throw toAppError(error, 'Impossibile caricare le impostazioni');

      const settings: Record<string, string> = {};
      (data || []).forEach((item) => {
        settings[item.key] = item.value;
      });

      log.info('getAllSettings', `Caricate ${Object.keys(settings).length} impostazioni`);
      return settings;
    });
  },

  async setSetting(key: string, value: string): Promise<Settings> {
    return log.withTiming('setSetting', { key, value }, async () => {
      const { data, error } = await supabase
        .from('settings')
        .upsert({ key, value }, { onConflict: 'key' })
        .select()
        .single();

      if (error) throw toAppError(error, `Impossibile salvare l'impostazione "${key}"`);
      log.info('setSetting', `Impostazione "${key}" aggiornata a "${value}"`);
      return data;
    });
  },

  async getMaxOfficeCapacity(): Promise<number> {
    const value = await this.getSetting('max_office_capacity');
    const capacity = value ? parseInt(value, 10) : 30;
    if (isNaN(capacity) || capacity < 0) {
      log.warn('getMaxOfficeCapacity', `Valore non valido "${value}", uso default 30`);
      return 30;
    }
    return capacity;
  },

  async setMaxOfficeCapacity(capacity: number): Promise<void> {
    if (capacity < 1) {
      log.warn('setMaxOfficeCapacity', `Capienza ${capacity} non valida, minimo 1`);
      throw toAppError(new Error('Capacity must be >= 1'), 'La capienza minima è 1');
    }
    await this.setSetting('max_office_capacity', capacity.toString());
  },

  async getOnCallCount(): Promise<number> {
    const value = await this.getSetting('on_call_count');
    const count = value ? parseInt(value, 10) : 1;
    if (isNaN(count) || count < 0) {
      log.warn('getOnCallCount', `Valore non valido "${value}", uso default 1`);
      return 1;
    }
    return count;
  },

  async setOnCallCount(count: number): Promise<void> {
    if (count < 0) {
      log.warn('setOnCallCount', `Valore ${count} non valido`);
      throw toAppError(new Error('Count must be >= 0'), 'Il numero di reperibili non può essere negativo');
    }
    await this.setSetting('on_call_count', count.toString());
  },

  async getTimezone(): Promise<string> {
    const value = await this.getSetting('timezone');
    return value || 'Europe/Rome';
  },

  async setTimezone(timezone: string): Promise<void> {
    await this.setSetting('timezone', timezone);
  },

  async getWorkDays(): Promise<string[]> {
    const value = await this.getSetting('work_days');
    if (!value) return ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    return value.split(',').map((d: string) => d.trim()).filter(Boolean);
  },

  async setWorkDays(days: string[]): Promise<void> {
    await this.setSetting('work_days', days.join(','));
  },

  async getHolidayDates(): Promise<string[]> {
    return log.withTiming('getHolidayDates', {}, async () => {
      const { data, error } = await supabase
        .from('settings')
        .select('key')
        .like('key', 'holiday:%');
      if (error) throw toAppError(error, 'Impossibile caricare le festività');
      return (data || []).map((row: any) => (row.key as string).replace('holiday:', ''));
    });
  },

  async addHoliday(date: string): Promise<void> {
    await this.setSetting(`holiday:${date}`, '1');
  },

  async removeHoliday(date: string): Promise<void> {
    await this.deleteSetting(`holiday:${date}`);
  },

  async deleteSetting(key: string): Promise<void> {
    return log.withTiming('deleteSetting', { key }, async () => {
      const { error } = await supabase.from('settings').delete().eq('key', key);
      if (error) throw toAppError(error, `Impossibile eliminare l'impostazione "${key}"`);
    });
  },
};
