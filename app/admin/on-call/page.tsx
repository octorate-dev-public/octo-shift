'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { OnCallDailyAssignment, User } from '@/types';
import { formatDate, parseDateString } from '@/lib/utils';

// ─── Costanti ────────────────────────────────────────────────────────────────
const GIORNI_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const MESI_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

/** Palette colori per i dipendenti (ciclica). */
const USER_COLORS = [
  { bg: 'bg-blue-500',    light: 'bg-blue-100',    text: 'text-blue-700',    dot: '#3b82f6' },
  { bg: 'bg-emerald-500', light: 'bg-emerald-100',  text: 'text-emerald-700', dot: '#10b981' },
  { bg: 'bg-violet-500',  light: 'bg-violet-100',   text: 'text-violet-700',  dot: '#8b5cf6' },
  { bg: 'bg-rose-500',    light: 'bg-rose-100',     text: 'text-rose-700',    dot: '#f43f5e' },
  { bg: 'bg-amber-500',   light: 'bg-amber-100',    text: 'text-amber-700',   dot: '#f59e0b' },
  { bg: 'bg-cyan-500',    light: 'bg-cyan-100',     text: 'text-cyan-700',    dot: '#06b6d4' },
  { bg: 'bg-pink-500',    light: 'bg-pink-100',     text: 'text-pink-700',    dot: '#ec4899' },
  { bg: 'bg-teal-500',    light: 'bg-teal-100',     text: 'text-teal-700',    dot: '#14b8a6' },
];

// ─── Tipi interni ─────────────────────────────────────────────────────────────
interface DayRow {
  date: string;          // YYYY-MM-DD
  dateObj: Date;
  dayLabel: string;      // es. "Lun 5"
  monthIdx: number;      // 0-11
  weekNum: number;       // numero settimana nell'anno (1-based)
  userId: string | null; // utente assegnato (null = non coperto)
  hasVacation: boolean;  // l'assegnato è in ferie quel giorno
  isToday: boolean;
  isMonday: boolean;
}

interface SwapState {
  mode: 'idle' | 'selecting-target';
  sourceDate: string | null;
  sourceUserId: string | null;
}

interface ReassignModal {
  date: string;
  currentUserId: string | null;
  targetUserId: string;
  consecutiveWarning: boolean;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getDaysOfYear(year: number): Date[] {
  const days: Date[] = [];
  const d = new Date(year, 0, 1);
  while (d.getFullYear() === year) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Numero settimana ISO (1-based) */
function getISOWeek(date: Date): number {
  const jan1 = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date.getTime() - jan1.getTime()) / 86400000);
  return Math.ceil((dayOfYear + jan1.getDay() + 1) / 7);
}

function checkConsecutiveViolation(
  date: string,
  newUserId: string,
  assignmentMap: Map<string, string>,
): boolean {
  const d = parseDateString(date);
  let consecutive = 1;
  for (let i = 1; i <= 7; i++) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - i);
    if (assignmentMap.get(formatDate(prev)) === newUserId) consecutive++;
    else break;
  }
  for (let i = 1; i <= 7; i++) {
    const next = new Date(d);
    next.setDate(next.getDate() + i);
    if (assignmentMap.get(formatDate(next)) === newUserId) consecutive++;
    else break;
  }
  return consecutive > 7;
}

// ─── Componente principale ────────────────────────────────────────────────────
export default function AdminOnCallMatricePage() {
  const today = new Date();
  const todayStr = formatDate(today);

  const [year, setYear] = useState(today.getFullYear());
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [assignments, setAssignments] = useState<OnCallDailyAssignment[]>([]);
  const [vacationDates, setVacationDates] = useState<Map<string, Set<string>>>(new Map());

  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set([today.getMonth()]));
  const [swap, setSwap] = useState<SwapState>({ mode: 'idle', sourceDate: null, sourceUserId: null });
  const [modal, setModal] = useState<ReassignModal | null>(null);
  const [showOnlyAvailable, setShowOnlyAvailable] = useState(true);

  const todayRef = useRef<HTMLTableRowElement | null>(null);

  // ── Utenti visibili in colonna (utente corrente sempre in prima posizione) ──
  const visibleUsers = useMemo(() => {
    const filtered = users.filter((u) => !showOnlyAvailable || u.on_call_available);
    if (!currentUserId) return filtered;
    const me = filtered.find((u) => u.id === currentUserId);
    if (!me) return filtered;
    return [me, ...filtered.filter((u) => u.id !== currentUserId)];
  }, [users, showOnlyAvailable, currentUserId]);

  const userColorMap = useMemo(() => {
    const map = new Map<string, (typeof USER_COLORS)[0]>();
    visibleUsers.forEach((u, i) => map.set(u.id, USER_COLORS[i % USER_COLORS.length]));
    return map;
  }, [visibleUsers]);

  const assignmentMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of assignments) map.set(a.assignment_date, a.user_id);
    return map;
  }, [assignments]);

  const dayRows = useMemo((): DayRow[] => {
    return getDaysOfYear(year).map((dateObj) => {
      const date = formatDate(dateObj);
      const userId = assignmentMap.get(date) ?? null;
      return {
        date,
        dateObj,
        dayLabel: `${GIORNI_IT[dateObj.getDay()]} ${dateObj.getDate()}`,
        monthIdx: dateObj.getMonth(),
        weekNum: getISOWeek(dateObj),
        userId,
        hasVacation: userId ? (vacationDates.get(userId)?.has(date) ?? false) : false,
        isToday: date === todayStr,
        isMonday: dateObj.getDay() === 1,
      };
    });
  }, [year, assignmentMap, vacationDates, todayStr]);

  const rowsByMonth = useMemo(() => {
    const groups: DayRow[][] = Array.from({ length: 12 }, () => []);
    for (const row of dayRows) groups[row.monthIdx].push(row);
    return groups;
  }, [dayRows]);

  const stats = useMemo(() => {
    const total = dayRows.length;
    const covered = dayRows.filter((r) => r.userId !== null).length;
    const conflicts = dayRows.filter((r) => r.hasVacation).length;
    let violations = 0;
    let runUser = '';
    let runCount = 0;
    for (const r of dayRows) {
      if (r.userId === runUser && runUser !== '') {
        runCount++;
        if (runCount === 8) violations++;
      } else {
        runUser = r.userId ?? '';
        runCount = 1;
      }
    }
    return { total, covered, uncovered: total - covered, conflicts, violations };
  }, [dayRows]);

  // ─── Caricamento ──────────────────────────────────────────────────────────
  const loadVacations = useCallback(async (yr: number) => {
    try {
      const shifts = await api.get<Array<{ user_id: string; shift_date: string; leave_type: string | null }>>(
        `/api/shifts?year=${yr}&leaveType=vacation`,
      );
      const map = new Map<string, Set<string>>();
      for (const s of shifts) {
        if (s.leave_type !== 'vacation') continue;
        if (!map.has(s.user_id)) map.set(s.user_id, new Set());
        map.get(s.user_id)!.add(s.shift_date);
      }
      setVacationDates(map);
    } catch {
      setVacationDates(new Map());
    }
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, assignmentsData] = await Promise.all([
        api.get<User[]>('/api/users?sortBy=seniority'),
        api.get<OnCallDailyAssignment[]>(`/api/on-call?dailyYear=${year}`),
      ]);
      setUsers(usersData);
      setAssignments(assignmentsData);
      await loadVacations(year);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  }, [year, loadVacations]);

  // Recupera l'utente autenticato (per metterlo in prima colonna)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!loading && year === today.getFullYear() && todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Azioni ───────────────────────────────────────────────────────────────
  const showSuccess = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 3500);
  };

  const handleGenerateYear = async () => {
    const available = users.filter((u) => u.on_call_available);
    if (available.length === 0) {
      setError('Nessun dipendente disponibile alla reperibilità. Abilitane almeno uno in Gestione Utenti.');
      return;
    }
    if (!confirm(`Generare la rotazione per tutto il ${year}?\nLe assegnazioni esistenti verranno sostituite.`)) return;
    try {
      setGenerating(true);
      setError(null);
      const result = await api.post<{ generated: number }>('/api/on-call', {
        generateAnnual: true,
        year,
        userIds: available.map((u) => u.id),
      });
      showSuccess(`Generati ${result.generated} giorni di reperibilità per ${year}.`);
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nella generazione');
    } finally {
      setGenerating(false);
    }
  };

  // Click su cella: riassegna o completa swap
  const handleCellClick = (date: string, targetUserId: string) => {
    const currentUserId = assignmentMap.get(date) ?? null;

    // Completa swap settimane
    if (swap.mode === 'selecting-target' && swap.sourceDate && swap.sourceUserId) {
      if (targetUserId === swap.sourceUserId) {
        setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
        return;
      }
      doSwapWeeks(swap.sourceDate, swap.sourceUserId, date, targetUserId);
      setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
      return;
    }

    if (currentUserId === targetUserId) return;
    const consecutiveWarning = checkConsecutiveViolation(date, targetUserId, assignmentMap);
    setModal({ date, currentUserId, targetUserId, consecutiveWarning });
  };

  const handleConfirmReassign = async () => {
    if (!modal) return;
    try {
      setSaving(true);
      await api.patch('/api/on-call', { reassign: true, date: modal.date, userId: modal.targetUserId });
      setAssignments((prev) => [
        ...prev.filter((a) => a.assignment_date !== modal.date),
        { id: '', user_id: modal.targetUserId, assignment_date: modal.date, created_at: '', updated_at: '' },
      ]);
      showSuccess('Giorno riassegnato.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nel salvataggio');
    } finally {
      setSaving(false);
      setModal(null);
    }
  };

  // Swap settimane intere
  const doSwapWeeks = async (date1: string, userId1: string, date2: string, userId2: string) => {
    const getWeekDates = (centerDate: string, uid: string): string[] => {
      const d = parseDateString(centerDate);
      const dow = d.getDay();
      const mon = new Date(d);
      mon.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
      const dates: string[] = [];
      for (let i = 0; i < 7; i++) {
        const dd = new Date(mon);
        dd.setDate(mon.getDate() + i);
        const ds = formatDate(dd);
        if (assignmentMap.get(ds) === uid) dates.push(ds);
      }
      return dates;
    };
    const dates1 = getWeekDates(date1, userId1);
    const dates2 = getWeekDates(date2, userId2);
    if (dates1.length === 0 || dates2.length === 0) return;
    try {
      setSaving(true);
      await api.patch('/api/on-call', { swap: true, userId1, dates1, userId2, dates2 });
      setAssignments((prev) => {
        const map = new Map(prev.map((a) => [a.assignment_date, { ...a }]));
        for (const d of dates1) { const e = map.get(d); if (e) e.user_id = userId2; }
        for (const d of dates2) { const e = map.get(d); if (e) e.user_id = userId1; }
        return Array.from(map.values());
      });
      showSuccess('Settimane scambiate con successo.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nello scambio');
    } finally {
      setSaving(false);
    }
  };

  const cancelSwap = () => setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });

  const toggleMonth = (m: number) =>
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      next.has(m) ? next.delete(m) : next.add(m);
      return next;
    });

  // ─── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Layout userRole="admin" userName="Admin">
        <div className="flex items-center justify-center py-24">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Reperibilità Annuale</h1>
            <p className="text-gray-500 mt-1 text-sm">
              Matrice giorni / dipendenti — clic su pallino assegnato per avviare swap settimana, clic su &quot;+&quot; per riassegnare
            </p>
          </div>

          {/* Navigazione anno */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setYear((y) => y - 1)}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition"
            >
              ← {year - 1}
            </button>
            <span className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-lg">
              {year}
            </span>
            <button
              onClick={() => setYear((y) => y + 1)}
              className="px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition"
            >
              {year + 1} →
            </button>
          </div>

          <button
            onClick={handleGenerateYear}
            disabled={generating || saving}
            className="bg-blue-600 hover:bg-blue-700 text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
          >
            {generating ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Generazione…</>
            ) : (
              <>⚡ Genera {year}</>
            )}
          </button>
        </div>

        {/* Alert errori / successo */}
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 px-4 py-3 rounded-lg flex items-start gap-2">
            <span className="mt-0.5 flex-shrink-0">⚠️</span>
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 ml-2">✕</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-700 px-4 py-3 rounded-lg">
            ✓ {successMsg}
          </div>
        )}

        {/* Banner swap attivo */}
        {swap.mode === 'selecting-target' && (
          <div className="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-lg flex items-center gap-3">
            <span className="text-xl">↕</span>
            <span className="font-medium flex-1">
              Modalità swap attiva — clicca sul pallino assegnato di un altro dipendente per scambiare la rispettiva settimana.
            </span>
            <button
              onClick={cancelSwap}
              className="text-sm bg-amber-200 hover:bg-amber-300 text-amber-900 px-3 py-1.5 rounded-lg font-medium transition"
            >
              Annulla
            </button>
          </div>
        )}

        {/* Statistiche */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Giorni totali"       value={stats.total}     color="blue" />
          <StatCard label="Giorni coperti"      value={stats.covered}   color="emerald" />
          <StatCard label="Giorni scoperti"     value={stats.uncovered} color={stats.uncovered > 0 ? 'red' : 'gray'} />
          <StatCard label="Conflitti ferie"     value={stats.conflicts} color={stats.conflicts > 0 ? 'amber' : 'gray'} />
          <StatCard label=">7gg consecutivi"    value={stats.violations}color={stats.violations > 0 ? 'rose' : 'gray'} />
        </div>

        {/* Legenda utenti */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Legenda:</span>
            <div className="flex flex-wrap gap-4 flex-1">
              {visibleUsers.map((u) => {
                const c = userColorMap.get(u.id);
                const count = assignments.filter((a) => a.user_id === u.id).length;
                return (
                  <div key={u.id} className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: c?.dot ?? '#6b7280' }}
                    />
                    <span className="text-sm text-gray-700 font-medium">{u.full_name}</span>
                    <span className="text-xs text-gray-400">({count}gg)</span>
                    {!u.on_call_available && <span className="text-xs text-gray-400 italic">non reperibile</span>}
                  </div>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none ml-auto">
              <input
                type="checkbox"
                checked={showOnlyAvailable}
                onChange={(e) => setShowOnlyAvailable(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-blue-600"
              />
              Solo reperibili
            </label>
          </div>
        </div>

        {/* Controlli espansione / navigazione */}
        <div className="flex items-center justify-between text-sm">
          <div className="flex gap-3">
            <button onClick={() => setExpandedMonths(new Set([0,1,2,3,4,5,6,7,8,9,10,11]))} className="text-blue-600 hover:text-blue-800 font-medium">
              Espandi tutti
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={() => setExpandedMonths(new Set())} className="text-gray-500 hover:text-gray-700 font-medium">
              Comprimi tutti
            </button>
          </div>
          {year === today.getFullYear() && (
            <button
              onClick={() => todayRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
              className="text-blue-600 hover:text-blue-800 font-medium"
            >
              📍 Vai ad oggi
            </button>
          )}
        </div>

        {/* Matrice */}
        {assignments.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 text-center py-20 px-4">
            <div className="text-5xl mb-4">📅</div>
            <p className="text-lg font-semibold text-gray-700">Nessuna reperibilità per {year}</p>
            <p className="text-sm text-gray-500 mt-1">
              Premi <strong>⚡ Genera {year}</strong> per creare automaticamente la rotazione annuale.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                {/* Intestazione sticky */}
                <thead className="sticky top-0 z-20">
                  <tr className="border-b-2 border-gray-200 bg-white shadow-sm">
                    <th className="px-3 py-3 text-left font-semibold text-gray-500 bg-white min-w-[140px] text-xs uppercase tracking-wide">
                      Data
                    </th>
                    {visibleUsers.map((u) => {
                      const c = userColorMap.get(u.id);
                      const isMe = u.id === currentUserId;
                      return (
                        <th key={u.id} className="px-2 py-3 text-center min-w-[80px] bg-white">
                          <div className="flex flex-col items-center gap-1">
                            <div className="relative">
                              <span
                                className={`w-8 h-8 rounded-full text-white text-xs font-bold flex items-center justify-center ${c?.bg ?? 'bg-gray-400'}`}
                              >
                                {getInitials(u.full_name)}
                              </span>
                              {isMe && (
                                <span className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border-2 border-white rounded-full" title="Tu" />
                              )}
                            </div>
                            <span className="text-xs text-gray-600 font-medium leading-tight max-w-[72px] truncate" title={u.full_name}>
                              {isMe ? 'Tu' : u.full_name.split(' ')[0]}
                            </span>
                          </div>
                        </th>
                      );
                    })}
                    <th className="px-2 py-3 bg-white text-center text-xs text-gray-400 font-medium min-w-[50px]">
                      ↕
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rowsByMonth.map((monthRows, monthIdx) => {
                    const coveredInMonth = monthRows.filter((r) => r.userId !== null).length;
                    const conflictsInMonth = monthRows.filter((r) => r.hasVacation).length;
                    const isExpanded = expandedMonths.has(monthIdx);

                    return (
                      <React.Fragment key={monthIdx}>
                        {/* Header mese — cliccabile */}
                        <tr
                          onClick={() => toggleMonth(monthIdx)}
                          className="cursor-pointer select-none bg-gray-100 hover:bg-gray-200 transition-colors border-t border-gray-200"
                        >
                          <td
                            colSpan={visibleUsers.length + 2}
                            className="px-4 py-2.5 font-bold text-gray-700"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-gray-400 text-xs w-4">{isExpanded ? '▼' : '▶'}</span>
                              <span>{MESI_IT[monthIdx]} {year}</span>
                              <span className="text-xs font-normal text-gray-500">
                                {coveredInMonth}/{monthRows.length} giorni coperti
                              </span>
                              {conflictsInMonth > 0 && (
                                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                                  ⚠️ {conflictsInMonth} conflitti ferie
                                </span>
                              )}
                              {coveredInMonth < monthRows.length && (
                                <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-medium">
                                  {monthRows.length - coveredInMonth} scoperti
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Righe giorno */}
                        {isExpanded && monthRows.map((row) => {
                          const isSwapSource = swap.sourceDate === row.date;

                          return (
                            <tr
                              key={row.date}
                              ref={row.isToday ? todayRef : undefined}
                              className={[
                                'border-b border-gray-100 transition-colors',
                                row.isMonday && !row.isToday ? 'bg-gray-50/40' : '',
                                row.isToday ? 'bg-blue-50 ring-1 ring-inset ring-blue-300' : '',
                                isSwapSource ? 'bg-amber-50 ring-1 ring-inset ring-amber-400' : '',
                              ].filter(Boolean).join(' ')}
                            >
                              {/* Colonna data */}
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  {row.isMonday ? (
                                    <span className="text-xs text-gray-300 font-mono w-6 text-right">W{row.weekNum}</span>
                                  ) : (
                                    <span className="w-6" />
                                  )}
                                  <span className={[
                                    'font-medium',
                                    row.isToday ? 'text-blue-700' : 'text-gray-700',
                                  ].join(' ')}>
                                    {row.dayLabel}
                                  </span>
                                  {row.isToday && (
                                    <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">oggi</span>
                                  )}
                                </div>
                              </td>

                              {/* Celle dipendenti */}
                              {visibleUsers.map((u) => {
                                const isAssigned = row.userId === u.id;
                                const c = userColorMap.get(u.id);
                                const isSwapTargetCandidate =
                                  swap.mode === 'selecting-target' && isAssigned && row.date !== swap.sourceDate;

                                if (isAssigned) {
                                  return (
                                    <td key={u.id} className="px-2 py-1 text-center">
                                      <button
                                        title={
                                          swap.mode === 'idle'
                                            ? `${u.full_name} — clicca per avviare scambio settimana`
                                            : `Scambia settimana con ${u.full_name}`
                                        }
                                        onClick={() => {
                                          if (swap.mode === 'idle') {
                                            setSwap({ mode: 'selecting-target', sourceDate: row.date, sourceUserId: u.id });
                                          } else if (swap.mode === 'selecting-target' && swap.sourceDate && swap.sourceUserId) {
                                            if (u.id !== swap.sourceUserId) {
                                              doSwapWeeks(swap.sourceDate, swap.sourceUserId, row.date, u.id);
                                            }
                                            setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
                                          }
                                        }}
                                        className={[
                                          'w-8 h-8 rounded-full text-white text-xs font-bold mx-auto flex items-center justify-center transition-all cursor-pointer',
                                          c?.bg ?? 'bg-gray-400',
                                          'hover:scale-110 hover:shadow-md',
                                          row.hasVacation ? 'ring-2 ring-red-500 ring-offset-1' : '',
                                          isSwapSource ? 'ring-2 ring-amber-500 ring-offset-2 scale-110 shadow-md' : '',
                                          isSwapTargetCandidate ? 'ring-2 ring-amber-400 ring-offset-1 animate-pulse' : '',
                                        ].filter(Boolean).join(' ')}
                                      >
                                        {row.hasVacation ? '⚠' : getInitials(u.full_name)}
                                      </button>
                                    </td>
                                  );
                                }

                                return (
                                  <td key={u.id} className="px-2 py-1 text-center">
                                    <button
                                      title={
                                        swap.mode === 'selecting-target'
                                          ? undefined
                                          : `Assegna ${row.dayLabel} a ${u.full_name}`
                                      }
                                      disabled={swap.mode === 'selecting-target'}
                                      onClick={() => handleCellClick(row.date, u.id)}
                                      className={[
                                        'w-8 h-8 rounded-full mx-auto flex items-center justify-center transition-all',
                                        swap.mode === 'selecting-target'
                                          ? 'opacity-20 cursor-not-allowed'
                                          : 'border-2 border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 hover:bg-gray-50 cursor-pointer',
                                      ].join(' ')}
                                    >
                                      <span className="text-xs leading-none">+</span>
                                    </button>
                                  </td>
                                );
                              })}

                              {/* Colonna ↕ scambio rapido */}
                              <td className="px-2 py-1 text-center">
                                {row.userId && (
                                  <button
                                    title={isSwapSource ? 'Annulla scambio' : 'Avvia scambio settimana'}
                                    onClick={() => {
                                      if (isSwapSource) cancelSwap();
                                      else if (swap.mode === 'idle') {
                                        setSwap({ mode: 'selecting-target', sourceDate: row.date, sourceUserId: row.userId! });
                                      }
                                    }}
                                    className={[
                                      'text-xs px-1.5 py-1 rounded transition-colors font-mono',
                                      isSwapSource
                                        ? 'bg-amber-200 text-amber-800 font-bold'
                                        : 'text-gray-300 hover:text-gray-600 hover:bg-gray-100',
                                    ].join(' ')}
                                  >
                                    ↕
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Nota legenda simboli */}
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50 text-xs text-gray-500 flex flex-wrap gap-4">
              <span><strong className="text-gray-700">Pallino pieno</strong> = reperibile assegnato</span>
              <span><strong className="text-red-600">⚠ bordo rosso</strong> = dipendente in ferie quel giorno</span>
              <span><strong className="text-gray-700">+ tratteggiato</strong> = clic per assegnare</span>
              <span><strong className="text-amber-700">↕</strong> = avvia scambio settimana</span>
              <span><strong className="text-gray-700">W</strong> = numero settimana ISO</span>
            </div>
          </div>
        )}
      </div>

      {/* Modal conferma riassegnazione */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h2 className="text-xl font-bold text-gray-900">Riassegna giorno</h2>

            <p className="text-gray-600">
              Vuoi assegnare{' '}
              <strong>
                {parseDateString(modal.date).toLocaleDateString('it-IT', {
                  weekday: 'long', day: 'numeric', month: 'long',
                })}
              </strong>{' '}
              a{' '}
              <strong className="text-blue-700">
                {users.find((u) => u.id === modal.targetUserId)?.full_name ?? '—'}
              </strong>
              ?
            </p>

            {modal.currentUserId && (
              <p className="text-sm text-gray-500">
                Attuale:{' '}
                <span className="font-medium text-gray-700">
                  {users.find((u) => u.id === modal.currentUserId)?.full_name ?? '—'}
                </span>
              </p>
            )}

            {modal.consecutiveWarning && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800 flex gap-2">
                <span>⚠️</span>
                <span>
                  Questa assegnazione creerebbe più di <strong>7 giorni consecutivi</strong> per questo dipendente.
                </span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setModal(null)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 font-medium hover:bg-gray-50 transition"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmReassign}
                disabled={saving}
                className="flex-1 px-4 py-2.5 rounded-xl bg-blue-600 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50"
              >
                {saving ? 'Salvataggio…' : 'Conferma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ─── Sotto-componente StatCard ────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: 'blue' | 'emerald' | 'red' | 'amber' | 'rose' | 'gray';
}) {
  const colorMap: Record<string, string> = {
    blue:    'bg-blue-50 text-blue-700 border-blue-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red:     'bg-red-50 text-red-700 border-red-200',
    amber:   'bg-amber-50 text-amber-700 border-amber-200',
    rose:    'bg-rose-50 text-rose-700 border-rose-200',
    gray:    'bg-gray-50 text-gray-500 border-gray-200',
  };
  return (
    <div className={`rounded-xl border p-3 text-center ${colorMap[color]}`}>
      <div className="text-2xl font-bold leading-none">{value}</div>
      <div className="text-xs font-medium mt-1 opacity-80 leading-tight">{label}</div>
    </div>
  );
}
