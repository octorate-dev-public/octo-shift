'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import Calendar from '@/components/Calendar';
import { api } from '@/lib/fetcher';
import { ShiftWithUser, Team, User } from '@/types';
import { useAuth } from '@/lib/useAuth';

// ─── Costanti localizzazione ──────────────────────────────────────────────────
const MESI_IT = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];
const GIORNI_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const LEAVE_LABELS: Record<string, string> = {
  sick: 'Malattia',
  vacation: 'Ferie',
  permission: 'Permesso',
};
const LEAVE_ICONS: Record<string, string> = {
  sick: '🤒',
  vacation: '✈️',
  permission: '📋',
};

// ─── Utility ──────────────────────────────────────────────────────────────────

/** Scarica un file di testo sul browser dell'utente. */
function downloadText(content: string, filename: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Restituisce la stringa "YYYY-MM-DD" per una data locale (evita lo shift UTC). */
function toLocalDateStr(d: Date): string {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

/** Ora corrente formattata in italiano: "26/05/2026 alle 14:32:05" */
function nowItStr(): string {
  const n = new Date();
  const date = n.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = n.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return `${date} alle ${time}`;
}

/** Primo team dell'utente (preferisce team_ids, fallback a team_id legacy). */
function firstTeamId(user: User): string | null {
  if (user.team_ids?.length > 0) return user.team_ids[0];
  return user.team_id ?? null;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const { userId, userName, userRole, logout } = useAuth();

  const [year, setYear]   = useState<number>(() => new Date().getFullYear());
  const [month, setMonth] = useState<number>(() => new Date().getMonth()); // 0-based

  const [shifts,      setShifts]      = useState<ShiftWithUser[]>([]);
  const [teams,       setTeams]       = useState<Team[]>([]);
  const [users,       setUsers]       = useState<User[]>([]);
  const [maxCapacity, setMaxCapacity] = useState(30);
  const [holidays,    setHolidays]    = useState<string[]>([]);
  const [workDays,    setWorkDays]    = useState<string[]>(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
  const [loading,     setLoading]     = useState(true);

  // Data selezionata per l'export TXT giorno (input manuale)
  const [exportDay, setExportDay] = useState<string>('');

  // ── Caricamento dati ─────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const m = month + 1;
      const [shiftsData, settingsData, teamsData, usersData] = await Promise.all([
        api.get<ShiftWithUser[]>(`/api/shifts?year=${year}&month=${m}`),
        api.get<Record<string, string>>('/api/settings'),
        api.get<Team[]>('/api/teams'),
        api.get<User[]>('/api/users'),
      ]);
      setShifts(shiftsData);
      setTeams(teamsData);
      setUsers(usersData);
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
      console.error('Error loading calendar:', error);
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMonthChange = (delta: number) => {
    const newDate = new Date(year, month + delta);
    setYear(newDate.getFullYear());
    setMonth(newDate.getMonth());
  };

  // ── Export CSV — mese intero ──────────────────────────────────────────────
  /**
   * Genera un CSV UTF-8 (con BOM per Excel) contenente tutti i turni del mese
   * visualizzato, ordinati per data e poi per nome dipendente.
   * Colonne: Data · Giorno · Dipendente · Email · Team · Turno · Assenza · Note
   */
  const exportMonthCSV = useCallback(() => {
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));

    const header = ['Data', 'Giorno', 'Dipendente', 'Email', 'Team', 'Turno', 'Assenza', 'Note'];

    const sorted = [...shifts].sort((a, b) => {
      if (a.shift_date < b.shift_date) return -1;
      if (a.shift_date > b.shift_date) return 1;
      return (a.user?.full_name ?? '').localeCompare(b.user?.full_name ?? '', 'it');
    });

    const rows = sorted.map((s) => {
      const d = new Date(s.shift_date + 'T00:00:00');
      const tid = s.user ? firstTeamId(s.user) : null;
      const teamName = tid ? (teamMap[tid] ?? '') : '';
      const turno    = s.leave_type ? '' : (s.shift_type === 'office' ? 'Ufficio' : 'Smart Working');
      const assenza  = s.leave_type ? (LEAVE_LABELS[s.leave_type] ?? s.leave_type) : '';

      return [
        s.shift_date,
        GIORNI_IT[d.getDay()],
        s.user?.full_name ?? '',
        s.user?.email ?? '',
        teamName,
        turno,
        assenza,
        s.leave_note ?? '',
      ];
    });

    const escape = (cell: string) => `"${cell.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((r) => r.map(escape).join(',')).join('\r\n');

    // BOM UTF-8 (﻿) per compatibilità con Microsoft Excel
    downloadText(
      '﻿' + csv,
      `calendario-${MESI_IT[month].toLowerCase()}-${year}.csv`,
      'text/csv;charset=utf-8',
    );
  }, [shifts, teams, month, year]);

  // ── Export TXT — singolo giorno ───────────────────────────────────────────
  /**
   * Genera un file .txt con layout a blocchi per un singolo giorno.
   * Sezioni: In Ufficio · Smart Working · Assenti · Non pianificati.
   * Include data/ora di esportazione nell'intestazione.
   */
  const exportDayTXT = useCallback((date: string) => {
    const teamMap = Object.fromEntries(teams.map((t) => [t.id, t.name]));
    const d = new Date(date + 'T00:00:00');
    const dayLabel = d.toLocaleDateString('it-IT', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
    // Prima lettera maiuscola
    const dayLabelUC = dayLabel.charAt(0).toUpperCase() + dayLabel.slice(1);

    const shiftsDay = shifts.filter((s) => s.shift_date === date);
    const shiftByUser = new Map(shiftsDay.map((s) => [s.user_id, s]));

    // Raggruppa utenti per categoria
    const office:      User[] = [];
    const smart:       User[] = [];
    const absent:      Array<{ user: User; label: string; note: string | null }> = [];
    const unplanned:   User[] = [];

    for (const u of users) {
      const s = shiftByUser.get(u.id);
      if (!s) {
        unplanned.push(u);
      } else if (s.leave_type) {
        absent.push({
          user: u,
          label: LEAVE_LABELS[s.leave_type] ?? s.leave_type,
          note: s.leave_note ?? null,
        });
      } else if (s.shift_type === 'office') {
        office.push(u);
      } else {
        smart.push(u);
      }
    }

    const sortByName = (a: User, b: User) =>
      a.full_name.localeCompare(b.full_name, 'it');
    office.sort(sortByName);
    smart.sort(sortByName);
    absent.sort((a, b) => a.user.full_name.localeCompare(b.user.full_name, 'it'));
    unplanned.sort(sortByName);

    const W = 52; // larghezza corpo
    const line  = '─'.repeat(W);
    const dline = '═'.repeat(W);

    /** Riga di testo centrata entro W caratteri. */
    const center = (s: string) => {
      const pad = Math.max(0, Math.floor((W - s.length) / 2));
      return ' '.repeat(pad) + s;
    };

    /** Formatta una riga utente: nome (allineato a sinistra) + team (a destra). */
    const userRow = (u: User, suffix = '') => {
      const tid = firstTeamId(u);
      const team = tid ? (teamMap[tid] ?? '') : '';
      const name = u.full_name + (suffix ? `  ${suffix}` : '');
      const gap = Math.max(1, W - 2 - name.length - team.length);
      return `  ${name}${' '.repeat(gap)}${team}`;
    };

    /** Blocco sezione con titolo, separatore e lista utenti. */
    const section = (icon: string, title: string, count: number, rows: string[]) => {
      const heading = `${icon}  ${title}  (${count} ${count === 1 ? 'persona' : 'persone'})`;
      const body = rows.length > 0 ? rows.join('\n') : '  (nessuno)';
      return `${line}\n${heading}\n${line}\n\n${body}\n`;
    };

    const lines: string[] = [
      dline,
      center('SmartWork Scheduler — Calendario'),
      center(dayLabelUC),
      dline,
      '',
      center(`Esportato il ${nowItStr()}`),
      '',
      '',
      section(
        '🏢', 'IN UFFICIO', office.length,
        office.map((u) => userRow(u)),
      ),
      '',
      section(
        '🏠', 'SMART WORKING', smart.length,
        smart.map((u) => userRow(u)),
      ),
      '',
      section(
        '🚫', 'ASSENTI', absent.length,
        absent.map(({ user: u, label, note }) =>
          userRow(u, `[${label}${note ? ' — ' + note : ''}]`),
        ),
      ),
      '',
      section(
        '⬜', 'NON PIANIFICATI', unplanned.length,
        unplanned.map((u) => userRow(u)),
      ),
      '',
      dline,
      center('generato da SmartWork Scheduler — octoshift.app'),
      dline,
    ];

    const filename = `calendario-${date}.txt`;
    downloadText(lines.join('\n'), filename);
  }, [shifts, users, teams]);

  // ── Handler export giorno da input manuale ────────────────────────────────
  const handleExportDayFromInput = () => {
    if (!exportDay) return;
    exportDayTXT(exportDay);
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <Layout userRole={userRole} userName={userName} onLogout={logout}>
      <div className="space-y-6">

        {/* Intestazione */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Calendario</h1>
            <p className="text-gray-600 mt-2">Visualizza lo schedule del mese</p>
          </div>

          {/* Controlli export */}
          <div className="flex flex-wrap items-center gap-3">

            {/* Export CSV mese */}
            <button
              onClick={exportMonthCSV}
              disabled={loading || shifts.length === 0}
              title={`Scarica il calendario di ${MESI_IT[month]} ${year} in formato CSV`}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
            >
              <span>⬇</span>
              <span>CSV {MESI_IT[month]}</span>
            </button>

            {/* Export TXT giorno — input manuale */}
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={exportDay}
                min={`${year}-${String(month + 1).padStart(2, '0')}-01`}
                max={toLocalDateStr(new Date(year, month + 1, 0))}
                onChange={(e) => setExportDay(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <button
                onClick={handleExportDayFromInput}
                disabled={!exportDay || loading}
                title="Scarica il riepilogo del giorno in formato TXT"
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition"
              >
                <span>⬇</span>
                <span>TXT giorno</span>
              </button>
            </div>

          </div>
        </div>

        {/* Hint vista calendario */}
        <p className="text-xs text-gray-400">
          💡 Nella vista <strong>Calendario</strong> puoi anche cliccare su un giorno per scaricarne direttamente il riepilogo TXT.
        </p>

        {/* Navigazione mese */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Successivo →
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <Calendar
            year={year}
            month={month + 1}
            shifts={shifts}
            maxCapacity={maxCapacity}
            teams={teams}
            users={users}
            holidays={holidays}
            workDays={workDays}
            editable={false}
            currentUserId={userId}
            onDayClick={exportDayTXT}
          />
        )}

      </div>
    </Layout>
  );
}
