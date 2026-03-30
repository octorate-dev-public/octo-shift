import { supabase } from '../supabase';
import { ShiftPreference, PreferenceType } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('preferencesAPI');

export const preferencesAPI = {
  /**
   * Get all preferences for a user in a given month (YYYY-MM).
   */
  async getUserMonthPreferences(userId: string, monthYear: string): Promise<ShiftPreference[]> {
    return log.withTiming('getUserMonthPreferences', { userId, monthYear }, async () => {
      const { data, error } = await supabase
        .from('shift_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('month_year', monthYear)
        .order('preference_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare le preferenze');
      return data || [];
    });
  },

  /**
   * Get all preferences for a given month (all users) — for admin/scheduling.
   */
  async getAllMonthPreferences(monthYear: string): Promise<ShiftPreference[]> {
    return log.withTiming('getAllMonthPreferences', { monthYear }, async () => {
      const { data, error } = await supabase
        .from('shift_preferences')
        .select('*')
        .eq('month_year', monthYear)
        .order('preference_date', { ascending: true });

      if (error) throw toAppError(error, 'Impossibile caricare le preferenze del mese');
      return data || [];
    });
  },

  /**
   * Upsert a single day preference.
   * If preference is 'indifferent', delete it (default = no record).
   */
  async setPreference(
    userId: string,
    preferenceDate: string,
    preference: PreferenceType,
  ): Promise<ShiftPreference | null> {
    return log.withTiming('setPreference', { userId, preferenceDate, preference }, async () => {
      // Extract YYYY-MM from date
      const monthYear = preferenceDate.substring(0, 7);

      if (preference === 'indifferent') {
        // Delete = revert to default
        const { error } = await supabase
          .from('shift_preferences')
          .delete()
          .eq('user_id', userId)
          .eq('preference_date', preferenceDate);

        if (error) throw toAppError(error, 'Impossibile rimuovere la preferenza');
        return null;
      }

      const { data, error } = await supabase
        .from('shift_preferences')
        .upsert(
          {
            user_id: userId,
            preference_date: preferenceDate,
            preference,
            month_year: monthYear,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,preference_date' },
        )
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile salvare la preferenza');
      log.info('setPreference', 'Preferenza salvata', { userId, preferenceDate, preference });
      return data;
    });
  },

  /**
   * Batch set preferences for a user for a whole month.
   * Accepts an array of { date, preference } objects.
   */
  async setBulkPreferences(
    userId: string,
    preferences: Array<{ date: string; preference: PreferenceType }>,
  ): Promise<void> {
    return log.withTiming('setBulkPreferences', { userId, count: preferences.length }, async () => {
      // Separate deletes (indifferent) from upserts
      const toDelete = preferences.filter((p) => p.preference === 'indifferent').map((p) => p.date);
      const toUpsert = preferences.filter((p) => p.preference !== 'indifferent');

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('shift_preferences')
          .delete()
          .eq('user_id', userId)
          .in('preference_date', toDelete);

        if (error) throw toAppError(error, 'Impossibile rimuovere le preferenze');
      }

      if (toUpsert.length > 0) {
        const rows = toUpsert.map((p) => ({
          user_id: userId,
          preference_date: p.date,
          preference: p.preference,
          month_year: p.date.substring(0, 7),
          updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from('shift_preferences')
          .upsert(rows, { onConflict: 'user_id,preference_date' });

        if (error) throw toAppError(error, 'Impossibile salvare le preferenze');
      }

      log.info('setBulkPreferences', `Salvate ${toUpsert.length} preferenze, rimosse ${toDelete.length}`);
    });
  },

  /**
   * Check if the preference deadline for a month has passed.
   * Default deadline: day 20 of the previous month.
   */
  async isDeadlinePassed(monthYear: string): Promise<boolean> {
    const { settingsAPI } = await import('./settings');
    const deadlineDay = await settingsAPI.getSetting('preference_deadline_day');
    const day = deadlineDay ? parseInt(deadlineDay) : 20;

    // monthYear = 'YYYY-MM', deadline is day `day` of the previous month
    const [yearStr, monthStr] = monthYear.split('-');
    const year = parseInt(yearStr);
    const month = parseInt(monthStr); // 1-based

    // Deadline: day X of previous month
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const deadline = new Date(prevYear, prevMonth - 1, day, 23, 59, 59);

    return new Date() > deadline;
  },
};
