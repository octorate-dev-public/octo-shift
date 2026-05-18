'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';

const EU_TIMEZONES = [
  { value: 'Europe/Rome', label: 'Europa/Roma (CET/CEST)' },
  { value: 'Europe/London', label: 'Europa/Londra (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europa/Parigi (CET/CEST)' },
  { value: 'Europe/Berlin', label: 'Europa/Berlino (CET/CEST)' },
  { value: 'UTC', label: 'UTC' },
];

const ALL_DAYS = [
  { key: 'monday', label: 'Lunedì' },
  { key: 'tuesday', label: 'Martedì' },
  { key: 'wednesday', label: 'Mercoledì' },
  { key: 'thursday', label: 'Giovedì' },
  { key: 'friday', label: 'Venerdì' },
  { key: 'saturday', label: 'Sabato' },
  { key: 'sunday', label: 'Domenica' },
];

const DEFAULT_WORK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

interface CardFeedback {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

const DEFAULT_FEEDBACK: CardFeedback = { status: 'idle', message: '' };

export default function AdminSettingsPage() {
  const [maxOfficeCapacity, setMaxOfficeCapacity] = useState(30);
  const [onCallCount, setOnCallCount] = useState(1);
  const [timezone, setTimezone] = useState('Europe/Rome');
  const [workDays, setWorkDays] = useState<string[]>(DEFAULT_WORK_DAYS);

  // KEROS
  const [kerosUsername, setKerosUsername] = useState('');
  const [kerosPassword, setKerosPassword] = useState('');
  const [kerosPasswordSet, setKerosPasswordSet] = useState(false);
  const [kerosShowPassword, setKerosShowPassword] = useState(false);
  const [kerosFeedback, setKerosFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [kerosTestFeedback, setKerosTestFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);

  const [capacityFeedback, setCapacityFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [onCallFeedback, setOnCallFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [timezoneFeedback, setTimezoneFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [workDaysFeedback, setWorkDaysFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const data = await api.get<Record<string, string>>('/api/settings');
      if (data.max_office_capacity) {
        const parsed = parseInt(data.max_office_capacity, 10);
        if (!isNaN(parsed)) setMaxOfficeCapacity(parsed);
      }
      if (data.on_call_count) {
        const parsed = parseInt(data.on_call_count, 10);
        if (!isNaN(parsed)) setOnCallCount(parsed);
      }
      if (data.timezone) setTimezone(data.timezone);
      if (data.work_days) {
        setWorkDays(data.work_days.split(',').map((d: string) => d.trim()).filter(Boolean));
      } else {
        setWorkDays(DEFAULT_WORK_DAYS);
      }
      // KEROS: carica username; la password non viene esposta dal GET /api/settings
      // (filtrata lato server). Invece carichiamo solo se è configurata.
      if (data.keros_username) setKerosUsername(data.keros_username);
      if (data.keros_password_set === 'true') setKerosPasswordSet(true);
    } catch (err: unknown) {
      console.error('Errore nel caricamento delle impostazioni:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveSetting = async (
    key: string,
    value: string,
    setFeedback: React.Dispatch<React.SetStateAction<CardFeedback>>,
  ) => {
    setFeedback({ status: 'loading', message: '' });
    try {
      await api.post('/api/settings', { key, value });
      setFeedback({ status: 'success', message: 'Impostazione salvata con successo.' });
      setTimeout(() => setFeedback(DEFAULT_FEEDBACK), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore durante il salvataggio.';
      setFeedback({ status: 'error', message });
      setTimeout(() => setFeedback(DEFAULT_FEEDBACK), 4000);
    }
  };

  const handleSaveCapacity = () =>
    saveSetting('max_office_capacity', String(maxOfficeCapacity), setCapacityFeedback);

  const handleSaveOnCallCount = () =>
    saveSetting('on_call_count', String(onCallCount), setOnCallFeedback);

  const handleSaveTimezone = () =>
    saveSetting('timezone', timezone, setTimezoneFeedback);

  const handleSaveWorkDays = () => {
    if (workDays.length === 0) {
      setWorkDaysFeedback({ status: 'error', message: 'Seleziona almeno un giorno lavorativo.' });
      setTimeout(() => setWorkDaysFeedback(DEFAULT_FEEDBACK), 3000);
      return;
    }
    saveSetting('work_days', workDays.join(','), setWorkDaysFeedback);
  };

  const toggleDay = (day: string) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  // ── Funzioni KEROS ──────────────────────────────────────────────────────────

  const handleSaveKeros = async () => {
    if (!kerosUsername.trim()) {
      setKerosFeedback({ status: 'error', message: 'Inserisci username KEROS.' });
      setTimeout(() => setKerosFeedback(DEFAULT_FEEDBACK), 3000);
      return;
    }
    setKerosFeedback({ status: 'loading', message: '' });
    try {
      await api.post('/api/settings', { key: 'keros_username', value: kerosUsername.trim() });
      if (kerosPassword) {
        await api.post('/api/settings', { key: 'keros_password', value: kerosPassword });
        setKerosPasswordSet(true);
        setKerosPassword('');
      }
      setKerosFeedback({ status: 'success', message: 'Credenziali KEROS salvate.' });
      setTimeout(() => setKerosFeedback(DEFAULT_FEEDBACK), 3000);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore salvataggio.';
      setKerosFeedback({ status: 'error', message });
      setTimeout(() => setKerosFeedback(DEFAULT_FEEDBACK), 4000);
    }
  };

  const handleTestKeros = async () => {
    setKerosTestFeedback({ status: 'loading', message: '' });
    try {
      const res = await api.get<{ ok: boolean; configured: boolean; message?: string; error?: string }>('/api/keros');
      if (res.ok) {
        setKerosTestFeedback({ status: 'success', message: res.message ?? 'Connessione riuscita.' });
      } else {
        setKerosTestFeedback({ status: 'error', message: res.error ?? 'Connessione fallita.' });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore di connessione.';
      setKerosTestFeedback({ status: 'error', message });
    }
    setTimeout(() => setKerosTestFeedback(DEFAULT_FEEDBACK), 5000);
  };

  if (loading) {
    return (
      <Layout userRole="admin" userName="Admin">
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Impostazioni</h1>
          <p className="text-gray-600 mt-2">Configura i parametri globali dell&apos;applicazione</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Card: Giorni Lavorativi */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4 md:col-span-2 xl:col-span-1">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Giorni Lavorativi</h2>
              <p className="text-sm text-gray-500 mt-1">
                Giorni della settimana considerati lavorativi per la generazione dello schedule.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ALL_DAYS.map((day) => {
                const active = workDays.includes(day.key);
                return (
                  <button
                    key={day.key}
                    type="button"
                    onClick={() => toggleDay(day.key)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
            <FeedbackMessage feedback={workDaysFeedback} />
            <button
              onClick={handleSaveWorkDays}
              disabled={workDaysFeedback.status === 'loading'}
              className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {workDaysFeedback.status === 'loading' ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>

          {/* Card: Capacità Ufficio */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Capacità Ufficio</h2>
              <p className="text-sm text-gray-500 mt-1">
                Numero massimo di dipendenti ammessi in ufficio contemporaneamente.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Capienza massima ufficio
              </label>
              <input
                type="number"
                min={1}
                value={maxOfficeCapacity}
                onChange={(e) => setMaxOfficeCapacity(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <FeedbackMessage feedback={capacityFeedback} />
            <button
              onClick={handleSaveCapacity}
              disabled={capacityFeedback.status === 'loading'}
              className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {capacityFeedback.status === 'loading' ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>

          {/* Card: Reperibilità */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Reperibilità</h2>
              <p className="text-sm text-gray-500 mt-1">
                Numero di persone reperibili assegnate per ogni settimana.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Numero reperibili per settimana
              </label>
              <input
                type="number"
                min={0}
                value={onCallCount}
                onChange={(e) => setOnCallCount(parseInt(e.target.value, 10) || 0)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <FeedbackMessage feedback={onCallFeedback} />
            <button
              onClick={handleSaveOnCallCount}
              disabled={onCallFeedback.status === 'loading'}
              className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {onCallFeedback.status === 'loading' ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>

          {/* Card: Fuso Orario */}
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Fuso Orario</h2>
              <p className="text-sm text-gray-500 mt-1">
                Fuso orario di riferimento per l&apos;applicazione.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fuso orario
              </label>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
              >
                {EU_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label}
                  </option>
                ))}
              </select>
            </div>
            <FeedbackMessage feedback={timezoneFeedback} />
            <button
              onClick={handleSaveTimezone}
              disabled={timezoneFeedback.status === 'loading'}
              className="w-full bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {timezoneFeedback.status === 'loading' ? 'Salvataggio...' : 'Salva'}
            </button>
          </div>
        </div>

        {/* ── KEROS HR ── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
            <span className="text-xl">🏢</span>
            <div>
              <h2 className="font-semibold text-gray-900">Integrazione KEROS HR</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Credenziali del responsabile — salvate in Supabase, mai su Vercel
              </p>
            </div>
            {kerosPasswordSet && (
              <span className="ml-auto text-xs bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full font-medium">
                ✓ Configurato
              </span>
            )}
          </div>
          <div className="px-6 py-5 space-y-4">
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Username KEROS
              </label>
              <input
                type="text"
                value={kerosUsername}
                onChange={(e) => setKerosUsername(e.target.value)}
                placeholder="es. COGNOME.NOME"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Password KEROS
                {kerosPasswordSet && !kerosPassword && (
                  <span className="ml-2 text-xs font-normal text-gray-400">(già configurata — lascia vuoto per non cambiarla)</span>
                )}
              </label>
              <div className="relative">
                <input
                  type={kerosShowPassword ? 'text' : 'password'}
                  value={kerosPassword}
                  onChange={(e) => setKerosPassword(e.target.value)}
                  placeholder={kerosPasswordSet ? '••••••••••••' : 'Inserisci password'}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
                />
                <button
                  type="button"
                  onClick={() => setKerosShowPassword((v) => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 text-xs"
                >
                  {kerosShowPassword ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <FeedbackMessage feedback={kerosFeedback} />

            <div className="flex gap-2">
              <button
                onClick={handleTestKeros}
                disabled={kerosTestFeedback.status === 'loading'}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                {kerosTestFeedback.status === 'loading' ? '⏳ Test...' : '🔌 Testa connessione'}
              </button>
              <button
                onClick={handleSaveKeros}
                disabled={kerosFeedback.status === 'loading'}
                className="flex-1 bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 text-sm"
              >
                {kerosFeedback.status === 'loading' ? 'Salvataggio...' : 'Salva credenziali'}
              </button>
            </div>

            <FeedbackMessage feedback={kerosTestFeedback} />
          </div>
        </div>

      </div>
    </Layout>
  );
}

function FeedbackMessage({ feedback }: { feedback: CardFeedback }) {
  if (feedback.status === 'idle' || feedback.status === 'loading') return null;
  if (feedback.status === 'success') {
    return (
      <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
        {feedback.message}
      </p>
    );
  }
  return (
    <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
      {feedback.message}
    </p>
  );
}
