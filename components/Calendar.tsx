'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { ShiftWithUser, Team, User, ShiftType } from '@/types';
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

/** Safe local-date string, avoids UTC-offset flipping to previous day */
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

const IT_DAYS_FULL: Record<number, string> = {
  0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Gio', 5: 'Ven', 6: 'Sab',
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

export default function Calendar({
  year,
  month, // 1-based
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

  // month is 1-based → convert to 0-based for Date operations
  const m0 = month - 1;
  const days = getMonthDays(year, m0);
  const monthName = new Date(year, m0).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });
  const firstDay = new Date(year, m0, 1).getDay();
  const holidaySet = useMemo(() => new Set(holidays), [holidays]);

  // Build team color map for quick lookup
  const teamColorMap = new Map<string, string>();
  teams.forEach((t) => teamColorMap.set(t.id, t.color));

  function userTeamColor(shift: ShiftWithUser): string | null {
    const ids = shift.user?.team_ids ?? [];
    for (const tid of ids) {
      const c = teamColorMap.get(tid);
      if (c) return c;
    }
    return null;
  }

  // Matrix view: derive user list
  const matrixUsers = useMemo<User[]>(() => {
    if (users && users.length > 0) return users;
    const map = new Map<string, User>();
    shifts.forEach((s) => {
      if (s.user && !map.has(s.user_id)) map.set(s.user_id, s.user as User);
    });
    return Array.from(map.values()).sort((a, b) =>
      a.full_name.localeCompare(b.full_name),
    );
  }, [users, shifts]);

  // Matrix shift lookup: dateStr → userId → ShiftWithUser
  const shiftLookup = useMemo(() => {
    const map = new Map<string, Map<string, ShiftWithUser>>();
    shifts.forEach((s) => {
      if (!map.has(s.shift_date)) map.set(s.shift_date, new Map());
      map.get(s.shift_date)!.set(s.user_id, s);
    });
    return map;
  }, [shifts]);

  // Header with view toggle
  const header = (
    <div className="p-4 border-b border-gray-200 flex items-center justify-between">
      <h2 className="text-xl font-bold text-gray-900 capitalize">{monthName}</h2>
      <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
        <button
          onClick={() => setViewMode('calendar')}
          className={`px-3 py-1.5 font-medium transition-colors ${
            viewMode === 'calendar'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Calendario
        </button>
        <button
          onClick={() => setViewMode('matrix')}
          className={`px-3 py-1.5 font-medium transition-colors border-l border-gray-300 ${
            viewMode === 'matrix'
              ? 'bg-blue-600 text-white'
              : 'bg-white text-gray-600 hover:bg-gray-50'
          }`}
        >
          Matrice
        </button>
      </div>
    </div>
  );

  if (viewMode === 'matrix') {
    return (
      <div className="bg-white rounded-lg shadow">
        {header}

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left font-semibold text-gray-600 whitespace-nowrap border-r border-gray-200 min-w-[90px]">
                  Data
                </th>
                {matrixUsers.map((u) => (
                  <th
                    key={u.id}
                    className="px-2 py-2 text-center font-medium text-gray-600 min-w-[70px] border-r border-gray-100 last:border-r-0"
                    title={u.full_name}
                  >
                    <div className="flex flex-col items-center gap-0.5">
                      <div className="w-6 h-6 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center font-semibold text-[10px]">
                        {getInitials(u.full_name)}
                      </div>
                      <span className="truncate max-w-[60px] text-[10px]">{u.full_name.split(' ')[0]}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((date) => {
                const dateStr = localDateStr(date);
                const dayOfWeek = date.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
                const isHoliday = holidaySet.has(dateStr);
                const isNonWorking = isWeekend || isHoliday;
                const rowShifts = shiftLookup.get(dateStr);

                const rowLabel = (
                  <span className={isNonWorking ? 'text-gray-400' : 'text-gray-700'}>
                    {IT_DAYS_FULL[dayOfWeek]} {date.getDate()}
                    {isHoliday && (
                      <span className="ml-1 text-amber-500 font-bold" title="Festivo">*</span>
                    )}
                  </span>
                );

                return (
                  <tr
                    key={dateStr}
                    className={`border-b border-gray-100 hover:bg-gray-50/50 ${
                      isNonWorking ? 'bg-gray-50/70' : ''
                    }`}
                  >
                    <td
                      className="sticky left-0 z-10 bg-inherit px-3 py-1.5 font-medium whitespace-nowrap border-r border-gray-200"
                      style={{ backgroundColor: isHoliday ? '#fffbeb' : isWeekend ? '#f9fafb' : 'white' }}
                    >
                      {rowLabel}
                    </td>
                    {matrixUsers.map((u) => {
                      const shift = rowShifts?.get(u.id);
                      const type = shift?.shift_type;
                      const bg = type ? SHIFT_BG[type] : undefined;
                      const color = type ? SHIFT_TEXT[type] : undefined;
                      return (
                        <td
                          key={u.id}
                          className="px-1 py-1 text-center border-r border-gray-100 last:border-r-0"
                        >
                          {type ? (
                            <div
                              className="rounded px-1 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: bg, color }}
                            >
                              {SHIFT_LABELS[type] ?? type}
                            </div>
                          ) : isNonWorking ? (
                            <div className="text-gray-300 text-[11px]">—</div>
                          ) : (
                            <div className="text-gray-300 text-[11px]">—</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 bg-gray-50 rounded-b-lg flex flex-wrap gap-4 text-xs border-t border-gray-200">
          {Object.entries(SHIFT_LABELS).map(([type, label]) => (
            <div key={type} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded"
                style={{ backgroundColor: SHIFT_BG[type] }}
              />
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

  // Calendar (grid) view
  return (
    <div className="bg-white rounded-lg shadow">
      {header}

      {/* Calendar */}
      <div className="p-4">
        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-px mb-px">
          {IT_DAYS_SHORT.map((day) => (
            <div
              key={day}
              className="bg-gray-100 p-2 text-center text-sm font-semibold text-gray-700"
            >
              {day}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50 p-2 min-h-28" />
          ))}

          {days.map((date) => {
            const dateStr = localDateStr(date);
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
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
                {/* Date number */}
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-bold ${isHoliday ? 'text-amber-600' : isWeekend ? 'text-gray-400' : 'text-gray-700'}`}>
                    {date.getDate()}
                  </span>
                  {isHoliday && (
                    <span className="text-[10px] text-amber-600 font-medium">Festivo</span>
                  )}
                </div>

                {/* Capacity indicator */}
                {officeCount > 0 && (
                  <div
                    className={`text-xs font-semibold mb-1 px-1 py-0.5 rounded ${
                      isOverCapacity
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    {officeCount}/{maxCapacity}
                  </div>
                )}

                {/* Shifts */}
                <div className="space-y-0.5">
                  {cellShifts.slice(0, 4).map((shift) => {
                    const teamColor = userTeamColor(shift);
                    return (
                      <div
                        key={shift.id}
                        className={`text-xs px-1 py-0.5 rounded flex items-center gap-1 ${getShiftColor(shift.shift_type)}`}
                        style={
                          teamColor && shift.shift_type === 'office'
                            ? { borderLeft: `3px solid ${teamColor}` }
                            : undefined
                        }
                      >
                        <span className="font-bold truncate">
                          {shift.user ? getInitials(shift.user.full_name) : '?'}
                        </span>
                        {shift.locked && <span title="Bloccato">🔒</span>}
                      </div>
                    );
                  })}
                  {cellShifts.length > 4 && (
                    <div className="text-xs text-gray-400 pl-1">
                      +{cellShifts.length - 4}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-4 pt-2 bg-gray-50 rounded-b-lg flex flex-wrap gap-4 text-xs">
        {[
          ['office', 'Ufficio'],
          ['smartwork', 'Smart'],
          ['vacation', 'Ferie'],
          ['permission', 'Permesso'],
          ['sick', 'Malato'],
        ].map(([type, label]) => (
          <div key={type} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${getShiftColor(type).split(' ')[0]}`} />
            <span>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded bg-amber-100" />
          <span className="text-amber-700">Festivo</span>
        </div>
        {teams.length > 0 && (
          <>
            <span className="text-gray-300">|</span>
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded"
                  style={{ backgroundColor: t.color }}
                />
                <span>{t.name}</span>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
