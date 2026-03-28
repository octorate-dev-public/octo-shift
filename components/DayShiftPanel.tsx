'use client';

import React, { useState } from 'react';
import { ShiftWithUser, User } from '@/types';
import { getInitials, parseDateString } from '@/lib/utils';

interface DayShiftPanelProps {
  date: string | null;
  shifts: ShiftWithUser[];
  users: User[];
  maxCapacity: number;
  onClose: () => void;
  onShiftChange: (userId: string, date: string, newType: 'office' | 'smartwork') => Promise<void>;
}

const ITALIAN_DAYS = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
const ITALIAN_MONTHS = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

function formatItalianDate(dateStr: string): string {
  const d = parseDateString(dateStr);
  return `${ITALIAN_DAYS[d.getDay()]} ${d.getDate()} ${ITALIAN_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function DayShiftPanel({
  date,
  shifts,
  users,
  maxCapacity,
  onClose,
  onShiftChange,
}: DayShiftPanelProps) {
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());

  if (!date) return null;

  const dayShifts = shifts.filter((s) => s.shift_date === date);

  const officeShifts = dayShifts.filter((s) => s.shift_type === 'office');
  const smartShifts = dayShifts.filter((s) => s.shift_type === 'smartwork');
  const otherShifts = dayShifts.filter(
    (s) => s.shift_type !== 'office' && s.shift_type !== 'smartwork',
  );

  const assignedUserIds = new Set(dayShifts.map((s) => s.user_id));
  const unassignedUsers = users.filter((u) => u.is_active && !assignedUserIds.has(u.id));

  const officeCount = officeShifts.length;
  const capacityPct = Math.min(100, Math.round((officeCount / maxCapacity) * 100));
  const atCapacity = officeCount >= maxCapacity;

  const getUserForShift = (shift: ShiftWithUser): User | undefined => {
    return shift.user ?? users.find((u) => u.id === shift.user_id);
  };

  const shiftTypeLabel: Record<string, string> = {
    sick: 'Malato',
    vacation: 'Ferie',
    permission: 'Permesso',
  };

  async function handleChange(userId: string, newType: 'office' | 'smartwork') {
    setLoadingUsers((prev) => new Set(prev).add(userId));
    try {
      await onShiftChange(userId, date!, newType);
    } finally {
      setLoadingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  const Spinner = () => (
    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );

  const LockIcon = () => (
    <svg
      className="w-3.5 h-3.5 text-gray-400 flex-shrink-0"
      fill="currentColor"
      viewBox="0 0 20 20"
    >
      <path
        fillRule="evenodd"
        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
        clipRule="evenodd"
      />
    </svg>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 w-96 h-screen z-50 bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div>
            <h2 className="text-base font-semibold text-gray-900 capitalize">
              {formatItalianDate(date)}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
            aria-label="Chiudi"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Capacity bar */}
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm font-medium text-gray-700">Ufficio</span>
            <span className={`text-sm font-semibold ${atCapacity ? 'text-red-600' : 'text-gray-900'}`}>
              {officeCount} / {maxCapacity}
            </span>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${
                capacityPct >= 100 ? 'bg-red-500' : capacityPct >= 80 ? 'bg-yellow-400' : 'bg-blue-500'
              }`}
              style={{ width: `${capacityPct}%` }}
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* In Ufficio */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              In Ufficio ({officeCount})
            </h3>
            {officeShifts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nessuno in ufficio</p>
            ) : (
              <ul className="space-y-1.5">
                {officeShifts.map((shift) => {
                  const user = getUserForShift(shift);
                  const isLoading = loadingUsers.has(shift.user_id);
                  return (
                    <li
                      key={shift.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <span className="flex-1 text-sm text-gray-800 truncate">
                        {user?.full_name ?? shift.user_id}
                      </span>
                      {shift.locked && <LockIcon />}
                      <button
                        onClick={() => handleChange(shift.user_id, 'smartwork')}
                        disabled={shift.locked || isLoading}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        {isLoading ? <Spinner /> : '→ Smart'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Smartwork */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Smartwork ({smartShifts.length})
            </h3>
            {smartShifts.length === 0 ? (
              <p className="text-sm text-gray-400 italic">Nessuno in smartwork</p>
            ) : (
              <ul className="space-y-1.5">
                {smartShifts.map((shift) => {
                  const user = getUserForShift(shift);
                  const isLoading = loadingUsers.has(shift.user_id);
                  const officeDisabled = shift.locked || isLoading || atCapacity;
                  return (
                    <li
                      key={shift.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <span className="flex-1 text-sm text-gray-800 truncate">
                        {user?.full_name ?? shift.user_id}
                      </span>
                      {shift.locked && <LockIcon />}
                      <button
                        onClick={() => handleChange(shift.user_id, 'office')}
                        disabled={officeDisabled}
                        title={atCapacity && !shift.locked ? 'Capacità massima raggiunta' : undefined}
                        className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex-shrink-0"
                      >
                        {isLoading ? <Spinner /> : '→ Ufficio'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Altro */}
          {otherShifts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Altro ({otherShifts.length})
              </h3>
              <ul className="space-y-1.5">
                {otherShifts.map((shift) => {
                  const user = getUserForShift(shift);
                  return (
                    <li
                      key={shift.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <span className="flex-1 text-sm text-gray-800 truncate">
                        {user?.full_name ?? shift.user_id}
                      </span>
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                        {shiftTypeLabel[shift.shift_type] ?? shift.shift_type}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Non assegnati */}
          {unassignedUsers.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Non assegnati ({unassignedUsers.length})
              </h3>
              <ul className="space-y-1.5">
                {unassignedUsers.map((user) => {
                  const isLoading = loadingUsers.has(user.id);
                  return (
                    <li
                      key={user.id}
                      className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {getInitials(user.full_name)}
                      </div>
                      <span className="flex-1 text-sm text-gray-600 truncate">
                        {user.full_name}
                      </span>
                      <div className="flex gap-1 flex-shrink-0">
                        <button
                          onClick={() => handleChange(user.id, 'office')}
                          disabled={isLoading || atCapacity}
                          title={atCapacity ? 'Capacità massima raggiunta' : undefined}
                          className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isLoading ? <Spinner /> : 'Ufficio'}
                        </button>
                        <button
                          onClick={() => handleChange(user.id, 'smartwork')}
                          disabled={isLoading}
                          className="px-2 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                          {isLoading ? <Spinner /> : 'Smart'}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
