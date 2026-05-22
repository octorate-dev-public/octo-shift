'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { OnCallDailyAssignment, User } from '@/types';
import { formatDate, parseDateString } from '@/lib/utils';
import type { AiSuggestion, AiSuggestionAction } from '@/types';

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
  mode: 'idle' | 'selecting-day' | 'selecting-week';
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

  // ── AI Assistant ──────────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

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
      // ⚠️ Fix: usare leaveOnly=true (endpoint corretto) invece del parametro
      //    leaveType=vacation che non esiste nella route e causava un 400 silenzioso,
      //    rendendo vacationDates sempre vuoto e il bordo rosso mai visibile.
      const shifts = await api.get<Array<{ user_id: string; shift_date: string; leave_type: string | null }>>(
        `/api/shifts?year=${yr}&leaveOnly=true`,
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

  // Click su cella: completa swap (giorno o settimana) oppure apre modal riassegnazione
  const handleCellClick = (date: string, targetUserId: string) => {
    const currentUserId = assignmentMap.get(date) ?? null;

    if (swap.mode === 'selecting-day' && swap.sourceDate && swap.sourceUserId) {
      // Deseleziona se stesso
      if (swap.sourceDate === date && swap.sourceUserId === targetUserId) {
        setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
        return;
      }
      doSwapDays(swap.sourceDate, swap.sourceUserId, date, targetUserId);
      setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
      return;
    }

    if (swap.mode === 'selecting-week' && swap.sourceDate && swap.sourceUserId) {
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

  // Swap di un singolo giorno tra due utenti
  const doSwapDays = async (date1: string, userId1: string, date2: string, userId2: string) => {
    if (userId1 === userId2 && date1 === date2) return;
    try {
      setSaving(true);
      await api.patch('/api/on-call', {
        swap: true,
        userId1, dates1: [date1],
        userId2, dates2: [date2],
      });
      setAssignments((prev) => {
        const map = new Map(prev.map((a) => [a.assignment_date, { ...a }]));
        const e1 = map.get(date1);
        const e2 = map.get(date2);
        if (e1) e1.user_id = userId2;
        if (e2) e2.user_id = userId1;
        return Array.from(map.values());
      });
      showSuccess(`${parseDateString(date1).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} ↔ ${parseDateString(date2).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}: scambio effettuato.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nello scambio');
    } finally {
      setSaving(false);
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
  const isSwapActive = swap.mode !== 'idle';

  // ─── AI Assistant ──────────────────────────────────────────────────────────

  /** Costruisce il payload da inviare all'API AI. */
  const buildAiPayload = useCallback(() => {
    const todayStr2 = formatDate(today);

    // Statistiche per utente
    const userStats = users
      .filter((u) => u.on_call_available)
      .map((u) => {
        const allDays = assignments.filter((a) => a.user_id === u.id);
        const futureDays = allDays.filter((a) => a.assignment_date >= todayStr2);
        const pastDays = allDays.filter((a) => a.assignment_date < todayStr2);
        return {
          id: u.id,
          name: u.full_name,
          totalDays: allDays.length,
          futureDays: futureDays.length,
          pastDays: pastDays.length,
        };
      });

    // Lista giorni completa con metadati
    const MESI_SHORT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const days = dayRows
      .filter((r) => r.userId !== null)
      .map((r) => {
        const u = users.find((u2) => u2.id === r.userId);
        const d = r.dateObj;
        return {
          date: r.date,
          dayLabel: `${r.dayLabel} ${MESI_SHORT[r.monthIdx]}`,
          userId: r.userId!,
          userName: u?.full_name ?? r.userId!,
          hasVacation: r.hasVacation,
          isPast: r.date < todayStr2,
        };
      });

    return { year, today: todayStr2, users: userStats, days, userPrompt: aiPrompt };
  }, [year, today, users, assignments, dayRows, aiPrompt]);

  const handleAiAnalyze = async () => {
    if (assignments.length === 0) {
      setAiError('Nessuna assegnazione da analizzare. Genera prima la rotazione annuale.');
      return;
    }
    try {
      setAiLoading(true);
      setAiError(null);
      setSuggestions([]);
      setAppliedIds(new Set());
      const payload = buildAiPayload();
      const result = await api.post<{ suggestions: AiSuggestion[] }>('/api/ai-oncall', payload);
      setSuggestions(result.suggestions ?? []);
      if (result.suggestions.length === 0) {
        setAiError('L\'AI non ha trovato suggerimenti per questa programmazione.');
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Errore durante l\'analisi AI');
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplySuggestion = async (suggestion: AiSuggestion) => {
    if (!suggestion.action || applyingId) return;
    const a = suggestion.action as AiSuggestionAction;
    try {
      setApplyingId(suggestion.id);
      await api.patch('/api/on-call', {
        swap: true,
        userId1: a.userId1,
        dates1: a.dates1,
        userId2: a.userId2,
        dates2: a.dates2,
      });
      // Aggiorna lo stato locale
      setAssignments((prev) => {
        const map = new Map(prev.map((x) => [x.assignment_date, { ...x }]));
        for (const d of a.dates1) { const e = map.get(d); if (e) e.user_id = a.userId2; }
        for (const d of a.dates2) { const e = map.get(d); if (e) e.user_id = a.userId1; }
        return Array.from(map.values());
      });
      setAppliedIds((prev) => new Set([...prev, suggestion.id]));
      showSuccess(`Suggerimento applicato: ${suggestion.title}`);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Errore nell\'applicazione del suggerimento');
    } finally {
      setApplyingId(null);
    }
  };

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
              Clic sul <strong>pallino</strong> per scambiare quel giorno · <strong>↕</strong> per scambiare la settimana · <strong>+</strong> per riassegnare
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

          <div className="flex items-center gap-2">
            <button
              onClick={() => { setAiOpen(true); setSuggestions([]); setAiError(null); }}
              disabled={generating || saving}
              className="bg-violet-600 hover:bg-violet-700 text-white font-semibold px-5 py-2.5 rounded-lg transition disabled:opacity-50 flex items-center gap-2"
            >
              🤖 AI Assistant
            </button>
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
        {isSwapActive && (
          <div className={`px-4 py-3 rounded-lg flex items-center gap-3 border ${
            swap.mode === 'selecting-day'
              ? 'bg-sky-50 border-sky-300 text-sky-800'
              : 'bg-amber-50 border-amber-300 text-amber-800'
          }`}>
            <span className="text-xl">{swap.mode === 'selecting-day' ? '📅' : '↕'}</span>
            <span className="font-medium flex-1">
              {swap.mode === 'selecting-day'
                ? `Scambio GIORNO — selezionato: ${parseDateString(swap.sourceDate!).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}. Ora clicca il pallino del giorno con cui scambiare.`
                : `Scambio SETTIMANA — clicca il pallino di un altro dipendente per scambiare l'intera settimana.`
              }
            </span>
            <button
              onClick={cancelSwap}
              className={`text-sm px-3 py-1.5 rounded-lg font-medium transition ${
                swap.mode === 'selecting-day'
                  ? 'bg-sky-200 hover:bg-sky-300 text-sky-900'
                  : 'bg-amber-200 hover:bg-amber-300 text-amber-900'
              }`}
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
                                // Il pallino lampeggia come destinazione valida in entrambe le modalità swap
                                const isSwapTargetCandidate =
                                  isSwapActive && isAssigned &&
                                  !(swap.sourceDate === row.date && swap.sourceUserId === u.id);

                                if (isAssigned) {
                                  const isDaySource = swap.mode === 'selecting-day' && isSwapSource;
                                  const isWeekSource = swap.mode === 'selecting-week' && isSwapSource;
                                  return (
                                    <td key={u.id} className="px-2 py-1 text-center">
                                      <button
                                        title={
                                          swap.mode === 'idle'
                                            ? `${u.full_name} — clicca per scambiare questo giorno`
                                            : isSwapTargetCandidate
                                            ? `Scambia con ${u.full_name}`
                                            : undefined
                                        }
                                        onClick={() => {
                                          if (swap.mode === 'idle') {
                                            // Clic sul pallino → swap giorno singolo
                                            setSwap({ mode: 'selecting-day', sourceDate: row.date, sourceUserId: u.id });
                                          } else {
                                            // In qualsiasi modalità swap, completa cliccando un altro pallino
                                            handleCellClick(row.date, u.id);
                                          }
                                        }}
                                        className={[
                                          'w-8 h-8 rounded-full text-white text-xs font-bold mx-auto flex items-center justify-center transition-all cursor-pointer',
                                          c?.bg ?? 'bg-gray-400',
                                          'hover:scale-110 hover:shadow-md',
                                          row.hasVacation ? 'ring-2 ring-red-500 ring-offset-1' : '',
                                          isDaySource ? 'ring-2 ring-sky-500 ring-offset-2 scale-110 shadow-md' : '',
                                          isWeekSource ? 'ring-2 ring-amber-500 ring-offset-2 scale-110 shadow-md' : '',
                                          isSwapTargetCandidate ? 'ring-2 ring-indigo-400 ring-offset-1 animate-pulse' : '',
                                        ].filter(Boolean).join(' ')}
                                      >
                                        {row.hasVacation ? '⚠' : getInitials(u.full_name)}
                                      </button>
                                    </td>
                                  );
                                }

                                // Cella vuota: solo riassegnazione, disabilitata in swap mode
                                return (
                                  <td key={u.id} className="px-2 py-1 text-center">
                                    <button
                                      title={isSwapActive ? undefined : `Assegna ${row.dayLabel} a ${u.full_name}`}
                                      disabled={isSwapActive}
                                      onClick={() => handleCellClick(row.date, u.id)}
                                      className={[
                                        'w-8 h-8 rounded-full mx-auto flex items-center justify-center transition-all',
                                        isSwapActive
                                          ? 'opacity-15 cursor-not-allowed'
                                          : 'border-2 border-dashed border-gray-200 text-gray-300 hover:border-gray-400 hover:text-gray-500 hover:bg-gray-50 cursor-pointer',
                                      ].join(' ')}
                                    >
                                      <span className="text-xs leading-none">+</span>
                                    </button>
                                  </td>
                                );
                              })}

                              {/* Colonna ↕ — avvia swap SETTIMANA */}
                              <td className="px-2 py-1 text-center">
                                {row.userId && (
                                  <button
                                    title={
                                      isSwapSource && swap.mode === 'selecting-week'
                                        ? 'Annulla scambio settimana'
                                        : swap.mode === 'idle'
                                        ? 'Scambia settimana intera'
                                        : undefined
                                    }
                                    disabled={isSwapActive && swap.mode !== 'selecting-week'}
                                    onClick={() => {
                                      if (isSwapSource && swap.mode === 'selecting-week') {
                                        cancelSwap();
                                      } else if (swap.mode === 'idle') {
                                        setSwap({ mode: 'selecting-week', sourceDate: row.date, sourceUserId: row.userId! });
                                      } else if (swap.mode === 'selecting-week' && swap.sourceDate && swap.sourceUserId && row.userId) {
                                        doSwapWeeks(swap.sourceDate, swap.sourceUserId, row.date, row.userId);
                                        setSwap({ mode: 'idle', sourceDate: null, sourceUserId: null });
                                      }
                                    }}
                                    className={[
                                      'text-xs px-1.5 py-1 rounded transition-colors font-mono',
                                      isSwapSource && swap.mode === 'selecting-week'
                                        ? 'bg-amber-200 text-amber-800 font-bold'
                                        : isSwapActive && swap.mode !== 'selecting-week'
                                        ? 'opacity-15 cursor-not-allowed text-gray-300'
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
              <span><strong className="text-sky-600">Clic su pallino</strong> = scambia quel singolo giorno</span>
              <span><strong className="text-amber-600">↕</strong> = scambia l&apos;intera settimana</span>
              <span><strong className="text-gray-700">+ tratteggiato</strong> = riassegna giorno</span>
              <span><strong className="text-red-500">⚠ bordo rosso</strong> = ferie quel giorno</span>
              <span><strong className="text-gray-500">W</strong> = settimana ISO</span>
            </div>
          </div>
        )}
      </div>

      {/* ─── Pannello AI Assistant ─────────────────────────────────────────── */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Overlay */}
          <div
            className="flex-1 bg-black/30 backdrop-blur-sm"
            onClick={() => setAiOpen(false)}
          />
          {/* Pannello laterale */}
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">
            {/* Header pannello */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-violet-600 to-indigo-600">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  🤖 AI Assistant
                </h2>
                <p className="text-violet-200 text-xs mt-0.5">
                  Analisi intelligente della reperibilità {year}
                </p>
              </div>
              <button
                onClick={() => setAiOpen(false)}
                className="text-white/70 hover:text-white text-xl transition leading-none"
              >
                ✕
              </button>
            </div>

            {/* Corpo scrollabile */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Prompt opzionale */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Istruzioni aggiuntive <span className="text-gray-400 font-normal">(opzionale)</span>
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Es. «Evita di assegnare giornate a Mario nei weekend di agosto» oppure «Bilancia meglio i weekend festivi»…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder:text-gray-300"
                />
              </div>

              {/* Pulsante analisi */}
              <button
                onClick={handleAiAnalyze}
                disabled={aiLoading || assignments.length === 0}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analisi in corso… (può richiedere qualche secondo)
                  </>
                ) : (
                  <>✨ Analizza e suggerisci</>
                )}
              </button>

              {/* Errore AI */}
              {aiError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2 items-start">
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  <span>{aiError}</span>
                </div>
              )}

              {/* Suggerimenti */}
              {suggestions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {suggestions.length} suggeriment{suggestions.length === 1 ? 'o' : 'i'} trovati
                  </p>
                  {suggestions.map((s) => {
                    const isApplied = appliedIds.has(s.id);
                    const isApplying = applyingId === s.id;
                    const severityStyle: Record<string, string> = {
                      high:   'border-l-red-500 bg-red-50',
                      medium: 'border-l-amber-400 bg-amber-50',
                      low:    'border-l-blue-400 bg-blue-50',
                      info:   'border-l-gray-300 bg-gray-50',
                    };
                    const severityBadge: Record<string, string> = {
                      high:   'bg-red-100 text-red-700',
                      medium: 'bg-amber-100 text-amber-700',
                      low:    'bg-blue-100 text-blue-700',
                      info:   'bg-gray-100 text-gray-500',
                    };
                    const severityLabel: Record<string, string> = {
                      high: 'Alta', medium: 'Media', low: 'Bassa', info: 'Info',
                    };

                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border border-l-4 p-4 space-y-2 transition ${severityStyle[s.severity] ?? 'border-l-gray-300 bg-gray-50'} ${isApplied ? 'opacity-60' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityBadge[s.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                                {severityLabel[s.severity] ?? s.severity}
                              </span>
                              {s.type === 'swap' && (
                                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-medium">
                                  🔄 Scambio
                                </span>
                              )}
                              {isApplied && (
                                <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-medium">
                                  ✓ Applicato
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 leading-relaxed">{s.description}</p>

                        {/* Dettaglio scambio */}
                        {s.action && (
                          <div className="bg-white/70 rounded-lg p-2.5 text-xs text-gray-600 space-y-1 border border-white">
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-gray-700 flex-shrink-0">
                                {s.action.userName1}:
                              </span>
                              <span className="font-mono text-gray-500">
                                {s.action.dates1.slice(0, 4).join(', ')}{s.action.dates1.length > 4 ? ` +${s.action.dates1.length - 4}` : ''}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 text-gray-400 pl-1">↕ scambia con</div>
                            <div className="flex items-start gap-1.5">
                              <span className="font-semibold text-gray-700 flex-shrink-0">
                                {s.action.userName2}:
                              </span>
                              <span className="font-mono text-gray-500">
                                {s.action.dates2.slice(0, 4).join(', ')}{s.action.dates2.length > 4 ? ` +${s.action.dates2.length - 4}` : ''}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Pulsante applica */}
                        {s.type === 'swap' && s.action && !isApplied && (
                          <button
                            onClick={() => handleApplySuggestion(s)}
                            disabled={isApplying || !!applyingId}
                            className="mt-1 w-full bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold py-2 rounded-lg transition disabled:opacity-50 flex items-center justify-center gap-2"
                          >
                            {isApplying ? (
                              <>
                                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                Applicazione…
                              </>
                            ) : (
                              '✓ Applica questo scambio'
                            )}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Stato vuoto iniziale */}
              {!aiLoading && suggestions.length === 0 && !aiError && (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-5xl mb-3">🤖</div>
                  <p className="text-sm">
                    Premi <strong className="text-violet-600">Analizza e suggerisci</strong> per avviare l&apos;analisi AI della programmazione {year}.
                  </p>
                  <p className="text-xs mt-2 text-gray-300">
                    L&apos;AI valuterà equità, conflitti ferie, giorni consecutivi e distribuzione stagionale.
                  </p>
                </div>
              )}
            </div>

            {/* Footer note */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 text-center">
                I suggerimenti sono generati da Claude (Anthropic) · Gli scambi applicati sono reversibili manualmente
              </p>
            </div>
          </div>
        </div>
      )}

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
