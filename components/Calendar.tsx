'use client';

import React, { useEffect, useState } from 'react';
import { ShiftWithUser, DayShifts } from '@/types';
import { getMonthDays, getDayName, getInitials, getShiftColor } from '@/lib/utils';

interface CalendarProps {
  year: number;
  month: number;
  shifts: ShiftWithUser[];
  maxCapacity: number;
  onDayClick?: (date: string) => void;
  editable?: boolean;
}

export default function Calendar({
  year,
  month,
  shifts,
  maxCapacity,
  onDayClick,
  editable = false,
}: CalendarProps) {
  const [dayShifts, setDayShifts] = useState<Record<string, ShiftWithUser[]>>({});

  useEffect(() => {
    // Group shifts by date
    const grouped: Record<string, ShiftWithUser[]> = {};
    shifts.forEach((shift) => {
      if (!grouped[shift.shift_date]) {
        grouped[shift.shift_date] = [];
      }
      grouped[shift.shift_date].push(shift);
    });
    setDayShifts(grouped);
  }, [shifts]);

  const days = getMonthDays(year, month);
  const monthName = new Date(year, month).toLocaleDateString('it-IT', {
    month: 'long',
    year: 'numeric',
  });

  const weekDays = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const firstDay = new Date(year, month, 1).getDay();

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-2xl font-bold text-gray-900 capitalize">
          {monthName}
        </h2>
      </div>

      {/* Calendar */}
      <div className="p-6">
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

        {/* Calendar grid */}
        <div className="grid grid-cols-7 gap-px bg-gray-200">
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} className="bg-gray-50 p-2 min-h-32" />
          ))}

          {/* Calendar days */}
          {days.map((date) => {
            const dateStr = date.toISOString().split('T')[0];
            const dayOfWeek = date.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const shifts = dayShifts[dateStr] || [];
            const officeCount = shifts.filter(
              (s) => s.shift_type === 'office'
            ).length;
            const isOverCapacity = officeCount > maxCapacity;

            return (
              <div
                key={dateStr}
                className={`bg-white p-2 min-h-32 border border-gray-200 cursor-pointer hover:bg-blue-50 transition ${
                  isWeekend ? 'bg-gray-50' : ''
                } ${isOverCapacity ? 'ring-2 ring-red-400' : ''}`}
                onClick={() => onDayClick?.(dateStr)}
              >
                {/* Date number */}
                <div className="text-sm font-bold text-gray-700 mb-1">
                  {date.getDate()}
                </div>

                {/* Capacity indicator */}
                {officeCount > 0 && (
                  <div
                    className={`text-xs font-semibold mb-2 p-1 rounded ${
                      isOverCapacity
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}
                  >
                    Ufficio: {officeCount}/{maxCapacity}
                  </div>
                )}

                {/* Shift list with initials */}
                <div className="space-y-1">
                  {shifts.map((shift) => (
                    <div
                      key={shift.id}
                      className={`text-xs p-1 rounded flex items-center justify-between ${getShiftColor(
                        shift.shift_type
                      )}`}
                    >
                      <span className="font-bold">
                        {shift.user ? getInitials(shift.user.full_name) : '?'}
                      </span>
                      {shift.locked && (
                        <span className="lock-icon" title="Bloccato">
                          🔒
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Legend info */}
                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500">
                  {shifts.length} persone
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pb-6 pt-4 bg-gray-50 rounded-b-lg">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-blue-100 rounded border border-blue-300"></div>
            <span>Ufficio</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-green-100 rounded border border-green-300"></div>
            <span>Smart</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-yellow-100 rounded border border-yellow-300"></div>
            <span>Ferie</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-100 rounded border border-purple-300"></div>
            <span>Permesso</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-100 rounded border border-red-300"></div>
            <span>Malato</span>
          </div>
        </div>
      </div>
    </div>
  );
}
