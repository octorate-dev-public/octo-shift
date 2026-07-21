'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import DraggableUserList from '@/components/DraggableUserList';
import DayShiftPanel from '@/components/DayShiftPanel';
import { api } from '@/lib/fetcher';
import { ShiftWithUser, User, Team, ShiftPreference, PreferenceType, LeaveType } from '@/types';
import type { SwapCell } from '@/components/Calendar';
import { useAuth } from '@/lib/useAuth';
import RulesPanel from '@/components/RulesPanel';
import type { RulesSection } from '@/components/RulesPanel';
import ShiftMatrixImportPanel from '@/components/ShiftMatrixImportPanel';
import { exportShiftMatrix } from '@/lib/shiftMatrixExcel';

const SCHEDULE_RULES: RulesSection[] = [
  {
    icon: '⚖️',
    title: 'Equità (priorità principale)',
    items: [
      'Lo smart è distribuito PER SETTIMANA: obiettivo ≈ (smart minimo mensile ÷ settimane del mese) giorni di smart a settimana. Così ognuno mescola ufficio e smart ogni settimana, senza restare in ufficio per settimane intere.',
      'Il minimo smart mensile è configurabile nelle Impostazioni (default 8).',
      'L\'ufficio si riempie al minimo a ⌈capienza/3⌉ e al massimo alla capienza, ma non deve per forza essere pieno: se saturarlo toglierebbe smart, resta più vuoto (almeno 1 persona però c\'è sempre).',
      'Le ferie/permessi contano come smart: chi conta 8 giorni tra smart e ferie ha la quota coperta. Chi è stato in ferie ha quindi priorità ufficio quando è presente (non accumula altro smart), così i giorni fuori-ufficio si bilanciano tra tutti.',
      'L\'equità bilancia lo "smart-equivalente" (smart reali + ferie): chi è sopra la media va in ufficio, chi è sotto va in smart.',
      'Dipendenti con "rinuncia smart" sono sempre assegnati all\'ufficio e vengono esclusi dal calcolo dell\'equità.',
    ],
  },
  {
    icon: '📅',
    title: 'Riunioni di team',
    items: [
      'Il giorno settimanale di riunione del team garantisce (quasi) la presenza in ufficio.',
      'Il bonus riunione ha peso 10×, superiore a equità, seniority e preferenza.',
      'Se la capienza è già piena, anche il giorno di riunione può risultare smart.',
    ],
  },
  {
    icon: '🏅',
    title: 'Anzianità (tiebreaker)',
    items: [
      'A parità di punteggio equità, i dipendenti più anziani hanno priorità ufficio.',
      'L\'anzianità è calcolata dalla data di inizio rapporto (campo "Data anzianità").',
      'Peso lineare: il dipendente più senior prende +2 punti, il meno senior +0.',
    ],
  },
  {
    icon: '🏠',
    title: 'Preferenze personali',
    items: [
      '"Ufficio" aggiunge +3 punti, "Indifferente" +1, "Casa" +0.',
      'Le preferenze pesano meno di equità e riunione — non le battono.',
      'Le preferenze si impostano mese per mese dalla propria dashboard.',
    ],
  },
  {
    icon: '📆',
    title: 'Stile di distribuzione',
    items: [
      '"Stabile": tende a mantenere lo stesso giorno ufficio/smart ogni settimana (±0.8 punti).',
      '"Random": introduce una variazione casuale (±0.25) per distribuire i turni in modo vario.',
      'Random settimanale (±0.3): stabile entro la settimana, cambia tra settimane → ogni tanto composizioni ufficio diverse.',
      'Mix anzianità (±0.35): a parità, alterna il nudge senior/junior per settimana → mescola anziani e giovani in ufficio.',
      'Lo stile non batte mai equità, riunioni o anzianità.',
    ],
  },
  {
    icon: '🔒',
    title: 'Turni bloccati e assenze',
    items: [
      'I turni bloccati dall\'admin non vengono mai modificati dalla generazione automatica.',
      'Ferie, permessi e malattia si sovrappongono al turno del giorno e hanno sempre priorità.',
      'Weekend e festività configurate nelle impostazioni vengono saltati automaticamente.',
    ],
  },
];

export default function SchedulePage() {
  const { userId } = useAuth();
  const [year, setYear] = useState<number>(() => new Date().getFullYear());
  const [month, setMonth] = useState<number>(() => new Date().getMonth()); // 0-based
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [shifts, setShifts] = useState<ShiftWithUser[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [holidays, setHolidays] = useState<string[]>([]);
  const [workDays, setWorkDays] = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [draggedUser, setDraggedUser] = useState<User | null>(null);
  const [dragType, setDragType] = useState<'office' | 'smartwork' | null>(null);
  const [preferences, setPreferences] = useState<ShiftPreference[]>([]);
  const [showPreferences, setShowPreferences] = useState(true);

  // ── KEROS import ──
  const [kerosLoading, setKerosLoading] = useState(false);
  const [kerosResult, setKerosResult] = useState<{
    imported: number; unmatched: number; skipped: number;
    details: Array<{ nominativo: string; leaveType: string | null; dataInizio: string; dataFine: string; giorni: number; status: string; }>;
  } | null>(null);
  const [kerosError, setKerosError] = useState<string | null>(null);
  const [showKerosModal, setShowKerosModal] = useState(false);
  const [showImportPanel, setShowImportPanel] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const m = month + 1; // API expects 1-based month
      const monthYear = `${year}-${String(m).padStart(2, '0')}`;
      const [usersData, shiftsData, settingsData, teamsData, prefsData] = await Promise.all([
        api.get<User[]>('/api/users'),
        api.get<ShiftWithUser[]>(`/api/shifts?year=${year}&month=${m}`),
        api.get<Record<string, string>>('/api/settings'),
        api.get<Team[]>('/api/teams'),
        api.get<ShiftPreference[]>(`/api/preferences?monthYear=${monthYear}`),
      ]);

      setUsers(usersData);
      setShifts(shiftsData);
      setTeams(teamsData);
      setPreferences(prefsData);
      setMaxCapacity(
        settingsData.max_office_capacity ? parseInt(settingsData.max_office_capacity) : 30,
      );
      const newHolidays = Object.keys(settingsData)
        .filter((k) => k.startsWith('holiday:'))
        .map((k) => k.replace('holiday:', ''));
      setHolidays(newHolidays);
      if (settingsData.work_days) {
        setWorkDays(settingsData.work_days.split(',').map((d: string) => d.trim()).filter(Boolean));
      }
    } catch (error: unknown) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleShiftChange = async (userId: string, shiftDate: string, newType: 'office' | 'smartwork') => {
    await api.post('/api/shifts', { userId, shiftDate, shiftType: newType });
    await loadData();
  };

  const handleLeaveChange = async (userId: string, shiftDate: string, leaveType: LeaveType | null) => {
    await api.patch('/api/shifts', { userId, shiftDate, action: 'setLeave', leaveType });
    await loadData();
  };

  const handleSwapShifts = async (a: SwapCell, b: SwapCell) => {
    const tasks: Promise<any>[] = [];

    // Position A → gets B's type
    if (b.shiftType) {
      tasks.push(api.post('/api/shifts', { userId: a.userId, shiftDate: a.date, shiftType: b.shiftType }));
    } else if (a.shiftType) {
      tasks.push(api.del(`/api/shifts?userId=${a.userId}&shiftDate=${a.date}`));
    }

    // Position B → gets A's type
    if (a.shiftType) {
      tasks.push(api.post('/api/shifts', { userId: b.userId, shiftDate: b.date, shiftType: a.shiftType }));
    } else if (b.shiftType) {
      tasks.push(api.del(`/api/shifts?userId=${b.userId}&shiftDate=${b.date}`));
    }

    await Promise.all(tasks);
    await loadData();
  };

  const handleToggleHoliday = async (date: string) => {
    if (holidays.includes(date)) {
      await api.del(`/api/settings?key=${encodeURIComponent(`holiday:${date}`)}`);
    } else {
      await api.post('/api/settings', { key: `holiday:${date}`, value: '1' });
    }
    // Refresh settings to get updated holidays
    const settingsData = await api.get<Record<string, string>>('/api/settings');
    const newHolidays = Object.keys(settingsData)
      .filter((k) => k.startsWith('holiday:'))
      .map((k) => k.replace('holiday:', ''));
    setHolidays(newHolidays);
  };

  const handleKerosImport = async (dryRun = false) => {
    setKerosLoading(true);
    setKerosError(null);
    setKerosResult(null);
    try {
      const m = month + 1;
      const pad = (n: number) => String(n).padStart(2, '0');
      const lastDay = new Date(year, m, 0).getDate();
      const startDate = `${year}-${pad(m)}-01`;
      const endDate = `${year}-${pad(m)}-${pad(lastDay)}`;

      const result = await api.post<typeof kerosResult>('/api/keros', {
        startDate,
        endDate,
        situazione: '2', // solo approvate
        dryRun,
      });
      setKerosResult(result);
      if (!dryRun && result && result.imported > 0) {
        await loadData(); // aggiorna il calendario
      }
    } catch (err: unknown) {
      setKerosError(err instanceof Error ? err.message : 'Errore importazione KEROS');
    } finally {
      setKerosLoading(false);
    }
  };

  const handleGenerateSchedule = async () => {
    try {
      setGenerating(true);
      await api.post('/api/scheduling', {
        action: 'generate',
        year,
        month: month + 1, // 1-based
      });
      await loadData();
      alert('Schedule creato con successo!');
    } catch (error: any) {
      console.error('Error generating schedule:', error);
      alert(`Errore nella creazione dello schedule: ${error.message}`);
    } finally {
      setGenerating(false);
    }
  };

  const handleDragStart = (user: User, type: 'office' | 'smartwork') => {
    setDraggedUser(user);
    setDragType(type);
  };

  const handleDragEnd = () => {
    setDraggedUser(null);
    setDragType(null);
  };

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth()); // keep 0-based
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schedule Mensile</h1>
            <p className="text-gray-600 mt-2">Crea e gestisci lo schedule dei dipendenti</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Export matrice turni */}
            <button
              onClick={() => exportShiftMatrix(users, shifts, year, month + 1)}
              disabled={shifts.length === 0}
              title="Esporta la matrice turni del mese in Excel"
              className="btn-secondary disabled:opacity-50 text-sm"
            >
              ⬇️ Esporta
            </button>
            {/* Import matrice turni */}
            <button
              onClick={() => setShowImportPanel((v) => !v)}
              title="Importa una matrice turni da Excel (turni bloccati)"
              className="btn-secondary text-sm"
            >
              ⬆️ Importa
            </button>
            {/* Import KEROS */}
            <button
              onClick={() => { setShowKerosModal(true); handleKerosImport(true); }}
              disabled={kerosLoading}
              title="Importa ferie e permessi approvati da KEROS HR"
              className="btn-secondary disabled:opacity-50 text-sm"
            >
              {kerosLoading ? '⏳' : '📥'} KEROS
            </button>
            <button
              onClick={handleGenerateSchedule}
              disabled={generating}
              className="btn-primary disabled:opacity-50"
            >
              {generating ? '⏳ Generando...' : '📅 Genera Smart Per Questo Mese'}
            </button>
          </div>
        </div>

        {/* Pannello import matrice turni */}
        {showImportPanel && (
          <ShiftMatrixImportPanel
            users={users}
            currentUserId={userId}
            onImportDone={loadData}
            onClose={() => setShowImportPanel(false)}
          />
        )}

        {/* Pannello regole algoritmo */}
        <RulesPanel label="Come funziona la generazione automatica dello schedule" sections={SCHEDULE_RULES} />

        {/* KEROS error */}
        {kerosError && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
            <span className="flex-shrink-0">⚠️</span>
            <span className="flex-1">{kerosError}</span>
            <button onClick={() => setKerosError(null)} className="text-red-400 hover:text-red-600">✕</button>
          </div>
        )}

        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button onClick={() => handleMonthChange(-1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            ← Mese Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={() => handleMonthChange(1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium">
            Mese Successivo →
          </button>
        </div>

        {/* Preferences summary */}
        {(preferences.length > 0 || users.some((u) => u.renounce_smart)) && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Preferenze dipendenti
                {preferences.length > 0 && <span className="font-normal text-gray-500"> ({preferences.length} espresse)</span>}
              </h3>
              <button
                onClick={() => setShowPreferences(!showPreferences)}
                className="text-xs text-blue-600 hover:text-blue-800"
              >
                {showPreferences ? 'Nascondi dettagli' : 'Mostra dettagli'}
              </button>
            </div>
            {showPreferences && (() => {
              const renouncingUsers = users.filter((u) => u.renounce_smart);

              // Build summary: per user, count home/office prefs
              const userPrefSummary = new Map<string, { home: number; office: number }>();
              preferences.forEach((p) => {
                if (p.preference === 'indifferent') return;
                if (!userPrefSummary.has(p.user_id)) userPrefSummary.set(p.user_id, { home: 0, office: 0 });
                const entry = userPrefSummary.get(p.user_id)!;
                if (p.preference === 'home') entry.home++;
                if (p.preference === 'office') entry.office++;
              });

              return (
                <div className="space-y-3">
                  {renouncingUsers.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1.5">Rinuncia smart (esclusi dall&apos;equità, priorità ufficio)</p>
                      <div className="flex flex-wrap gap-2">
                        {renouncingUsers.map((u) => (
                          <span key={u.id} className="text-xs bg-orange-50 text-orange-700 border border-orange-200 rounded px-2 py-1 font-medium">
                            🏢 {u.full_name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {userPrefSummary.size > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {[...userPrefSummary.entries()].map(([uid, counts]) => {
                        const user = users.find((u) => u.id === uid);
                        return (
                          <div key={uid} className="text-xs bg-gray-50 rounded px-2 py-1.5">
                            <span className="font-medium text-gray-800">
                              {user?.full_name ?? uid.slice(0, 8)}
                            </span>
                            <div className="flex gap-2 mt-0.5 text-gray-500">
                              {counts.office > 0 && <span>🏢 {counts.office}g</span>}
                              {counts.home > 0 && <span>🏠 {counts.home}g</span>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1">
            <DraggableUserList
              users={users}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              selectedDate={selectedDate || undefined}
            />
          </div>
          <div className="lg:col-span-3">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <Calendar
                year={year}
                month={month + 1}  // Calendar expects 1-based
                shifts={shifts}
                teams={teams}
                users={users}
                holidays={holidays}
                workDays={workDays}
                maxCapacity={maxCapacity}
                onDayClick={setSelectedDate}
                selectedDate={selectedDate}
                editable={true}
                onSwapShifts={handleSwapShifts}
                currentUserId={userId}
                onAssignShift={(targetUserId, date) => {
                  // dragType è impostato dal DraggableUserList quando inizia il drag
                  if (!dragType) return;
                  handleShiftChange(targetUserId, date, dragType);
                }}
              />
            )}
          </div>
        </div>
      </div>

      <DayShiftPanel
        date={selectedDate}
        shifts={shifts}
        users={users}
        maxCapacity={maxCapacity}
        isHoliday={selectedDate ? holidays.includes(selectedDate) : false}
        onClose={() => setSelectedDate(null)}
        onShiftChange={handleShiftChange}
        onLeaveChange={handleLeaveChange}
        onToggleHoliday={handleToggleHoliday}
      />

      {/* ── Modale KEROS ── */}
      {showKerosModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h2 className="font-bold text-gray-900 text-lg">Importa da KEROS HR</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Ferie e permessi approvati — {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
                </p>
              </div>
              <button
                onClick={() => { setShowKerosModal(false); setKerosResult(null); }}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 max-h-96 overflow-y-auto">
              {kerosLoading && (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-gray-500">
                  <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" style={{ borderWidth: 3 }} />
                  <span className="text-sm">Connessione a KEROS…</span>
                </div>
              )}

              {!kerosLoading && kerosError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm">
                  ⚠️ {kerosError}
                </div>
              )}

              {!kerosLoading && kerosResult && (
                <div className="space-y-4">
                  {/* Riepilogo */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                      <p className="text-2xl font-bold text-emerald-700">{kerosResult.imported}</p>
                      <p className="text-xs text-emerald-600 mt-0.5">Giorni da importare</p>
                    </div>
                    <div className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                      <p className="text-2xl font-bold text-amber-700">{kerosResult.unmatched}</p>
                      <p className="text-xs text-amber-600 mt-0.5">Non abbinati</p>
                    </div>
                    <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-200">
                      <p className="text-2xl font-bold text-gray-600">{kerosResult.skipped}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Ignorati</p>
                    </div>
                  </div>

                  {/* Lista dettaglio */}
                  {kerosResult.details.length > 0 && (
                    <div className="space-y-1.5">
                      {kerosResult.details.map((d, i) => (
                        <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${
                          d.status === 'unmatched' ? 'bg-amber-50' :
                          d.status === 'skipped'   ? 'bg-gray-50 opacity-60' :
                          'bg-emerald-50'
                        }`}>
                          <span className="flex-shrink-0">
                            {d.status === 'unmatched' ? '⚠️' : d.status === 'skipped' ? '–' : d.leaveType === 'vacation' ? '✈️' : '⭐'}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-800 truncate">{d.nominativo}</p>
                            <p className="text-xs text-gray-500">
                              {d.dataInizio}{d.dataInizio !== d.dataFine ? ` → ${d.dataFine}` : ''} · {d.giorni}gg
                              {d.status === 'unmatched' && ' · nessun utente abbinato'}
                            </p>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            d.leaveType === 'vacation'   ? 'bg-yellow-100 text-yellow-700' :
                            d.leaveType === 'permission' ? 'bg-violet-100 text-violet-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {d.leaveType === 'vacation' ? 'Ferie' : d.leaveType === 'permission' ? 'ROL' : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {kerosResult.unmatched > 0 && (
                    <p className="text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
                      ⚠️ {kerosResult.unmatched} dipendenti KEROS non trovati in Supabase. Verifica che i nomi coincidano esattamente.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {!kerosLoading && kerosResult && (
              <div className="flex gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
                <button
                  onClick={() => { setShowKerosModal(false); setKerosResult(null); }}
                  className="btn-secondary flex-1"
                >
                  Annulla
                </button>
                <button
                  onClick={async () => {
                    await handleKerosImport(false);
                    setShowKerosModal(false);
                  }}
                  disabled={kerosLoading || (kerosResult?.imported ?? 0) === 0}
                  className="btn-primary flex-1 disabled:opacity-40"
                >
                  📥 Importa {kerosResult?.imported} giorni
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
