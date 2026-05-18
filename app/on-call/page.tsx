'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { OnCallDailyAssignment, User } from '@/types';
import { formatDate } from '@/lib/utils';

// ─── Costanti ────────────────────────────────────────────────────────────────
const MESI_IT = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const GIORNI_HEADER = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];

// Palette colori — stessa del componente admin on-call
const USER_COLORS = [
  { bg: '#6366f1', light: '#eef2ff', text: '#4338ca' },
  { bg: '#10b981', light: '#ecfdf5', text: '#065f46' },
  { bg: '#f59e0b', light: '#fffbeb', text: '#92400e' },
  { bg: '#ef4444', light: '#fef2f2', text: '#991b1b' },
  { bg: '#8b5cf6', light: '#f5f3ff', text: '#6d28d9' },
  { bg: '#06b6d4', light: '#ecfeff', text: '#155e75' },
  { bg: '#ec4899', light: '#fdf2f8', text: '#9d174d' },
  { bg: '#14b8a6', light: '#f0fdfa', text: '#115e59' },
];

// ─── Tipi ─────────────────────────────────────────────────────────────────────
interface DailyEntry extends OnCallDailyAssignment {
  user?: User;
}

// ─── Utility ─────────────────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(' ').filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getDaysInMonth(year: number, month: number): Date[] {
  // month: 1-based
  const days: Date[] = [];
  const d = new Date(year, month - 1, 1);
  while (d.getMonth() === month - 1) {
    days.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return days;
}

/** Numero di celle vuote prima del primo giorno (lunedì = 0). */
function leadingBlanks(year: number, month: number): number {
  const firstDow = new Date(year, month - 1, 1).getDay(); // 0=dom
  return firstDow === 0 ? 6 : firstDow - 1; // converti a lun-based
}

// ─── Componente ───────────────────────────────────────────────────────────────
export default function OnCallPage() {
  const today = new Date();
  const todayStr = formatDate(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Utente');

  // Auth
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    api.get<{ full_name: string }>(`/api/users?id=${currentUserId}`)
      .then(u => { if (u?.full_name) setUserName(u.full_name); })
      .catch(() => {});
  }, [currentUserId]);

  // Carica dati
  useEffect(() => { loadData(); }, [year, month]); // eslint-disable-line

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.get<DailyEntry[]>(`/api/on-call?dailyYear=${year}&dailyMonth=${month}`);
      setEntries(data);
    } catch { setEntries([]); }
    finally { setLoading(false); }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month - 1 + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  // ── Mappa data → entry ──
  const entryByDate = useMemo(() => {
    const m = new Map<string, DailyEntry>();
    entries.forEach(e => m.set(e.assignment_date, e));
    return m;
  }, [entries]);

  // ── Mappa userId → colore (stabile per l'ordine di apparizione) ──
  const userColorMap = useMemo(() => {
    const m = new Map<string, (typeof USER_COLORS)[0]>();
    let idx = 0;
    entries.forEach(e => {
      if (e.user_id && !m.has(e.user_id)) {
        m.set(e.user_id, USER_COLORS[idx % USER_COLORS.length]);
        idx++;
      }
    });
    return m;
  }, [entries]);

  // ── Utenti unici nel mese (per legenda) ──
  const usersInMonth = useMemo(() => {
    const seen = new Map<string, { user?: User; days: number }>();
    entries.forEach(e => {
      const cur = seen.get(e.user_id);
      seen.set(e.user_id, { user: e.user, days: (cur?.days ?? 0) + 1 });
    });
    return Array.from(seen.entries()).map(([id, v]) => ({ id, ...v }));
  }, [entries]);

  // ── Chi è di reperibilità oggi ──
  const todayEntry = entryByDate.get(todayStr);

  // ── I miei giorni ──
  const myDays = entries.filter(e => e.user_id === currentUserId);
  const myNext = myDays.find(e => e.assignment_date >= todayStr);

  // ── Calendario ──
  const days = getDaysInMonth(year, month);
  const blanks = leadingBlanks(year, month);

  // Rileva "swap" = giorno isolato dello stesso utente (non consecutivo con il precedente/successivo)
  function isSwappedDay(dateStr: string): boolean {
    const e = entryByDate.get(dateStr);
    if (!e) return false;
    const d = new Date(dateStr + 'T00:00:00');
    const prev = new Date(d); prev.setDate(d.getDate() - 1);
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const prevEntry = entryByDate.get(formatDate(prev));
    const nextEntry = entryByDate.get(formatDate(next));
    const samePrev = prevEntry?.user_id === e.user_id;
    const sameNext = nextEntry?.user_id === e.user_id;
    return !samePrev && !sameNext; // isolato → probabilmente uno swap
  }

  return (
    <Layout userRole="user" userName={userName}>
      <div className="space-y-5 max-w-2xl mx-auto">

        {/* ── Header + nav mese ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Reperibilità</h1>
            <p className="text-sm text-gray-500 mt-0.5">Chi è reperibile questo mese</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => handleMonthChange(-1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition">‹</button>
            <span className="text-sm font-semibold text-gray-800 px-1 min-w-[110px] text-center">
              {MESI_IT[month - 1]} {year}
            </span>
            <button onClick={() => handleMonthChange(1)}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition">›</button>
          </div>
        </div>

        {/* ── Card oggi ── */}
        {todayEntry && (
          <div className="rounded-2xl p-5 flex items-center gap-4 text-white"
            style={{ background: `linear-gradient(135deg, ${userColorMap.get(todayEntry.user_id)?.bg ?? '#6366f1'}, ${userColorMap.get(todayEntry.user_id)?.bg ?? '#6366f1'}cc)` }}>
            <div className="w-12 h-12 rounded-full bg-white/25 flex items-center justify-center font-bold text-lg flex-shrink-0">
              {todayEntry.user ? getInitials(todayEntry.user.full_name) : '?'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white/70 uppercase tracking-wide mb-0.5">📞 Reperibile oggi</p>
              <p className="text-xl font-bold leading-tight truncate">
                {todayEntry.user?.full_name ?? 'N/D'}
                {todayEntry.user_id === currentUserId && <span className="ml-2 text-sm font-normal text-white/70">(tu)</span>}
              </p>
              {todayEntry.user?.email && <p className="text-sm text-white/70 truncate">{todayEntry.user.email}</p>}
            </div>
          </div>
        )}

        {/* ── I miei turni ── */}
        {myDays.length > 0 && (
          <div className="rounded-xl border p-4 space-y-2"
            style={{ background: userColorMap.get(currentUserId ?? '')?.light ?? '#eef2ff', borderColor: (userColorMap.get(currentUserId ?? '')?.bg ?? '#6366f1') + '33' }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold" style={{ color: userColorMap.get(currentUserId ?? '')?.text ?? '#4338ca' }}>
                📅 I miei giorni — {myDays.length} {myDays.length === 1 ? 'giorno' : 'giorni'}
              </p>
              {myNext && myNext.assignment_date !== todayStr && (
                <p className="text-xs" style={{ color: userColorMap.get(currentUserId ?? '')?.text ?? '#4338ca' }}>
                  Prossimo: {new Date(myNext.assignment_date + 'T00:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Calendario mensile ── */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-7 h-7 border-[3px] border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

            {/* Header giorni */}
            <div className="grid grid-cols-7 border-b border-gray-100">
              {GIORNI_HEADER.map(d => (
                <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
                  {d}
                </div>
              ))}
            </div>

            {/* Celle */}
            <div className="grid grid-cols-7 p-2 gap-1">
              {/* Celle vuote prima del 1° */}
              {Array.from({ length: blanks }).map((_, i) => <div key={`b${i}`} />)}

              {days.map(date => {
                const dateStr = formatDate(date);
                const entry = entryByDate.get(dateStr);
                const color = entry ? userColorMap.get(entry.user_id) : null;
                const isToday = dateStr === todayStr;
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const isMe = entry?.user_id === currentUserId;
                const swapped = entry ? isSwappedDay(dateStr) : false;

                return (
                  <div key={dateStr}
                    className={`relative flex flex-col items-center justify-start pt-1 pb-1.5 rounded-xl min-h-[56px] transition-all ${
                      isWeekend ? 'opacity-60' : ''
                    }`}
                    style={entry ? { background: color?.light } : undefined}
                  >
                    {/* Numero giorno */}
                    <span className={`text-[11px] font-semibold mb-1 w-5 h-5 flex items-center justify-center rounded-full leading-none ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : isWeekend
                        ? 'text-gray-400'
                        : entry ? '' : 'text-gray-300'
                    }`}
                      style={isToday ? {} : entry ? { color: color?.text } : {}}
                    >
                      {date.getDate()}
                    </span>

                    {/* Avatar persona */}
                    {entry && (
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                        style={{ background: color?.bg }}
                        title={`${entry.user?.full_name ?? '?'}${swapped ? ' · giorno scambiato' : ''}`}
                      >
                        {entry.user ? getInitials(entry.user.full_name) : '?'}
                      </div>
                    )}

                    {/* Indicatori */}
                    {isToday && (
                      <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                    )}
                    {swapped && (
                      <span className="absolute bottom-0.5 right-0.5 text-[8px]" title="Giorno scambiato">↕</span>
                    )}
                    {isMe && !isToday && (
                      <span className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-white/70 ring-1 ring-indigo-400" />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legenda */}
            {usersInMonth.length > 0 && (
              <div className="border-t border-gray-100 px-4 py-3 flex flex-wrap gap-x-4 gap-y-2">
                {usersInMonth.map(({ id, user, days: count }) => {
                  const color = userColorMap.get(id);
                  const isMe = id === currentUserId;
                  return (
                    <div key={id} className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold flex-shrink-0"
                        style={{ background: color?.bg }}>
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <span className="text-xs text-gray-600 font-medium">
                        {user?.full_name ?? 'N/D'}
                        {isMe && <span className="ml-1 text-gray-400">(tu)</span>}
                      </span>
                      <span className="text-xs text-gray-400">· {count}gg</span>
                    </div>
                  );
                })}
                <div className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                  <span>↕ = scambio giorno</span>
                </div>
              </div>
            )}

            {/* Mese vuoto */}
            {!loading && entries.length === 0 && (
              <div className="py-12 text-center text-gray-400 text-sm">
                Nessuna reperibilità assegnata per {MESI_IT[month - 1]} {year}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
