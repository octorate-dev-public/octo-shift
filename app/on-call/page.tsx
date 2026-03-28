'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { User } from '@/types';
import { getInitials, parseDateString } from '@/lib/utils';

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

interface OnCallEntry {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;
}

function formatWeekRange(start: string, end: string): string {
  const s = parseDateString(start);
  const e = parseDateString(end);
  return `${s.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })} – ${e.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

function isCurrentWeek(start: string, end: string): boolean {
  const today = new Date();
  const s = parseDateString(start);
  const e = parseDateString(end);
  return today >= s && today <= e;
}

export default function OnCallPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [assignments, setAssignments] = useState<OnCallEntry[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Utente');

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
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [assignmentsData, usersData] = await Promise.all([
        api.get<OnCallEntry[]>(`/api/on-call?year=${year}&month=${month}`),
        api.get<User[]>('/api/users'),
      ]);
      setAssignments(assignmentsData);
      setUsers(usersData);
    } catch {
      /* silently ignore */
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month - 1 + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const getUserById = (id: string) => users.find((u) => u.id === id);

  const myAssignments = assignments.filter((a) => a.user_id === currentUserId);

  return (
    <Layout userRole="user" userName={userName}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reperibilità</h1>
          <p className="text-gray-600 mt-1">Chi è reperibile questo mese</p>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition"
          >
            ← Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900 capitalize">
            {ITALIAN_MONTHS[month - 1]} {year}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition"
          >
            Successivo →
          </button>
        </div>

        {/* My on-call weeks */}
        {myAssignments.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-blue-800 mb-2">Le tue settimane di reperibilità</h2>
            <div className="flex flex-wrap gap-2">
              {myAssignments.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                >
                  {formatWeekRange(a.week_start_date, a.week_end_date)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* All assignments */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : assignments.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-500">
            <p className="text-lg font-medium">Nessuna reperibilità assegnata</p>
            <p className="text-sm mt-1">Non ci sono turni di reperibilità per questo mese.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {assignments.map((a) => {
              const user = getUserById(a.user_id);
              const current = isCurrentWeek(a.week_start_date, a.week_end_date);
              const isMe = a.user_id === currentUserId;
              return (
                <div
                  key={a.id}
                  className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-shadow hover:shadow-md ${
                    current ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
                  }`}
                >
                  {/* Avatar */}
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      isMe ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}
                  >
                    {user ? getInitials(user.full_name) : '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-900 text-sm">
                      {user?.full_name ?? 'Sconosciuto'}
                      {isMe && (
                        <span className="ml-2 text-xs text-blue-600 font-medium">(tu)</span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {formatWeekRange(a.week_start_date, a.week_end_date)}
                    </p>
                    {user?.email && (
                      <p className="text-xs text-gray-400 mt-0.5">{user.email}</p>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {current && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                        Questa settimana
                      </span>
                    )}
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                      Reperibile
                    </span>
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
