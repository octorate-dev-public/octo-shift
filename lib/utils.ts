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
