'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ShiftWithUser, Team, User } from '@/types';
import { getMonthDays, getInitials, getShiftColor } from '@/lib/utils';

interface CalendarProps {
  year: number;
  month: number; // 1-based (1=January … 12=December)
  shifts: ShiftWithUser[];
  maxCapacity: number;
  teams?: Team[];
  users?: User[];
  holidays?: string[];
  onDayClick?: (date: string) => void;
  selectedDate?: string | null;
  editable?: boolean;
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
  sick: 'Malato',
  vacation: 'Ferie',
  permission: 'Perm.',
};

const SHIFT_BG: Record<string, string> = {
  office: '#dbeafe',
  smartwork: '#dcfce7',
  sick: '#fee2e2',
  vacation: '#fef9c3',
  permission: '#f3f4f6',
};

const SHIFT_TEXT: Record<string, string> = {
  office: '#1e40af',
  smartwork: '#166534',
  sick: '#991b1b',
  vacation: '#713f12',
  permission: '#374151',
};

// Summary column header colors
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
  onDayClick,
  selectedDate,
  editable = false,
}: CalendarProps) {
  const [viewMode, setViewMode] = useState<'calendar' | 'matrix'>('calendar');
  const [dayShifts, setDayShifts] = useState<Record<string, ShiftWithUser[]>>({});

  useEffect(() => {
    const grouped: Record<string, ShiftWithUser[]> = {};
    shifts.forEach((shift) => {
      if (!grouped[shift.shift_date]) grouped[shift.shift_date] = [];
      grouped[shift.shift_date].push(shift);
    });
    setDayShifts(grouped);
  }, [shifts]);

  const m0 = month - 1;
  const days = getMonthDays(year, m0);
  const monthName = new Date(year, m0).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, m0, 1).getDay();
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

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

  // Matrix: resolve user list
  const matrixUsers = useMemo<User[]>(() => {
    if (users && users.length > 0) return users;
    const map = new Map<string, User>();
    shifts.forEach((s) => { if (s.user) map.set(s.user_id, s.user as User); });
    return Array.from(map.values()).sort((a, b) => a.full_name.localeCompare(b.full_name));
  }, [users, shifts]);

  // Matrix: date → userId → shift
  const shiftLookup = useMemo(() => {
    const map = new Map<string, Map<string, ShiftWithUser>>();
    shifts.forEach((s) => {
      if (!map.has(s.shift_date)) map.set(s.shift_date, new Map());
      map.get(s.shift_date)!.set(s.user_id, s);
    });
    return map;
  }, [shifts]);

  // Per-date totals (right summary columns)
  const dateTotals = useMemo(() => {
    const map = new Map<string, Record<MatrixType, number>>();
    days.forEach((date) => {
      const dateStr = localDateStr(date);
      const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
      shiftLookup.get(dateStr)?.forEach((s) => {
        if (s.shift_type in totals) totals[s.shift_type as MatrixType]++;
      });
      map.set(dateStr, totals);
    });
    return map;
  }, [days, shiftLookup]);

  // Per-user totals (bottom summary rows)
  const userTotals = useMemo(() => {
    const map = new Map<string, Record<MatrixType, number>>();
    matrixUsers.forEach((u) => {
      const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
      shifts.forEach((s) => {
        if (s.user_id === u.id && s.shift_type in totals) {
          totals[s.shift_type as MatrixType]++;
        }
      });
      map.set(u.id, totals);
    });
    return map;
  }, [matrixUsers, shifts]);

  // Grand totals (bottom-right corner)
  const grandTotals = useMemo(() => {
    const totals: Record<MatrixType, number> = { office: 0, smartwork: 0, vacation: 0 };
    shifts.forEach((s) => {
      if (s.shift_type in totals) totals[s.shift_type as MatrixType]++;
    });
    return totals;
  }, [shifts]);

  const viewToggle = (
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
  );

  const header = (
    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
      <h2 className="text-xl font-bold text-gray-900 capitalize">{monthName}</h2>
      {viewToggle}
    </div>
  );

  // ─────────────────────────────────────────────
  //  MATRIX VIEW
  // ─────────────────────────────────────────────
  if (viewMode === 'matrix') {
    return (
      <div className="bg-white rounded-lg shadow">
        {header}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {/* Date column */}
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 min-w-[90px]">
                  Data
                </th>
                {/* User columns */}
                {matrixUsers.map((u) => (
                  <th
                    key={u.id}
                    className="px-2 py-2 text-center font-medium text-gray-600 min-w-[68px] border-r border-gray-100 last:border-r-0"
                    title={u.full_name}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-semibold text-[10px]">
                        {getInitials(u.full_name)}
                      </div>
                      <span className="truncate max-w-[60px] text-[10px] leading-tight">
                        {u.full_name.split(' ')[0]}
                      </span>
                    </div>
                  </th>
                ))}
                {/* Summary header columns */}
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
                const dow = date.getDay();
                const isWeekend = dow === 0 || dow === 6;
                const isHoliday = holidaySet.has(dateStr);
                const isNonWorking = isWeekend || isHoliday;
                const rowShifts = shiftLookup.get(dateStr);
                const dTotals = dateTotals.get(dateStr)!;

                return (
                  <tr
                    key={dateStr}
                    className={`border-b border-gray-100 ${isNonWorking ? '' : 'hover:bg-gray-50/40'}`}
                  >
                    {/* Date cell */}
                    <td
                      className="sticky left-0 z-10 px-3 py-1.5 font-medium whitespace-nowrap border-r border-gray-200"
                      style={{
                        backgroundColor: isHoliday ? '#fffbeb' : isWeekend ? '#f9fafb' : 'white',
                        color: isNonWorking ? '#9ca3af' : '#374151',
                      }}
                    >
                      {IT_DAYS_ABBR[dow]} {date.getDate()}
                      {isHoliday && <span className="ml-1 text-amber-400 font-bold">*</span>}
                    </td>
                    {/* Per-user shift cells */}
                    {matrixUsers.map((u) => {
                      const shift = rowShifts?.get(u.id);
                      const type = shift?.shift_type;
                      return (
                        <td
                          key={u.id}
                          className="px-1 py-1 text-center border-r border-gray-100 last:border-r-0"
                        >
                          {type ? (
                            <div
                              className="rounded px-1 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: SHIFT_BG[type] ?? '#f3f4f6', color: SHIFT_TEXT[type] ?? '#374151' }}
                            >
                              {SHIFT_LABELS[type] ?? type}
                            </div>
                          ) : (
                            <div className="text-gray-200 text-[11px]">—</div>
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
                          <span className="text-gray-300 font-normal">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}

              {/* Spacer before summary rows */}
              <tr className="border-t-2 border-gray-300">
                <td
                  colSpan={matrixUsers.length + 4}
                  className="py-0"
                />
              </tr>

              {/* Per-user summary rows (one per type) */}
              {MATRIX_TYPES.map((type) => (
                <tr key={`total-${type}`} className="border-b border-gray-100">
                  {/* Label */}
                  <td
                    className="sticky left-0 z-10 px-3 py-1.5 font-semibold whitespace-nowrap border-r border-gray-200 text-[11px]"
                    style={{ backgroundColor: TOTAL_BG[type], color: TOTAL_TEXT[type] }}
                  >
                    Tot. {MATRIX_LABELS[type]}
                  </td>
                  {/* Per-user count */}
                  {matrixUsers.map((u) => {
                    const count = userTotals.get(u.id)?.[type] ?? 0;
                    return (
                      <td
                        key={u.id}
                        className="px-1 py-1.5 text-center font-semibold border-r border-gray-100"
                        style={{ backgroundColor: count > 0 ? TOTAL_BG[type] : undefined, color: TOTAL_TEXT[type] }}
                      >
                        {count > 0 ? count : <span className="text-gray-300">—</span>}
                      </td>
                    );
                  })}
                  {/* Grand total in matching summary column; blanks in others */}
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
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded bg-amber-100" />
            <span className="text-amber-700">Festivo *</span>
          </div>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  //  CALENDAR (GRID) VIEW
  // ─────────────────────────────────────────────
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
            const cellShifts = dayShifts[dateStr] || [];
            const officeCount = cellShifts.filter((s) => s.shift_type === 'office').length;
            const isOverCapacity = officeCount > maxCapacity;
            const isSelected = selectedDate === dateStr;

            let cellBg = 'bg-white';
            if (isHoliday) cellBg = 'bg-amber-50';
            else if (isWeekend) cellBg = 'bg-gray-50';

            return (
              <div
                key={dateStr}
                onClick={() => onDayClick?.(dateStr)}
                className={[
                  cellBg,
                  'p-1.5 min-h-28 border border-gray-200 transition',
                  editable ? 'cursor-pointer hover:bg-blue-50' : '',
                  isOverCapacity ? 'ring-2 ring-red-400' : '',
                  isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : '',
                ].join(' ')}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isHoliday ? 'text-amber-600' : isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>
                    {date.getDate()}
                  </span>
                  {isHoliday && (
                    <span className="text-[10px] text-amber-600 font-medium">Festivo</span>
                  )}
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
        {[['office', 'Ufficio'], ['smartwork', 'Smart'], ['vacation', 'Ferie'], ['permission', 'Permesso'], ['sick', 'Malato']].map(
          ([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded ${getShiftColor(type).split(' ')[0]}`} />
              <span>{label}</span>
            </div>
          ),
        )}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-100" />
          <span className="text-amber-700">Festivo</span>
        </div>
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
