'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { useAuth } from '@/lib/useAuth';
import { User } from '@/types';

const WEEKDAYS: Array<{ value: string; label: string }> = [
  { value: 'monday', label: 'Lunedì' },
  { value: 'tuesday', label: 'Martedì' },
  { value: 'wednesday', label: 'Mercoledì' },
  { value: 'thursday', label: 'Giovedì' },
  { value: 'friday', label: 'Venerdì' },
];

export default function ProfilePage() {
  const { userId, userName, userRole, logout } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [me, setMe] = useState<User | null>(null);
  const [phone, setPhone] = useState('');
  const [workAddress, setWorkAddress] = useState('');
  const [commuteMinutes, setCommuteMinutes] = useState<number | null>(null);
  const [preferredSmartDay, setPreferredSmartDay] = useState('');
  const [desiredSmart, setDesiredSmart] = useState<number>(8);
  const [scheduleStyle, setScheduleStyle] = useState<'stable' | 'random'>('random');

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const u = await api.get<User>(`/api/users?id=${userId}`);
      setMe(u);
      setPhone(u.phone ?? '');
      setWorkAddress(u.work_address ?? '');
      setCommuteMinutes(u.commute_minutes ?? null);
      setPreferredSmartDay(u.preferred_smart_day ?? '');
      setDesiredSmart(u.desired_smart_days_per_month ?? 8);
      setScheduleStyle(u.schedule_style ?? 'random');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel caricamento del profilo');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => { setSuccess(msg); setTimeout(() => setSuccess(null), 3500); };

  const handleCalcDistance = async () => {
    if (!userId || !workAddress.trim()) { setError('Inserisci prima un indirizzo'); return; }
    setCalcBusy(true);
    setError(null);
    try {
      const res = await api.post<{ minutes: number; durationText: string; distanceText: string | null; office: string }>(
        '/api/distance',
        { userId, address: workAddress.trim() },
      );
      setCommuteMinutes(res.minutes);
      flash(`Distanza calcolata: ${res.durationText}${res.distanceText ? ` · ${res.distanceText}` : ''} (verso ${res.office})`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel calcolo della distanza');
    } finally {
      setCalcBusy(false);
    }
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    setError(null);
    try {
      await api.patch('/api/users', {
        id: userId,
        phone: phone.trim(),
        workAddress: workAddress.trim(),
        preferredSmartDay,
        desiredSmartDaysPerMonth: desiredSmart,
        scheduleStyle,
      });
      flash('Profilo salvato');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Errore nel salvataggio');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout userRole={userRole} userName={userName} onLogout={logout}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Il mio Profilo</h1>
          <p className="text-gray-600 mt-2">Configura le tue preferenze personali.</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-lg text-sm">{success}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Identità (sola lettura) */}
            <div className="bg-white rounded-lg shadow p-6">
              <p className="text-sm text-gray-500">Nome</p>
              <p className="text-base font-medium text-gray-900">{me?.full_name}</p>
              <p className="text-sm text-gray-500 mt-3">Email</p>
              <p className="text-base font-medium text-gray-900">{me?.email}</p>
            </div>

            {/* Distanza dal lavoro */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Distanza dal lavoro</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Inserisci la tua città o indirizzo di casa e calcola il tempo di percorrenza verso l&apos;ufficio.
                  Un tragitto più lungo ti dà una leggera priorità sullo smart working.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Indirizzo di casa</label>
                <input
                  type="text"
                  value={workAddress}
                  onChange={(e) => setWorkAddress(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Es. Via Roma 1, Milano"
                />
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={handleCalcDistance}
                  disabled={calcBusy || !workAddress.trim()}
                  className="btn-secondary text-sm disabled:opacity-50"
                >
                  {calcBusy ? '⏳ Calcolo...' : '📍 Calcola distanza'}
                </button>
                <span className="text-sm text-gray-600">
                  {commuteMinutes != null ? `≈ ${commuteMinutes} min in auto` : 'Non ancora calcolata'}
                </span>
              </div>
            </div>

            {/* Giorno smart preferito */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Giorno smart preferito</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Puoi indicare <strong>un</strong> giorno della settimana in cui preferisci lo smart working.
                  La generazione cercherà di rispettarlo, senza violare i minimi in ufficio.
                </p>
              </div>
              <select
                value={preferredSmartDay}
                onChange={(e) => setPreferredSmartDay(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Nessuna preferenza —</option>
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Giorni di smart desiderati al mese */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Giorni di smart al mese desiderati</h2>
                <p className="text-sm text-gray-500 mt-1">
                  Indica quanti giorni di smart working al mese <strong>vorresti</strong>. Chi preferisce venire di
                  più in ufficio mette un numero basso, chi si trova meglio da casa un numero alto. È una preferenza
                  che aiuta a bilanciare la generazione del mese.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min={0}
                  max={22}
                  step={1}
                  value={desiredSmart}
                  onChange={(e) => setDesiredSmart(Number(e.target.value))}
                  className="flex-1 accent-blue-600"
                />
                <span className="text-lg font-semibold text-gray-900 w-20 text-right tabular-nums">
                  {desiredSmart} gg
                </span>
              </div>
              <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 rounded-lg">
                ⚠️ È solo una preferenza. Vincono sempre le regole aziendali: se serve riempire l&apos;ufficio, la
                regola dell&apos;ufficio ha la priorità, e non si può superare il numero massimo di giorni di smart a
                settimana previsto. Il numero desiderato può quindi non essere raggiunto.
              </div>
            </div>

            {/* Contatto + stile */}
            <div className="bg-white rounded-lg shadow p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Telefono <span className="text-gray-400 font-normal">(reperibilità)</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="+39 333 1234567"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Stile di distribuzione smart</label>
                <div className="flex gap-2">
                  {(['stable', 'random'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScheduleStyle(s)}
                      className={`flex-1 text-sm font-medium py-2 px-3 rounded-lg border transition-colors ${
                        scheduleStyle === s
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {s === 'stable' ? 'Stabile (stesso giorno)' : 'Variato (random)'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
                {saving ? 'Salvataggio...' : 'Salva profilo'}
              </button>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
