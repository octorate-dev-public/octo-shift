'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/fetcher';
import { formatDate, getInitials, getWeekStart } from '@/lib/utils';
import { ShiftWithUser } from '@/types';

interface OnCallEntry {
  id: string;
  week_start_date: string;
  week_end_date: string;
  user: { id: string; full_name: string; email: string } | null;
}

interface TeamGroup {
  teamName: string;
  teamId: string | null;
  users: Array<{ id: string; full_name: string }>;
}

export default function PublicOnCallPage() {
  const [onCallUsers, setOnCallUsers] = useState<OnCallEntry[]>([]);
  const [officeTeams, setOfficeTeams] = useState<TeamGroup[]>([]);
  const [officeTotal, setOfficeTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const todayStr = formatDate(today);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Both requests go through our API routes → server-side logging on Vercel
      const [onCallData, shiftsData] = await Promise.all([
        api.get<OnCallEntry[]>(`/api/on-call?date=${todayStr}`),
        api.get<ShiftWithUser[]>(`/api/shifts?date=${todayStr}`),
      ]);

      setOnCallUsers(onCallData);

      // Filter office shifts and group by team
      const officeShifts = shiftsData.filter((s) => s.shift_type === 'office' && s.user);
      setOfficeTotal(officeShifts.length);

      // Get unique team IDs for name resolution
      const teamIds = [...new Set(officeShifts.map((s) => s.user?.team_id).filter(Boolean))] as string[];

      // Fetch team names if we have teams
      let teamMap: Record<string, string> = {};
      if (teamIds.length > 0) {
        try {
          // We don't have a dedicated teams endpoint yet, so we'll use the team_id
          // In production you'd have /api/teams – for now group by ID
          // This could be improved with a dedicated teams API route
        } catch {
          // Non-blocking
        }
      }

      // Group by team_id
      const grouped: Record<string, TeamGroup> = {};
      for (const shift of officeShifts) {
        const u = shift.user!;
        const key = u.team_id ?? '__no_team__';
        if (!grouped[key]) {
          grouped[key] = {
            teamId: u.team_id ?? null,
            teamName: u.team_id ? `Team ${u.team_id.slice(0, 6)}` : 'Senza team',
            users: [],
          };
        }
        grouped[key].users.push({ id: u.id, full_name: u.full_name });
      }

      const sorted = Object.values(grouped).sort((a, b) => {
        if (!a.teamId) return 1;
        if (!b.teamId) return -1;
        return a.teamName.localeCompare(b.teamName);
      });

      setOfficeTeams(sorted);
    } catch (err: any) {
      console.error('Public page load error:', err);
      setError(err.message || 'Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-gray-500 text-lg">Caricamento...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4 pb-20">
      <div className="max-w-3xl mx-auto space-y-10">
        {/* Header */}
        <header className="text-center pt-8">
          <h1 className="text-4xl font-bold text-gray-900">SmartWork Scheduler</h1>
          <p className="text-gray-600 text-lg mt-2">
            {today.toLocaleDateString('it-IT', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-300 text-red-800 px-5 py-4 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* Reperibilità */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">📞</span>
            <h2 className="text-2xl font-bold text-gray-900">Chi è Reperibile</h2>
          </div>

          {onCallUsers.length > 0 ? (
            <div className="space-y-3">
              {onCallUsers.map((a) => (
                <div key={a.id} className="bg-white rounded-xl shadow-md p-5 flex items-center gap-4">
                  <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                    {a.user ? getInitials(a.user.full_name) : '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xl font-semibold text-gray-900 truncate">
                      {a.user?.full_name ?? 'Sconosciuto'}
                    </p>
                    <p className="text-gray-500 text-sm truncate">{a.user?.email ?? '—'}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      dal {new Date(a.week_start_date).toLocaleDateString('it-IT')} al{' '}
                      {new Date(a.week_end_date).toLocaleDateString('it-IT')}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold whitespace-nowrap">
                    Reperibile
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-500">
              Nessuno è reperibile questa settimana
            </div>
          )}
        </section>

        {/* In Ufficio Oggi */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">🏢</span>
            <h2 className="text-2xl font-bold text-gray-900">
              In Ufficio Oggi
              <span className="ml-2 text-base font-normal text-gray-500">
                ({officeTotal} {officeTotal === 1 ? 'persona' : 'persone'})
              </span>
            </h2>
          </div>

          {officeTeams.length > 0 ? (
            <div className="space-y-5">
              {officeTeams.map((group) => (
                <div key={group.teamId ?? 'no-team'} className="bg-white rounded-xl shadow-md overflow-hidden">
                  <div className="bg-gray-100 px-5 py-3 flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800">{group.teamName}</h3>
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                      {group.users.length}
                    </span>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {group.users.map((u) => (
                      <li key={u.id} className="px-5 py-3 flex items-center gap-3">
                        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-xs">
                          {getInitials(u.full_name)}
                        </div>
                        <span className="text-gray-900 text-sm font-medium truncate">{u.full_name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-500">
              Nessuno è previsto in ufficio oggi
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-xs space-y-1 pt-4">
          <p>Questa pagina è pubblica e non richiede login</p>
          <p>
            Ultimo aggiornamento:{' '}
            {new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </footer>
      </div>
    </div>
  );
}
