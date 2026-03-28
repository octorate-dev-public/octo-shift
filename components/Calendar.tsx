'use client';

import React, { useEffect, useState } from 'react';
import { ShiftWithUser, Team } from '@/types';
import { getMonthDays, getInitials, getShiftColor } from '@/lib/utils';

interface CalendarProps {
  year: number;
  month: number; // 1-based (1=January … 12=December)
  shifts: ShiftWithUser[];
  maxCapacity: number;
  teams?: Team[];
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

export default function Calendar({
  year,
  month, // 1-based
  shifts,
  maxCapacity,
  teams = [],
  onDayClick,
  selectedDate,
  editable = false,
}: CalendarProps) {
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

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

  // Build team color map for quick lookup
  const teamColorMap = new Map<string, string>();
  teams.forEach((t) => teamColorMap.set(t.id, t.color));

  // Pick the "primary" color for a shift's user (first team they belong to)
  function userTeamColor(shift: ShiftWithUser): string | null {
    const ids = shift.user?.team_ids ?? [];
    for (const tid of ids) {
      const c = teamColorMap.get(tid);
      if (c) return c;
    }
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 capitalize">{monthName}</h2>
      </div>

      {/* Calendar */}
      <div className="p-4">
        {/* Week day headers */}
        <div className="grid grid-cols-7 gap-px mb-px">
          {weekDays.map((day) => (
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
            const cellShifts = dayShifts[dateStr] || [];
            const officeCount = cellShifts.filter((s) => s.shift_type === 'office').length;
            const isOverCapacity = officeCount > maxCapacity;
            const isSelected = selectedDate === dateStr;

            return (
              <div
                key={dateStr}
                onClick={() => onDayClick?.(dateStr)}
                className={[
                  'bg-white p-1.5 min-h-28 border border-gray-200 transition',
                  editable ? 'cursor-pointer hover:bg-blue-50' : '',
                  isWeekend ? 'bg-gray-50' : '',
                  isOverCapacity ? 'ring-2 ring-red-400' : '',
                  isSelected ? 'ring-2 ring-blue-500 bg-blue-50' : '',
                ].join(' ')}
              >
                {/* Date number */}
                <div className="text-xs font-bold text-gray-700 mb-1">
                  {date.getDate()}
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
