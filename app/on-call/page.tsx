'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { OnCallDailyAssignment, User } from '@/types';
import { formatDate, getInitials, parseDateString } from '@/lib/utils';

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

const GIORNI_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

interface DailyEntry extends OnCallDailyAssignment {
  user?: User;
}

interface DayGroup {
  userId: string;
  user?: User;
  startDate: string;
  endDate: string;
  dates: string[];
}

/** Raggruppa giorni consecutivi assegnati allo stesso utente in blocchi. */
function groupConsecutiveDays(entries: DailyEntry[]): DayGroup[] {
  if (entries.length === 0) return [];
  const groups: DayGroup[] = [];
  let cur: DayGroup = {
    userId: entries[0].user_id,
    user: entries[0].user,
    startDate: entries[0].assignment_date,
    endDate: entries[0].assignment_date,
    dates: [entries[0].assignment_date],
  };
  for (let i = 1; i < entries.length; i++) {
    const e = entries[i];
    if (e.user_id === cur.userId) {
      cur.endDate = e.assignment_date;
      cur.dates.push(e.assignment_date);
    } else {
      groups.push({ ...cur, dates: [...cur.dates] });
      cur = { userId: e.user_id, user: e.user, startDate: e.assignment_date, endDate: e.assignment_date, dates: [e.assignment_date] };
    }
  }
  groups.push(cur);
  return groups;
}

function formatDateRange(start: string, end: string): string {
  const s = parseDateString(start);
  const e = parseDateString(end);
  if (start === end) {
    return s.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
  }
  const sameMonth = s.getMonth() === e.getMonth();
  const startStr = `${GIORNI_IT[s.getDay()]} ${s.getDate()}${sameMonth ? '' : ' ' + ITALIAN_MONTHS[s.getMonth()]}`;
  const endStr = `${GIORNI_IT[e.getDay()]} ${e.getDate()} ${ITALIAN_MONTHS[e.getMonth()]}`;
  return `${startStr} – ${endStr}`;
}

function isToday(date: string): boolean {
  return date === formatDate(new Date());
}

function includesDate(dates: string[], date: string): boolean {
  return dates.includes(date);
}

export default function OnCallPage() {
  const today = new Date();
  const todayStr = formatDate(today);

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Utente');

  // Utente autenticato
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setCurrentUserId(data.user.id);
    });
  }, []);

  useEffect(() => {
    if (!currentUserId) return;
    api.get<{ full_name: string }>(`/api/users?id=${currentUserId}`)
      .then((u) => { if (u?.full_name) setUserName(u.full_name); })
      .catch(() => {});
  }, [currentUserId]);

  useEffect(() => {
    loadData();
  }, [year, month]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      // Usa la nuova tabella daily (con join user già incluso lato server)
      const data = await api.get<DailyEntry[]>(
        `/api/on-call?dailyYear=${year}&dailyMonth=${month}`,
      );
      setEntries(data);
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month - 1 + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const groups = groupConsecutiveDays(entries);
  const todayEntry = entries.find((e) => e.assignment_date === todayStr);
  const myGroups = groups.filter((g) => g.userId === currentUserId);
  const myDaysCount = entries.filter((e) => e.user_id === currentUserId).length;

  return (
    <Layout userRole="user" userName={userName}>
      <div className="space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reperibilità</h1>
          <p className="text-gray-500 mt-1 text-sm">Chi è reperibile questo mese</p>
        </div>

        {/* Chi è di reperibilità OGGI */}
        {todayEntry && (
          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg">
            <p className="text-xs font-semibold text-green-200 uppercase tracking-wide mb-2">📞 Reperibile oggi</p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center font-bold text-lg flex-shrink-0">
                {todayEntry.user ? getInitials(todayEntry.user.full_name) : '?'}
              </div>
              <div>
                <p className="text-xl font-bold leading-tight">
                  {todayEntry.user?.full_name ?? 'N/D'}
                  {todayEntry.user_id === currentUserId && (
                    <span className="ml-2 text-sm font-normal text-green-200">(tu)</span>
                  )}
                </p>
                {todayEntry.user?.email && (
                  <p className="text-sm text-green-100 mt-0.5">{todayEntry.user.email}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* I miei blocchi nel mese */}
        {myGroups.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-blue-800 mb-2 flex items-center gap-2">
              📅 Le mie reperibilità questo mese
              <span className="bg-blue-200 text-blue-900 text-xs px-2 py-0.5 rounded-full font-bold">
                {myDaysCount} {myDaysCount === 1 ? 'giorno' : 'giorni'}
              </span>
            </h2>
            <div className="flex flex-wrap gap-2">
              {myGroups.map((g, i) => (
                <span key={i} className="inline-flex items-center px-3 py-1.5 bg-blue-100 text-blue-800 rounded-full text-sm font-medium">
                  {formatDateRange(g.startDate, g.endDate)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Navigazione mese */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <button onClick={() => handleMonthChange(-1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition">
            ← Precedente
          </button>
          <span className="text-base font-semibold text-gray-900">{ITALIAN_MONTHS[month - 1]} {year}</span>
          <button onClick={() => handleMonthChange(1)} className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition">
            Successivo →
          </button>
        </div>

        {/* Lista blocchi */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-lg font-medium">Nessuna reperibilità assegnata</p>
            <p className="text-sm mt-1">Non ci sono turni di reperibilità per {ITALIAN_MONTHS[month - 1]} {year}.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map((g, idx) => {
              const active = includesDate(g.dates, todayStr);
              const past = g.endDate < todayStr;
              const isMe = g.userId === currentUserId;

              return (
                <div
                  key={idx}
                  className={[
                    'bg-white rounded-xl border p-4 flex items-center gap-4 transition-all',
                    active ? 'border-green-400 ring-2 ring-green-100 shadow-md' : 'border-gray-200',
                    past ? 'opacity-50' : 'hover:shadow-sm',
                  ].join(' ')}
                >
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                    active ? 'bg-green-500 text-white' : isMe ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                  }`}>
                    {g.user ? getInitials(g.user.full_name) : '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">
                      {g.user?.full_name ?? 'Sconosciuto'}
                      {isMe && <span className="ml-2 text-xs text-blue-600 font-medium">(tu)</span>}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatDateRange(g.startDate, g.endDate)}
                      <span className="text-gray-400 ml-1.5 text-xs">
                        · {g.dates.length} {g.dates.length === 1 ? 'giorno' : 'giorni'}
                      </span>
                    </p>
                    {g.user?.email && (
                      <p className="text-xs text-gray-400 mt-0.5">{g.user.email}</p>
                    )}
                  </div>

                  {/* Badge */}
                  <div className="flex-shrink-0">
                    {active ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        Adesso
                      </span>
                    ) : past ? (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-400">Passato</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-blue-700">Prossimo</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
