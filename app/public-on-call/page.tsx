'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/fetcher';
import { formatDate, getActiveOnCallDate, getInitials, isOfficePresence } from '@/lib/utils';
import { ShiftWithUser, Team } from '@/types';

interface OnCallEntry {
  id: string;
  week_start_date: string;
  week_end_date: string;
  user: { id: string; full_name: string; email: string; team_id?: string | null } | null;
}

interface TeamGroup {
  teamName: string;
  teamId: string | null;
  teamColor: string | null;
  users: Array<{ id: string; full_name: string }>;
}

interface DailyRow {
  assignment_date: string;
  user_id: string;
  user: { id: string; full_name: string; email: string } | null;
}

interface OnCallBlock {
  userId: string;
  user: { id: string; full_name: string; email: string } | null;
  start: string; // primo giorno assegnato (YYYY-MM-DD)
  end: string;   // ultimo giorno assegnato
}

/** Aggiunge n giorni a una data YYYY-MM-DD (in UTC, sicuro dal DST). */
function addDaysStr(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Raggruppa le assegnazioni giornaliere in blocchi contigui dello stesso utente. */
function buildBlocks(rows: DailyRow[]): OnCallBlock[] {
  const sorted = [...rows].sort((a, b) => a.assignment_date.localeCompare(b.assignment_date));
  const blocks: OnCallBlock[] = [];
  for (const r of sorted) {
    const last = blocks[blocks.length - 1];
    if (last && last.userId === r.user_id && addDaysStr(last.end, 1) === r.assignment_date) {
      last.end = r.assignment_date;
    } else {
      blocks.push({ userId: r.user_id, user: r.user, start: r.assignment_date, end: r.assignment_date });
    }
  }
  return blocks;
}

const dmy = (ds: string) =>
  new Date(ds + 'T12:00:00Z').toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Turno reperibilità: 18:00 del primo giorno → 09:00 del giorno DOPO l'ultimo. */
const blockStartLabel = (b: OnCallBlock) => `${dmy(b.start)} ore 18:00`;
const blockEndLabel = (b: OnCallBlock) => `${dmy(addDaysStr(b.end, 1))} ore 09:00`;

export default function PublicOnCallPage() {
  const [onCallUsers, setOnCallUsers] = useState<OnCallEntry[]>([]);
  const [blocks, setBlocks] = useState<OnCallBlock[]>([]);
  const [officeTeams, setOfficeTeams] = useState<TeamGroup[]>([]);
  const [officeTotal, setOfficeTotal] = useState(0);
  const [teamMap, setTeamMap] = useState<Record<string, Team>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const today = new Date();
  const todayStr = formatDate(today);
  // La reperibilità in turno adesso: prima delle 09:00 (Rome) è ancora quella
  // di ieri (turno 18:00 → 09:00 del giorno dopo). I turni ufficio restano su oggi.
  const onCallDateStr = getActiveOnCallDate();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Finestra di giorni attorno alla data attiva per costruire la timeline
      // (chi prima / ora / dopo). ±40gg copre i blocchi adiacenti.
      const from = addDaysStr(onCallDateStr, -20);
      const to = addDaysStr(onCallDateStr, 40);

      const [dailyRange, shiftsData, teamsData] = await Promise.all([
        api.get<DailyRow[]>(`/api/on-call?dailyFrom=${from}&dailyTo=${to}`),
        api.get<ShiftWithUser[]>(`/api/shifts?date=${todayStr}`),
        api.get<Team[]>('/api/teams'),
      ]);

      const tMap: Record<string, Team> = {};
      teamsData.forEach((t) => { tMap[t.id] = t; });
      setTeamMap(tMap);

      const builtBlocks = buildBlocks(dailyRange ?? []);
      setBlocks(builtBlocks);

      // Fallback: se non ci sono assegnazioni giornaliere (setup weekly legacy),
      // usa il vecchio fetch per-data per la card singola.
      if (builtBlocks.length === 0) {
        const legacy = await api.get<OnCallEntry[]>(`/api/on-call?date=${onCallDateStr}`);
        setOnCallUsers(legacy);
      } else {
        setOnCallUsers([]);
      }

      // Filter office shifts and group by team — ferie/permessi/malattia
      // non contano come presenze in ufficio
      const officeShifts = shiftsData.filter((s) => isOfficePresence(s) && s.user);
      setOfficeTotal(officeShifts.length);

      // Group by team_id, using real team name and color
      const grouped: Record<string, TeamGroup> = {};
      for (const shift of officeShifts) {
        const u = shift.user!;
        const key = u.team_id ?? '__no_team__';
        if (!grouped[key]) {
          const team = u.team_id ? tMap[u.team_id] : null;
          grouped[key] = {
            teamId: u.team_id ?? null,
            teamName: team?.name ?? (u.team_id ? `Team ${u.team_id.slice(0, 6)}` : 'Senza team'),
            teamColor: team?.color ?? null,
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

        {/* Reperibilità — timeline prima / ora / dopo */}
        <section>
          <div className="flex items-center gap-3 mb-4">
            <span className="text-3xl">📞</span>
            <h2 className="text-2xl font-bold text-gray-900">Reperibilità</h2>
          </div>

          {(() => {
            const currentIdx = blocks.findIndex(
              (b) => b.start <= onCallDateStr && onCallDateStr <= b.end,
            );
            if (currentIdx === -1) {
              // Nessun blocco attivo: fallback legacy oppure vuoto
              if (onCallUsers.length > 0) {
                return (
                  <div className="space-y-3">
                    {onCallUsers.map((a) => (
                      <div key={a.id} className="bg-white rounded-xl shadow-md p-5 flex items-center gap-4">
                        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center font-bold text-lg">
                          {a.user ? getInitials(a.user.full_name) : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xl font-semibold text-gray-900 truncate">{a.user?.full_name ?? 'Sconosciuto'}</p>
                          <p className="text-gray-500 text-sm truncate">{a.user?.email ?? '—'}</p>
                        </div>
                        <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-semibold whitespace-nowrap">Reperibile</span>
                      </div>
                    ))}
                  </div>
                );
              }
              return (
                <div className="bg-white rounded-xl shadow-md p-8 text-center text-gray-500">
                  Nessuna reperibilità pianificata
                </div>
              );
            }

            const current = blocks[currentIdx];
            const prev = currentIdx > 0 ? blocks[currentIdx - 1] : null;
            const next = currentIdx < blocks.length - 1 ? blocks[currentIdx + 1] : null;

            const SideCard = ({ block, label }: { block: OnCallBlock; label: string }) => (
              <div className="flex-1 bg-white/70 rounded-xl border border-gray-200 p-4 flex flex-col items-center text-center opacity-90">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-2">{label}</span>
                <div className="w-11 h-11 rounded-full bg-gray-300 text-white flex items-center justify-center font-bold text-sm mb-2">
                  {block.user ? getInitials(block.user.full_name) : '?'}
                </div>
                <p className="text-sm font-semibold text-gray-700 truncate max-w-full">{block.user?.full_name ?? 'N/D'}</p>
                <p className="text-[11px] text-gray-400 mt-1">{dmy(block.start)}–{dmy(addDaysStr(block.end, 1))}</p>
              </div>
            );

            return (
              <div className="flex flex-col sm:flex-row items-stretch gap-3">
                {prev ? <SideCard block={prev} label="← Prima" /> : <div className="hidden sm:block flex-1" />}

                {/* Ora — in risalto */}
                <div className="flex-[1.6] bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl shadow-lg p-6 flex flex-col items-center text-center text-white ring-4 ring-green-200">
                  <span className="text-xs font-bold uppercase tracking-widest bg-white/20 px-3 py-1 rounded-full mb-3">
                    ● In turno ora
                  </span>
                  <div className="w-20 h-20 rounded-full bg-white/25 flex items-center justify-center font-bold text-2xl mb-3">
                    {current.user ? getInitials(current.user.full_name) : '?'}
                  </div>
                  <p className="text-2xl font-bold leading-tight">{current.user?.full_name ?? 'N/D'}</p>
                  {current.user?.email && <p className="text-sm text-white/80 truncate max-w-full">{current.user.email}</p>}
                  <div className="mt-3 text-sm bg-white/15 rounded-lg px-4 py-2">
                    <span className="font-semibold">{blockStartLabel(current)}</span>
                    <span className="mx-1.5 text-white/70">→</span>
                    <span className="font-semibold">{blockEndLabel(current)}</span>
                  </div>
                </div>

                {next ? <SideCard block={next} label="Dopo →" /> : <div className="hidden sm:block flex-1" />}
              </div>
            );
          })()}
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
                        <div
                          className="flex-shrink-0 w-9 h-9 rounded-full text-white flex items-center justify-center font-bold text-xs"
                          style={{ backgroundColor: group.teamColor ?? '#2563eb' }}
                        >
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
