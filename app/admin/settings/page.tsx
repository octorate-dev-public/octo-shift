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

interface CardFeedback {
  status: 'idle' | 'loading' | 'success' | 'error';
  message: string;
}

const DEFAULT_FEEDBACK: CardFeedback = { status: 'idle', message: '' };

export default function AdminSettingsPage() {
  const [maxOfficeCapacity, setMaxOfficeCapacity] = useState(30);
  const [onCallCount, setOnCallCount] = useState(1);
  const [timezone, setTimezone] = useState('Europe/Rome');

  const [capacityFeedback, setCapacityFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [onCallFeedback, setOnCallFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);
  const [timezoneFeedback, setTimezoneFeedback] = useState<CardFeedback>(DEFAULT_FEEDBACK);

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
      if (data.timezone) {
        setTimezone(data.timezone);
      }
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

  const handleSaveCapacity = () => {
    saveSetting('max_office_capacity', String(maxOfficeCapacity), setCapacityFeedback);
  };

  const handleSaveOnCallCount = () => {
    saveSetting('on_call_count', String(onCallCount), setOnCallFeedback);
  };

  const handleSaveTimezone = () => {
    saveSetting('timezone', timezone, setTimezoneFeedback);
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
