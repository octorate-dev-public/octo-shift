import { type ClassValue, clsx } from 'clsx';

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Date utilities
export const getMonthDays = (year: number, month: number) => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  const days = [];
  for (let i = 1; i <= daysInMonth; i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};

export const formatDate = (date: Date | string): string => {
  if (typeof date === 'string') {
    return date;
  }
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const parseDateString = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export const getDayName = (date: Date | string): string => {
  const d = typeof date === 'string' ? parseDateString(date) : date;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return days[d.getDay()];
};

export const getWeekNumber = (date: Date): number => {
  const firstDay = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDay.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDay.getDay() + 1) / 7);
};

export const getWeekStart = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
};

export const getWeekEnd = (date: Date): Date => {
  const start = getWeekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return end;
};

// Text utilities
export const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

export const getSeniorityDays = (seniorityDate: string): number => {
  const start = new Date(seniorityDate);
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
};

// Absence helpers ──────────────────────────────────────────────
// The codebase has two historical representations for an absence:
//   1) new model: shift_type = 'office'|'smartwork' with a leave_type overlay
//      ('sick' | 'vacation' | 'permission')
//   2) legacy model: shift_type itself is 'vacation' | 'permission'
// Both must be treated as "absent" for office/smartwork totals and capacity.
export const isAbsenceShiftType = (shiftType: string | null | undefined): boolean =>
  shiftType === 'vacation' || shiftType === 'permission' || shiftType === 'sick';

export const isAbsenceShift = (shift: {
  shift_type?: string | null;
  leave_type?: string | null;
}): boolean => !!shift.leave_type || isAbsenceShiftType(shift.shift_type);

export const isOfficePresence = (shift: {
  shift_type?: string | null;
  leave_type?: string | null;
}): boolean => shift.shift_type === 'office' && !isAbsenceShift(shift);

export const isSmartPresence = (shift: {
  shift_type?: string | null;
  leave_type?: string | null;
}): boolean => shift.shift_type === 'smartwork' && !isAbsenceShift(shift);

// Shift utilities (work location)
export const getShiftColor = (shiftType: string): string => {
  const colors: Record<string, string> = {
    office: 'bg-blue-100 text-blue-800',
    smartwork: 'bg-green-100 text-green-800',
  };
  return colors[shiftType] || 'bg-gray-100 text-gray-800';
};

export const getShiftLabel = (shiftType: string): string => {
  const labels: Record<string, string> = {
    office: 'Ufficio',
    smartwork: 'Smart',
  };
  return labels[shiftType] || shiftType;
};

// Leave utilities (overlay on top of shift)
export const getLeaveColor = (leaveType: string): string => {
  const colors: Record<string, string> = {
    sick: 'bg-red-100 text-red-800',
    vacation: 'bg-yellow-100 text-yellow-800',
    permission: 'bg-purple-100 text-purple-800',
  };
  return colors[leaveType] || 'bg-gray-100 text-gray-800';
};

export const getLeaveLabel = (leaveType: string): string => {
  const labels: Record<string, string> = {
    sick: 'Malattia',
    vacation: 'Ferie',
    permission: 'Permesso',
  };
  return labels[leaveType] || leaveType;
};

export const getLeaveIcon = (leaveType: string): string => {
  const icons: Record<string, string> = {
    sick: '🤒',
    vacation: '✈️',
    permission: '📋',
  };
  return icons[leaveType] || '?';
};

// Permission hours ─────────────────────────────────────────────
/**
 * Calcola le ore nette di permesso escludendo la pausa pranzo 13:00–14:00.
 * @param startTime "HH:MM"
 * @param endTime   "HH:MM"
 * @returns ore (numero decimale, es. 3.5)
 */
export function computePermissionHours(startTime: string, endTime: string): number {
  const toMin = (t: string) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const start = toMin(startTime);
  const end = toMin(endTime);
  if (end <= start) return 0;
  const lunchStart = 13 * 60; // 780 min
  const lunchEnd = 14 * 60;   // 840 min
  const overlap = Math.max(0, Math.min(end, lunchEnd) - Math.max(start, lunchStart));
  const netMinutes = end - start - overlap;
  return Math.round(netMinutes) / 60;
}

/**
 * Formatta la nota del permesso: "dalle 09:00 alle 12:00 (3h)" o "... (2h 30min)".
 */
export function formatPermissionNote(startTime: string, endTime: string): string {
  const hours = computePermissionHours(startTime, endTime);
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const durationStr = m > 0 ? `${h}h ${m}min` : `${h}h`;
  return `dalle ${startTime} alle ${endTime} (${durationStr})`;
}

/**
 * Raggruppa i turni ferie di un utente in blocchi di giorni consecutivi.
 * Due date sono nello stesso blocco se la differenza è ≤ 3 giorni
 * (per coprire il weekend Ven-Lun).
 */
export function groupVacationBlocks<T extends { shift_date: string; leave_type: string | null }>(
  shifts: T[],
): T[][] {
  const vacations = [...shifts]
    .filter((s) => s.leave_type === 'vacation')
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  if (vacations.length === 0) return [];

  const blocks: T[][] = [];
  let current: T[] = [vacations[0]];

  for (let i = 1; i < vacations.length; i++) {
    const last = current[current.length - 1];
    const [ly, lm, ld] = last.shift_date.split('-').map(Number);
    const [ty, tm, td] = vacations[i].shift_date.split('-').map(Number);
    const lastMs = new Date(ly, lm - 1, ld).getTime();
    const thisMs = new Date(ty, tm - 1, td).getTime();
    const diffDays = Math.round((thisMs - lastMs) / 86_400_000);

    if (diffDays <= 3) {
      current.push(vacations[i]);
    } else {
      blocks.push(current);
      current = [vacations[i]];
    }
  }
  blocks.push(current);
  return blocks;
}
