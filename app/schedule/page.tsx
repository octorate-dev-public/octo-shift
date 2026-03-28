'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { Shift } from '@/types';
import { getInitials, getShiftColor, getShiftLabel, parseDateString } from '@/lib/utils';

const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const ITALIAN_DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const ITALIAN_DAYS_FULL = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const total = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= total; d++) days.push(new Date(year, month, d));
  return days;
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export default function SchedulePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('Utente');
  const [userId, setUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve current user on mount
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) setUserId(data.user.id);
    });
  }, []);

  // Also try to get the display name
  useEffect(() => {
    if (!userId) return;
    api.get<{ full_name: string }>(`/api/users?id=${userId}`)
      .then((u) => { if (u?.full_name) setUserName(u.full_name); })
      .catch(() => {});
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    loadShifts();
  }, [userId, year, month]);

  const loadShifts = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const start = formatDate(new Date(year, month, 1));
      const end = formatDate(new Date(year, month + 1, 0));
      const data = await api.get<Shift[]>(`/api/shifts?userId=${userId}&start=${start}&end=${end}`);
      setShifts(data);
    } catch (e: any) {
      setError(e.message ?? 'Errore nel caricamento dello schedule');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const shiftByDate = new Map<string, Shift>();
  shifts.forEach((s) => shiftByDate.set(s.shift_date, s));

  const days = getDaysInMonth(year, month);
  const firstDayOfWeek = new Date(year, month, 1).getDay();

  // Summary counts
  const counts = shifts.reduce<Record<string, number>>((acc, s) => {
    acc[s.shift_type] = (acc[s.shift_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <Layout userRole="user" userName={userName}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Il Mio Schedule</h1>
          <p className="text-gray-600 mt-1">Visualizza i tuoi turni del mese</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow-sm border border-gray-200">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition"
          >
            ← Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900 capitalize">
            {ITALIAN_MONTHS[month]} {year}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium hover:bg-gray-100 rounded-lg transition"
          >
            Successivo →
          </button>
        </div>

        {/* Summary pills */}
        {!loading && shifts.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {(['office', 'smartwork', 'sick', 'vacation', 'permission'] as const).map((type) =>
              counts[type] ? (
                <span
                  key={type}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${getShiftColor(type)}`}
                >
                  {getShiftLabel(type)}: {counts[type]}
                </span>
              ) : null,
            )}
          </div>
        )}

        {/* Calendar grid */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200">
              {ITALIAN_DAYS_SHORT.map((d) => (
                <div
                  key={d}
                  className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {d}
                </div>
              ))}
            </div>

            {/* Day cells */}
            <div className="grid grid-cols-7">
              {/* Empty cells before month start */}
              {Array.from({ length: firstDayOfWeek }).map((_, i) => (
                <div key={`empty-${i}`} className="min-h-20 border-b border-r border-gray-100 bg-gray-50" />
              ))}

              {days.map((date) => {
                const dateStr = formatDate(date);
                const shift = shiftByDate.get(dateStr);
                const isToday = dateStr === formatDate(today);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const dayCol = (date.getDay() + firstDayOfWeek) % 7;

                return (
                  <div
                    key={dateStr}
                    className={`min-h-20 border-b border-r border-gray-100 p-2 flex flex-col gap-1 ${
                      isWeekend ? 'bg-gray-50' : 'bg-white'
                    }`}
                  >
                    {/* Date number */}
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full ${
                          isToday
                            ? 'bg-blue-600 text-white'
                            : isWeekend
                            ? 'text-gray-400'
                            : 'text-gray-700'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      {shift?.locked && (
                        <svg className="w-3 h-3 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>

                    {/* Shift badge */}
                    {shift ? (
                      <span
                        className={`text-xs font-medium px-1.5 py-0.5 rounded text-center ${getShiftColor(shift.shift_type)}`}
                      >
                        {getShiftLabel(shift.shift_type)}
                      </span>
                    ) : !isWeekend ? (
                      <span className="text-xs text-gray-300 italic">—</span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex flex-wrap gap-4 text-xs text-gray-600">
          {(['office', 'smartwork', 'sick', 'vacation', 'permission'] as const).map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className={`inline-block w-3 h-3 rounded ${getShiftColor(type).split(' ')[0]}`} />
              {getShiftLabel(type)}
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
