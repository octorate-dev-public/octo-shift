'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ShiftWithUser, Team, User } from '@/types';
import {
  getMonthDays,
  getInitials,
  getShiftColor,
  getLeaveLabel,
  getLeaveIcon,
  isAbsenceShift,
  isOfficePresence,
} from '@/lib/utils';

export interface SwapCell {
  userId: string;
  date: string;
  shiftType: string | null;
}

const DAY_NAMES_CAL = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DEFAULT_WORK_DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

interface CalendarProps {
  year: number;
  month: number; // 1-based (1=January … 12=December)
  shifts: ShiftWithUser[];
  maxCapacity: number;
  teams?: Team[];
  users?: User[];
  holidays?: string[];
  workDays?: string[];
  onDayClick?: (date: string) => void;
  selectedDate?: string | null;
  editable?: boolean;
  onSwapShifts?: (a: SwapCell, b: SwapCell) => Promise<void>;
  /** ID dell'utente loggato — usato per evidenziare di default la sua colonna nella vista Matrice */
  currentUserId?: string | null;
}

function localDateStr(date: Date): string {
  return (
    date.getFullYear() +
    '-' +
    String(date.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(date.getDate()).padStart(2, '0')
  );
}

const IT_DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
const IT_DAYS_ABBR: Record<number, string> = { 0: 'Do', 1: 'Lu', 2: 'Ma', 3: 'Me', 4: 'Gi', 5: 'Ve', 6: 'Sa' };

const MATRIX_TYPES = ['office', 'smartwork', 'vacation'] as const;
type MatrixType = (typeof MATRIX_TYPES)[number];

const MATRIX_LABELS: Record<MatrixType, string> = {
  office: 'Ufficio',
  smartwork: 'Smart',
  vacation: 'Ferie',
};

const SHIFT_LABELS: Record<string, string> = {
  office: 'Ufficio',
  smartwork: 'Smart',
};

const LEAVE_LABELS: Record<string, string> = {
  sick: 'Malattia',
  vacation: 'Ferie',
  permission: 'Perm.',
};

const SHIFT_BG: Record<string, string> = {
  office: '#dbeafe',
  smartwork: '#dcfce7',
};

const SHIFT_TEXT: Record<string, string> = {
  office: '#1e40af',
  smartwork: '#166534',
};

const LEAVE_BG: Record<string, string> = {
  sick: '#fee2e2',
  vacation: '#fef9c3',
  permission: '#f3e8ff',
};

const LEAVE_TEXT: Record<string, string> = {
  sick: '#991b1b',
  vacation: '#713f12',
  permission: '#6b21a8',
};

const LEAVE_ICONS: Record<string, string> = {
  sick: '🤒',
  vacation: '✈️',
  permission: '📋',
};

const TOTAL_BG: Record<MatrixType, string> = {
  office: '#eff6ff',
  smartwork: '#f0fdf4',
  vacation: '#fefce8',
};
const TOTAL_TEXT: Record<MatrixType, string> = {
  office: '#1e40af',
  smartwork: '#166534',
  vacation: '#92400e',
};

export default function Calendar({
  year,
  month,
  shifts,
  maxCapacity,
  teams = [],
  users,
  holidays = [],
  workDays,
  onDayClick,
  selectedDate,
  editable = false,
  onSwapShifts,
  currentUserId = null,
}: CalendarProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'matrix'>('matrix');
  const [swapMode, setSwapMode] = useState(false);
  const [swapSelected, setSwapSelected] = useState<SwapCell | null>(null);
  const [swapping, setSwapping] = useState(false);
  const [dayShifts, setDayShifts] = useState<Record<string, ShiftWithUser[]>>({});

  // ── Highlight state per la vista Matrice ──────────────────────
  // Riga (giorno) e colonna (utente) evidenziabili. La colonna di default è
  // l'utente loggato; la riga di default è "oggi" se cade nel mese visualizzato.
  const [highlightedDate, setHighlightedDate] = useState<string | null>(null);
  const [highlightedUserId, setHighlightedUserId] = useState<string | null>(currentUserId);

  // Stringa "oggi" in formato locale YYYY-MM-DD (calcolata una volta sola al mount)
  const todayStr = useMemo(() => localDateStr(new Date()), []);

  // Quando cambia mese/anno, se "oggi" rientra nel mese visualizzato lo selezioniamo
  // come riga di default. Altrimenti azzeriamo la selezione di riga.
  useEffect(() => {
    const todayDate = new Date();
    if (todayDate.getFullYear() === year && todayDate.getMonth() === month - 1) {
      setHighlightedDate(todayStr);
    } else {
      setHighlightedDate(null);
    }
  }, [year, month, todayStr]);

  // Sync della colonna evidenziata col currentUserId quando cambia
  useEffect(() => {
    if (currentUserId) setHighlightedUserId(currentUserId);
  }, [currentUserId]);

  // Exit swap mode when leaving matrix view
  useEffect(() => {
    if (viewMode !== 'matrix') {
      setSwapMode(false);
      setSwapSelected(null);
    }
  }, [viewMode]);

  const m0 = month - 1;
  const days = getMonthDays(year, m0);
  const monthName = new Date(year, m0).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, m0, 1).getDay();
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  // Set of all non-working date strings for this month (weekends + holidays + non-work-days)
  const effectiveWorkDays = workDays ?? DEFAULT_WORK_DAYS;
  const nonWorkingSet = useMemo(() => {
    const s = new Set<string>();
    days.forEach((date) => {
      const dateStr = localDateStr(date);
      const dayName = DAY_NAMES_CAL[date.getDay()];
      if (!effectiveWorkDays.includes(dayName) || holidaySet.has(dateStr)) s.add(dateStr);
    });
    return s;
  }, [days, effectiveWorkDays, holidaySet]);

  // Pre-filter shifts to working days only — ensures holidays never appear in counts or display
  const workingShifts = useMemo(
    () => shifts.filter((s) => !nonWorkingSet.has(s.shift_date)),
    [shifts, nonWorkingSet],
  );

  useEffect(() => {
    const grouped: Record<string, ShiftWithUser[]> = {};
    workingShifts.forEach((shift) => {
      if (!grouped[shift.shift_date]) grouped[shift.shift_date] = [];
      grouped[shift.shift_date].push(shift);
    });
    setDayShifts(grouped);
  }, [workingShifts]);

  const teamColorMap = useMemo(() => {
    const map = new Map<string, string>();
    teams.forEach((t) => map.set(t.id, t.color));
    return map;
  }, [teams]);

  function userTeamColor(shift: ShiftWithUser): string | null {
    for (const tid of shift.user?.team_ids ?? []) {
      const c = teamColorMap.get(tid);
      if (c) return c;
    }
    return null;
  }

  const matrixUsers = useMemo<User[]>(() => {
    if (users && users.length > 0) return users;
    const map = new Map<string, User>();
    shifts.forEach((s) => { if (s.user) map.set(s.user_id, s.user as User); });
    return Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [users, shifts]);

  const shiftLookup = useMemo(() => {
    const map = new Map<string, Map<string, ShiftWithUser>>();
    workingShifts.forEach((s) => {
      if (!map.has(s.shift_date)) map.set(s.shift_date, new Map());
      map.get(s.shift_date)!.set(s.user_id, s);
    });
    return map;
  }, [workingShifts]);

  // Helper: tally a shift into the right bucket.
  // Absences (ferie / permessi / malattia — whether modeled as a leave_type
  // overlay or as a legacy shift_type of 'vacation'|'permission'|'sick') land
  // in the "vacation" (Ferie) column and are NEVER counted toward Ufficio or
  // Smart totals. Only real presences contribute to office/smart counts.
  const tallyShift = (
    totals: Record<MatrixType, number>,
    s: { shift_type: string; leave_type: string | null },
  ) => {
    if (isAbsenceShift(s)) {
      totals.vacation++;
    } else if (s.shift_type === 'office' || s.shift_type === 'smartwork') {
      totals[s.shift_type as MatrixType]++;
    }
  };

  const dateTotals = useMemo(() => {
    const map = new Map<string, Record<MatrixType, number>>();
    days.forEach((date) => {
      const dateStr = localDateStr(date);
      const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
      if (!nonWorkingSet.has(dateStr)) {
        shiftLookup.get(dateStr)?.forEach((s) => tallyShift(totals, s));
      }
      map.set(dateStr, totals);
    });
    return map;
  }, [days, shiftLookup, nonWorkingSet]);

  const userTotals = useMemo(() => {
    const map = new Map<string, Record<MatrixType, number>>();
    matrixUsers.forEach((u) => {
      const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
      // workingShifts already excludes non-working days
      workingShifts.forEach((s) => {
        if (s.user_id === u.id) tallyShift(totals, s);
      });
      map.set(u.id, totals);
    });
    return map;
  }, [matrixUsers, workingShifts]);

  const grandTotals = useMemo(() => {
    const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
    workingShifts.forEach((s) => tallyShift(totals, s));
    return totals;
  }, [workingShifts]);

  // ── Swap mode handlers ──────────────────────────────────────
  const toggleSwapMode = () => {
    setSwapMode((m) => !m);
    setSwapSelected(null);
  };

  const handleCellClick = (userId: string, date: string, shiftType: string | null) => {
    if (!swapMode || !onSwapShifts || swapping) return;

    if (!swapSelected) {
      setSwapSelected({ userId, date, shiftType });
      return;
    }

    // Same cell: deselect
    if (swapSelected.userId === userId && swapSelected.date === date) {
      setSwapSelected(null);
      return;
    }

    const cellA = swapSelected;
    const cellB = { userId, date, shiftType };
    setSwapSelected(null);
    setSwapping(true);
    onSwapShifts(cellA, cellB).finally(() => setSwapping(false));
  };

  const isSwapSelected = (userId: string, date: string) =>
    swapSelected?.userId === userId && swapSelected?.date === date;

  // ── Header ──────────────────────────────────────────────────
  const header = (
    <div className="p-4 border-b border-gray-200">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-gray-900 capitalize">{monthName}</h2>
        <div className="flex items-center gap-2">
          {/* Swap toggle — only in matrix mode */}
          {viewMode === 'matrix' && onSwapShifts && (
            <button
              onClick={toggleSwapMode}
              disabled={swapping}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                swapMode
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
              }`}
            >
              {swapping ? '⏳' : swapMode ? '✕ Annulla' : '⇄ Swap'}
            </button>
          )}
          {/* View toggle */}
          <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 font-medium transition-colors ${
                viewMode === 'calendar' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Calendario
            </button>
            <button
              onClick={() => setViewMode('matrix')}
              className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-300 ${
                viewMode === 'matrix' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Matrice
            </button>
          </div>
        </div>
      </div>

      {/* Swap mode instructions */}
      {viewMode === 'matrix' && swapMode && (
        <div className="mt-2 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs text-indigo-700 flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${swapSelected ? 'bg-indigo-600 animate-pulse' : 'bg-indigo-300'}`} />
          {swapSelected
            ? `Selezionato: ${matrixUsers.find((u) => u.id === swapSelected.userId)?.full_name ?? '?'} — ${swapSelected.date}${swapSelected.shiftType ? ` (${SHIFT_LABELS[swapSelected.shiftType] ?? swapSelected.shiftType})` : ' (vuoto)'} — Clicca un'altra cella per completare lo swap`
            : 'Clicca la prima cella da scambiare'}
        </div>
      )}
    </div>
  );

  // ────────────────────────────────────────────────────────────
  //  MATRIX VIEW
  // ────────────────────────────────────────────────────────────
  if (viewMode === 'matrix') {
    return (
      <div className="bg-white rounded-lg shadow">
        {header}

        <div className={`overflow-x-auto ${swapping ? 'opacity-60 pointer-events-none' : ''}`}>
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 min-w-[90px]">
                  Data
                </th>
                {matrixUsers.map((u) => {
                  const colHighlighted = highlightedUserId === u.id;
                  return (
                    <th
                      key={u.id}
                      onClick={() =>
                        setHighlightedUserId((prev) => (prev === u.id ? null : u.id))
                      }
                      className={`px-2 py-2 text-center font-medium min-w-[68px] border-r border-gray-100 cursor-pointer transition-colors ${
                        colHighlighted
                          ? 'bg-amber-100 text-amber-900'
                          : 'text-gray-600 hover:bg-gray-100'
                      }`}
                      title={u.full_name}
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center font-semibold text-[10px] ${
                            colHighlighted
                              ? 'bg-amber-400 text-amber-950 ring-2 ring-amber-500'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {getInitials(u.full_name)}
                        </div>
                        <span className="truncate max-w-[60px] text-[10px] leading-tight">
                          {u.full_name.split(' ')[0]}
                        </span>
                      </div>
                    </th>
                  );
                })}
                {/* Summary column headers */}
                {MATRIX_TYPES.map((type) => (
                  <th
                    key={type}
                    className="px-2 py-2 text-center font-semibold min-w-[52px] border-l border-gray-300"
                    style={{ backgroundColor: TOTAL_BG[type], color: TOTAL_TEXT[type] }}
                  >
                    {MATRIX_LABELS[type]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((date) => {
                const dateStr = localDateStr(date);
                // Skip non-working days (weekends, holidays, configured non-work days)
                if (nonWorkingSet.has(dateStr)) return null;
                const dow = date.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isHoliday = holidaySet.has(dateStr);
                const isNonWorking = isWeekend || isHoliday;
                const rowShifts = shiftLookup.get(dateStr);
                const dTotals = dateTotals.get(dateStr)!;

                const isToday = dateStr === todayStr;
                const isRowHighlighted = highlightedDate === dateStr;

                return (
                  <tr
                    key={dateStr}
                    className={`border-b border-gray-100 ${
                      isRowHighlighted
                        ? 'bg-amber-50'
                        : isToday
                        ? 'bg-yellow-50/60'
                        : !isNonWorking && !swapMode
                        ? 'hover:bg-gray-50/40'
                        : ''
                    }`}
                  >
                    {/* Date cell — clickable to highlight the row */}
                    <td
                      onClick={() =>
                        !isNonWorking &&
                        setHighlightedDate((prev) => (prev === dateStr ? null : dateStr))
                      }
                      className={`sticky left-0 z-10 px-3 py-1.5 font-medium whitespace-nowrap border-r border-gray-200 ${
                        !isNonWorking ? 'cursor-pointer' : ''
                      } ${isToday ? 'ring-2 ring-inset ring-amber-400' : ''}`}
                      style={{
                        backgroundColor: isRowHighlighted
                          ? '#fde68a'
                          : isToday
                          ? '#fef3c7'
                          : isHoliday
                          ? '#fffbeb'
                          : isWeekend
                          ? '#f9fafb'
                          : 'white',
                        color: isNonWorking ? '#9ca3af' : isToday ? '#78350f' : '#374151',
                        fontWeight: isToday ? 700 : undefined,
                      }}
                      title={isToday ? 'Oggi' : undefined}
                    >
                      {IT_DAYS_ABBR[dow]} {date.getDate()}
                      {isToday && <span className="ml-1 text-amber-500">●</span>}
                      {isHoliday && <span className="ml-1 text-amber-400 font-bold">*</span>}
                    </td>

                    {/* Per-user shift cells */}
                    {matrixUsers.map((u) => {
                      const shift = rowShifts?.get(u.id);
                      // On non-working days, never show shift data regardless of DB content
                      const rawType: string | null = (!isNonWorking && shift?.shift_type) ? shift.shift_type : null;
                      // Normalise legacy shift_type='vacation'|'permission'|'sick' into the leave overlay
                      const legacyLeave: string | null =
                        rawType === 'vacation' || rawType === 'permission' || rawType === 'sick' ? rawType : null;
                      const leave: string | null = (!isNonWorking && (shift?.leave_type ?? legacyLeave)) || null;
                      // The underlying shift_type beneath any leave overlay (office/smartwork only).
                      // Used purely for visual hint (border colour) — does NOT affect totals.
                      const underlyingType: string | null =
                        !legacyLeave && rawType && (rawType === 'office' || rawType === 'smartwork')
                          ? rawType
                          : null;
                      // When there is a leave, display the leave label (Perm./Ferie/Malattia) as
                      // primary text. Otherwise display the actual shift type.
                      const type: string | null = leave ? null : underlyingType;
                      const selected = isSwapSelected(u.id, dateStr);
                      const clickable = swapMode && onSwapShifts && !swapping && !isNonWorking;
                      const colHighlighted = highlightedUserId === u.id;
                      const cellHighlighted = colHighlighted && isRowHighlighted;

                      // When showing a leave on top of a real shift_type, add a coloured border
                      // hinting at what the user *would have been* doing (Ufficio/Smart).
                      const leaveBorderColor: string | null =
                        leave && underlyingType ? SHIFT_TEXT[underlyingType] ?? null : null;

                      return (
                        <td
                          key={u.id}
                          className={`px-1 py-1 text-center border-r border-gray-100 transition-all ${
                            clickable ? 'cursor-pointer' : ''
                          } ${
                            cellHighlighted
                              ? 'bg-amber-200/70'
                              : colHighlighted
                              ? 'bg-amber-50/60'
                              : ''
                          }`}
                          onClick={() => clickable && handleCellClick(u.id, dateStr, type)}
                        >
                          {isNonWorking ? (
                            <div className="text-[10px]" style={{ color: '#e5e7eb' }}>—</div>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              <div
                                className={`rounded px-1 py-0.5 text-[11px] font-medium transition-all ${
                                  selected
                                    ? 'ring-2 ring-indigo-500 ring-offset-1 scale-105'
                                    : clickable
                                    ? 'hover:ring-2 hover:ring-indigo-300 hover:scale-105'
                                    : ''
                                }`}
                                style={
                                  type
                                    ? { backgroundColor: SHIFT_BG[type] ?? '#f3f4f6', color: SHIFT_TEXT[type] ?? '#374151' }
                                    : leave
                                    ? {
                                        backgroundColor: LEAVE_BG[leave],
                                        color: LEAVE_TEXT[leave],
                                        ...(leaveBorderColor
                                          ? {
                                              border: `2px solid ${leaveBorderColor}`,
                                              padding: '0 2px',
                                            }
                                          : {}),
                                      }
                                    : { color: '#d1d5db' }
                                }
                                title={
                                  leave
                                    ? underlyingType
                                      ? `${LEAVE_LABELS[leave]} (previsto: ${SHIFT_LABELS[underlyingType]})`
                                      : LEAVE_LABELS[leave]
                                    : undefined
                                }
                              >
                                {type
                                  ? SHIFT_LABELS[type] ?? type
                                  : leave
                                  ? LEAVE_LABELS[leave]
                                  : '—'}
                              </div>
                            </div>
                          )}
                        </td>
                      );
                    })}

                    {/* Per-date total cells */}
                    {MATRIX_TYPES.map((type) => (
                      <td
                        key={type}
                        className="px-2 py-1 text-center font-semibold border-l border-gray-300"
                        style={{ backgroundColor: TOTAL_BG[type], color: TOTAL_TEXT[type] }}
                      >
                        {dTotals[type] > 0 ? dTotals[type] : (
                          <span className="font-normal" style={{ color: '#d1d5db' }}>—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Separator */}
              <tr>
                <td colSpan={matrixUsers.length + 4} className="border-t-2 border-gray-300 p-0" />
              </tr>

              {/* Per-user summary rows */}
              {MATRIX_TYPES.map((type) => (
                <tr key={`total-${type}`} className="border-b border-gray-100">
                  <td
                    className="sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap border-r border-gray-200 text-[11px]"
                    style={{ backgroundColor: TOTAL_BG[type], color: TOTAL_TEXT[type] }}
                  >
                    Tot. {MATRIX_LABELS[type]}
                  </td>
                  {matrixUsers.map((u) => {
                    const count = userTotals.get(u.id)?.[type] ?? 0;
                    return (
                      <td
                        key={u.id}
                        className="px-1 py-1.5 text-center font-semibold border-r border-gray-100"
                        style={count > 0 ? { backgroundColor: TOTAL_BG[type], color: TOTAL_TEXT[type] } : undefined}
                      >
                        {count > 0 ? count : <span style={{ color: '#d1d5db' }}>—</span>}
                      </td>
                    );
                  })}
                  {/* Grand total in the matching column; blank in others */}
                  {MATRIX_TYPES.map((t) => (
                    <td
                      key={t}
                      className="px-2 py-1.5 text-center font-bold border-l border-gray-300"
                      style={{ backgroundColor: TOTAL_BG[t], color: TOTAL_TEXT[t] }}
                    >
                      {t === type ? grandTotals[type] : ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 bg-gray-50 rounded-b-lg flex flex-wrap gap-4 text-xs border-t border-gray-200">
          {Object.entries(SHIFT_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded" style={{ backgroundColor: SHIFT_BG[type] }} />
              <span style={{ color: SHIFT_TEXT[type] }}>{label}</span>
            </div>
          ))}
          <span className="text-gray-300">|</span>
          {Object.entries(LEAVE_ICONS).map(([type, icon]) => (
            <div key={type} className="flex items-center gap-1">
              <span>{icon}</span>
              <span style={{ color: LEAVE_TEXT[type] }}>{LEAVE_LABELS[type]}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────
  //  CALENDAR (GRID) VIEW
  // ────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-lg shadow">
      {header}

      <div className="p-4">
        <div className="grid grid-cols-7 gap-px mb-px">
          {IT_DAYS_SHORT.map((day) => (
            <div key={day} className="bg-gray-100 p-2 text-center text-sm font-semibold text-gray-700">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50 p-2 min-h-28" />
          ))}

          {days.map((date) => {
            const dateStr = localDateStr(date);
            const dow = date.getDay();
            const isWeekend = dow === 0 || dow === 6;
            const isHoliday = holidaySet.has(dateStr);
            const isNonWorkingGrid = nonWorkingSet.has(dateStr);
            // On non-working days, don't render stale DB shifts
            // dayShifts already excludes non-working day shifts (built from workingShifts)
            const cellShifts = isNonWorkingGrid ? [] : (dayShifts[dateStr] || []);
            // Absences (ferie / permessi / malattia) do not count toward office capacity
            const officeCount = cellShifts.filter(isOfficePresence).length;
            const isOverCapacity = officeCount > maxCapacity;
            const isSelected = selectedDate === dateStr;

            // Holidays treated same as weekends — no amber, no label
            const isNonWorkingDay = isWeekend || isHoliday;
            const cellBg = isNonWorkingDay ? 'bg-gray-50' : 'bg-white';

            return (
              <div
                key={dateStr}
                onClick={() => onDayClick?.(dateStr)}
                className={[
                  cellBg,
                  'p-1.5 min-h-28 border border-gray-200 transition',
                  editable && !isNonWorkingDay ? 'cursor-pointer hover:bg-blue-50' : '',
                  isOverCapacity ? 'ring-2 ring-red-400' : '',
                  isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isNonWorkingDay ? 'text-gray-400' : 'text-gray-700'}`}>
                    {date.getDate()}
                  </span>
                </div>

                {officeCount > 0 && (
                  <div className={`text-xs font-semibold mb-1 px-1 py-0.5 rounded ${
                    isOverCapacity ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {officeCount}/{maxCapacity}
                  </div>
                )}

                <div className="space-y-0.5">
                  {cellShifts.slice(0, 4).map((shift) => {
                    const teamColor = userTeamColor(shift);
                    return (
                      <div
                        key={shift.id}
                        className={`text-xs px-1 py-0.5 rounded flex items-center gap-1 ${getShiftColor(shift.shift_type)}`}
                        style={teamColor && shift.shift_type === 'office' ? { borderLeft: `3px solid ${teamColor}` } : undefined}
                      >
                        <span className="font-bold truncate">
                          {shift.user ? getInitials(shift.user.full_name) : '?'}
                        </span>
                        {shift.leave_type && (
                          <span title={getLeaveLabel(shift.leave_type)} className="flex-shrink-0">
                            {getLeaveIcon(shift.leave_type)}
                          </span>
                        )}
                        {shift.locked && <span title="Bloccato">🔒</span>}
                      </div>
                    );
                  })}
                  {cellShifts.length > 4 && (
                    <div className="text-xs text-gray-400 pl-1">+{cellShifts.length - 4}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-4 pt-2 bg-gray-50 rounded-b-lg flex flex-wrap gap-4 text-xs">
        {[['office', 'Ufficio'], ['smartwork', 'Smart']].map(
          ([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${getShiftColor(type).split(' ')[0]}`} />
              <span>{label}</span>
            </div>
          ),
        )}
        <span className="text-gray-300">|</span>
        {Object.entries(LEAVE_ICONS).map(([type, icon]) => (
          <div key={type} className="flex items-center gap-1">
            <span>{icon}</span>
            <span style={{ color: LEAVE_TEXT[type] }}>{LEAVE_LABELS[type]}</span>
          </div>
        ))}
        {teams.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded" style={{ backgroundColor: t.color }} />
                <span>{t.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
