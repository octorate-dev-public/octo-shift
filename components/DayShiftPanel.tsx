'use client';

import React, { useState } from 'react';
import { ShiftWithUser, User, LeaveType } from '@/types';
import {
  getInitials,
  parseDateString,
  getLeaveLabel,
  getLeaveIcon,
  isAbsenceShift,
  isOfficePresence,
  isSmartPresence,
} from '@/lib/utils';

interface DayShiftPanelProps {
  date: string | null;
  shifts: ShiftWithUser[];
  users: User[];
  maxCapacity: number;
  isHoliday?: boolean;
  onClose: () => void;
  onShiftChange: (userId: string, date: string, newType: 'office' | 'smartwork') => Promise<void>;
  onLeaveChange?: (userId: string, date: string, leaveType: LeaveType | null) => Promise<void>;
  onToggleHoliday?: (date: string) => Promise<void>;
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

const LEAVE_OPTIONS: Array<{ value: LeaveType; label: string; icon: string }> = [
  { value: 'sick', label: 'Malattia', icon: '🤒' },
  { value: 'vacation', label: 'Ferie', icon: '✈️' },
  { value: 'permission', label: 'Permesso', icon: '📋' },
];

export default function DayShiftPanel({
  date,
  shifts,
  users,
  maxCapacity,
  isHoliday = false,
  onClose,
  onShiftChange,
  onLeaveChange,
  onToggleHoliday,
}: DayShiftPanelProps) {
  const [loadingUsers, setLoadingUsers] = useState<Set<string>>(new Set());
  const [holidayLoading, setHolidayLoading] = useState(false);

  if (!date) return null;

  const dayShifts = shifts.filter((s) => s.shift_date === date);

  // Absences (ferie / permessi / malattia) are NOT counted toward office or
  // smartwork totals, regardless of whether they are modeled as a leave_type
  // overlay or as a legacy shift_type of 'vacation' | 'permission' | 'sick'.
  const onLeaveShifts = dayShifts.filter(isAbsenceShift);
  const officeShifts = dayShifts.filter(isOfficePresence);
  const smartShifts = dayShifts.filter(isSmartPresence);

  const assignedUserIds = new Set(dayShifts.map((s) => s.user_id));
  const unassignedUsers = users.filter((u) => u.is_active && !assignedUserIds.has(u.id));

  const officeCount = officeShifts.length;
  const capacityPct = Math.min(100, Math.round((officeCount / maxCapacity) * 100));
  const atCapacity = officeCount >= maxCapacity;

  const getUserForShift = (shift: ShiftWithUser): User | undefined => {
    return shift.user ?? users.find((u) => u.id === shift.user_id);
  };

  async function handleLeaveChange(userId: string, leaveType: LeaveType | null) {
    if (!onLeaveChange || !date) return;
    setLoadingUsers((prev) => new Set(prev).add(userId));
    try {
      await onLeaveChange(userId, date, leaveType);
    } finally {
      setLoadingUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    }
  }

  async function handleHolidayToggle() {
    if (!onToggleHoliday || !date) return;
    setHolidayLoading(true);
    try {
      await onToggleHoliday(date);
    } finally {
      setHolidayLoading(false);
    }
  }

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

  const LeaveBadge = ({ shift }: { shift: ShiftWithUser }) => {
    if (!shift.leave_type) return null;
    return (
      <span
        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium"
        style={{
          backgroundColor: shift.leave_type === 'sick' ? '#fee2e2' : shift.leave_type === 'vacation' ? '#fef9c3' : '#f3e8ff',
          color: shift.leave_type === 'sick' ? '#991b1b' : shift.leave_type === 'vacation' ? '#713f12' : '#6b21a8',
        }}
      >
        {getLeaveIcon(shift.leave_type)} {getLeaveLabel(shift.leave_type)}
      </span>
    );
  };

  const LeaveDropdown = ({ shift }: { shift: ShiftWithUser }) => {
    if (!onLeaveChange) return null;
    const isLoading = loadingUsers.has(shift.user_id);
    return (
      <div className="flex items-center gap-1 flex-shrink-0">
        {shift.leave_type ? (
          <button
            onClick={() => handleLeaveChange(shift.user_id, null)}
            disabled={isLoading}
            className="px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-gray-50 border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors"
            title="Rimuovi assenza"
          >
            {isLoading ? <Spinner /> : '✕'}
          </button>
        ) : (
          LEAVE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => handleLeaveChange(shift.user_id, opt.value)}
              disabled={isLoading}
              className="px-1 py-0.5 text-[10px] rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              title={opt.label}
            >
              {opt.icon}
            </button>
          ))
        )}
      </div>
    );
  };

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
        <div className="px-5 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900 capitalize">
              {formatItalianDate(date)}
            </h2>
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

          {/* Holiday banner + toggle */}
          {isHoliday && (
            <div className="mt-2 flex items-center gap-2 px-2.5 py-1.5 bg-amber-50 border border-amber-200 rounded-lg">
              <span className="text-amber-700 text-xs font-medium flex-1">Giorno non lavorativo</span>
            </div>
          )}
          {onToggleHoliday && (
            <button
              onClick={handleHolidayToggle}
              disabled={holidayLoading}
              className={`mt-2 w-full text-xs font-medium py-1.5 px-3 rounded-lg border transition-colors disabled:opacity-50 ${
                isHoliday
                  ? 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                  : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
              }`}
            >
              {holidayLoading
                ? 'Aggiornamento...'
                : isHoliday
                ? 'Rimuovi festività'
                : 'Segna come giorno non lavorativo'}
            </button>
          )}
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
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 truncate block">
                          {user?.full_name ?? shift.user_id}
                        </span>
                        {shift.leave_type && <LeaveBadge shift={shift} />}
                      </div>
                      {shift.locked && <LockIcon />}
                      <LeaveDropdown shift={shift} />
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
                      className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 truncate block">
                          {user?.full_name ?? shift.user_id}
                        </span>
                        {shift.leave_type && <LeaveBadge shift={shift} />}
                      </div>
                      {shift.locked && <LockIcon />}
                      <LeaveDropdown shift={shift} />
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

          {/* In Assenza */}
          {onLeaveShifts.length > 0 && (
            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                In Assenza ({onLeaveShifts.length})
              </h3>
              <ul className="space-y-1.5">
                {onLeaveShifts.map((shift) => {
                  const user = getUserForShift(shift);
                  const isLoading = loadingUsers.has(shift.user_id);
                  // Tipo "sotto" l'assenza: per record nuovi è in shift_type
                  // (office/smartwork). Per record legacy con shift_type =
                  // 'vacation'/'permission'/'sick' non c'è — fallback a 'office'.
                  const underlying: 'office' | 'smartwork' =
                    shift.shift_type === 'smartwork' ? 'smartwork' : 'office';
                  return (
                    <li
                      key={`leave-${shift.id}`}
                      className="flex items-center gap-2 p-2 rounded-lg bg-gray-50"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                        {user ? getInitials(user.full_name) : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-800 truncate block">
                          {user?.full_name ?? shift.user_id}
                        </span>
                        <LeaveBadge shift={shift} />
                      </div>
                      {/* Toggle del turno sottostante (anche in assenza) */}
                      <div
                        className="inline-flex rounded-md border border-gray-300 overflow-hidden text-[10px] flex-shrink-0"
                        title="Turno previsto se l'assenza venisse rimossa"
                      >
                        <button
                          onClick={() => handleChange(shift.user_id, 'office')}
                          disabled={isLoading || underlying === 'office'}
                          className={`px-2 py-1 font-medium transition-colors ${
                            underlying === 'office'
                              ? 'bg-blue-100 text-blue-800 cursor-default'
                              : 'bg-white text-gray-600 hover:bg-blue-50'
                          } disabled:cursor-default`}
                        >
                          {isLoading && underlying !== 'office' ? <Spinner /> : 'Ufficio'}
                        </button>
                        <button
                          onClick={() => handleChange(shift.user_id, 'smartwork')}
                          disabled={isLoading || underlying === 'smartwork'}
                          className={`px-2 py-1 font-medium border-l border-gray-300 transition-colors ${
                            underlying === 'smartwork'
                              ? 'bg-green-100 text-green-800 cursor-default'
                              : 'bg-white text-gray-600 hover:bg-green-50'
                          } disabled:cursor-default`}
                        >
                          {isLoading && underlying !== 'smartwork' ? <Spinner /> : 'Smart'}
                        </button>
                      </div>
                      {/* Rimuovi assenza */}
                      {onLeaveChange && (
                        <button
                          onClick={() => handleLeaveChange(shift.user_id, null)}
                          disabled={isLoading}
                          className="px-1.5 py-0.5 text-[10px] font-medium text-gray-500 bg-white border border-gray-200 rounded hover:bg-gray-100 disabled:opacity-40 transition-colors flex-shrink-0"
                          title="Rimuovi assenza"
                        >
                          ✕
                        </button>
                      )}
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
