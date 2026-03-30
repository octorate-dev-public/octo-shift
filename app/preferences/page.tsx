'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { useAuth } from '@/lib/useAuth';
import { PreferenceType, ShiftPreference } from '@/types';
import { getMonthDays, formatDate } from '@/lib/utils';

const PREF_OPTIONS: Array<{ value: PreferenceType; label: string; color: string; icon: string }> = [
  { value: 'indifferent', label: 'Indifferente', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: '—' },
  { value: 'home', label: 'Casa', color: 'bg-purple-100 text-purple-700 border-purple-300', icon: '🏠' },
  { value: 'office', label: 'Ufficio', color: 'bg-blue-100 text-blue-700 border-blue-300', icon: '🏢' },
];

const DAY_NAMES_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

export default function PreferencesPage() {
  const { userId, userName, userRole, logout } = useAuth();
  const today = new Date();

  // Default to next month
  const defaultMonth = today.getDate() > 20
    ? new Date(today.getFullYear(), today.getMonth() + 2, 1)
    : new Date(today.getFullYear(), today.getMonth() + 1, 1);

  const [year, setYear] = useState(defaultMonth.getFullYear());
  const [month, setMonth] = useState(defaultMonth.getMonth()); // 0-based
  const [preferences, setPreferences] = useState<Map<string, PreferenceType>>(new Map());
  const [savedPreferences, setSavedPreferences] = useState<Map<string, PreferenceType>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deadlinePassed, setDeadlinePassed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const monthYear = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthDays = getMonthDays(year, month);

  const loadPreferences = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      const [prefsData, deadlineData] = await Promise.all([
        api.get<ShiftPreference[]>(`/api/preferences?userId=${userId}&monthYear=${monthYear}`),
        api.get<{ deadlinePassed: boolean }>(`/api/preferences?monthYear=${monthYear}&checkDeadline=1`),
      ]);

      const map = new Map<string, PreferenceType>();
      prefsData.forEach((p) => map.set(p.preference_date, p.preference));
      setPreferences(new Map(map));
      setSavedPreferences(new Map(map));
      setDeadlinePassed(deadlineData.deadlinePassed);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [userId, monthYear]);

  useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  const togglePreference = (dateStr: string) => {
    if (deadlinePassed) return;

    setPreferences((prev) => {
      const next = new Map(prev);
      const current = next.get(dateStr) ?? 'indifferent';
      // Cycle: indifferent → home → office → indifferent
      const cycle: PreferenceType[] = ['indifferent', 'home', 'office'];
      const idx = cycle.indexOf(current);
      const nextPref = cycle[(idx + 1) % cycle.length];

      if (nextPref === 'indifferent') {
        next.delete(dateStr);
      } else {
        next.set(dateStr, nextPref);
      }
      return next;
    });
  };

  const hasChanges = (): boolean => {
    if (preferences.size !== savedPreferences.size) return true;
    for (const [date, pref] of preferences) {
      if (savedPreferences.get(date) !== pref) return true;
    }
    for (const [date] of savedPreferences) {
      if (!preferences.has(date)) return true;
    }
    return false;
  };

  const handleSave = async () => {
    if (!userId || !hasChanges()) return;
    try {
      setSaving(true);
      setError(null);

      // Build bulk array with all working days
      const bulkPrefs = monthDays.map((date) => {
        const dateStr = formatDate(date);
        return {
          date: dateStr,
          preference: preferences.get(dateStr) ?? ('indifferent' as PreferenceType),
        };
      });

      await api.post('/api/preferences', { userId, preferences: bulkPrefs });
      setSavedPreferences(new Map(preferences));
      setSuccess('Preferenze salvate con successo!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel salvataggio';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
  };

  // Stats
  const homeCount = [...preferences.values()].filter((p) => p === 'home').length;
  const officeCount = [...preferences.values()].filter((p) => p === 'office').length;
  const indifferentCount = monthDays.length - homeCount - officeCount;

  return (
    <Layout userRole={userRole} userName={userName} onLogout={logout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Preferenze Turno</h1>
          <p className="text-gray-600 mt-2">
            Esprimi le tue preferenze per il mese prima della generazione dello schedule
          </p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        {deadlinePassed && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-4 py-3 rounded">
            La deadline per esprimere le preferenze di questo mese è scaduta. Le preferenze sono in sola lettura.
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            &larr; Mese precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Mese successivo &rarr;
          </button>
        </div>

        {/* Legend + stats */}
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <p className="text-sm font-medium text-gray-700">Clicca un giorno per cambiare:</p>
              {PREF_OPTIONS.map((opt) => (
                <span
                  key={opt.value}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border ${opt.color}`}
                >
                  {opt.icon} {opt.label}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span>🏠 Casa: <strong>{homeCount}</strong></span>
              <span>🏢 Ufficio: <strong>{officeCount}</strong></span>
              <span>— Indifferente: <strong>{indifferentCount}</strong></span>
            </div>
          </div>
        </div>

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 bg-gray-50 border-b border-gray-200">
              {DAY_NAMES_SHORT.map((d, i) => (
                <div
                  key={i}
                  className={`py-2 text-center text-xs font-medium uppercase tracking-wider ${
                    i === 0 || i === 6 ? 'text-red-400' : 'text-gray-500'
                  }`}
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells for offset */}
              {Array.from({ length: monthDays[0]?.getDay() ?? 0 }).map((_, i) => (
                <div key={`empty-${i}`} className="h-20 border-b border-r border-gray-100" />
              ))}

              {monthDays.map((date) => {
                const dateStr = formatDate(date);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const pref = preferences.get(dateStr) ?? 'indifferent';
                const opt = PREF_OPTIONS.find((o) => o.value === pref)!;
                const isToday = dateStr === formatDate(today);

                return (
                  <button
                    key={dateStr}
                    onClick={() => togglePreference(dateStr)}
                    disabled={deadlinePassed || isWeekend}
                    className={`h-20 border-b border-r border-gray-100 p-2 text-left transition-all hover:ring-2 hover:ring-blue-300 hover:z-10 relative
                      ${isWeekend ? 'bg-gray-50 cursor-not-allowed opacity-50' : 'cursor-pointer'}
                      ${deadlinePassed && !isWeekend ? 'cursor-not-allowed' : ''}
                      ${isToday ? 'ring-2 ring-blue-500 z-10' : ''}
                    `}
                  >
                    <span className={`text-xs font-medium ${isWeekend ? 'text-red-400' : 'text-gray-700'}`}>
                      {date.getDate()}
                    </span>
                    {!isWeekend && (
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${opt.color}`}
                        >
                          {opt.icon} {opt.label}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Save button */}
        {!deadlinePassed && (
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges()}
              className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-6 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Salvataggio...' : 'Salva preferenze'}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
