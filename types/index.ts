// User types
export type UserRole = 'admin' | 'user';

export type ShiftType = 'office' | 'smartwork' | 'sick' | 'vacation' | 'permission';

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  seniority_date: string;
  team_id: string | null; // legacy single-team field, kept for DB compat
  team_ids: string[];     // populated from user_teams join table
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  weekly_meeting_day: string | null; // 'monday', 'tuesday', etc.
  color: string; // hex color, e.g. '#6366f1'
  created_at: string;
  updated_at: string;
}

export interface Shift {
  id: string;
  user_id: string;
  shift_date: string; // YYYY-MM-DD
  shift_type: ShiftType;
  locked: boolean;
  locked_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ShiftWithUser extends Shift {
  user?: User;
}

export interface OnCallAssignment {
  id: string;
  user_id: string;
  week_start_date: string;
  week_end_date: string;
  created_at: string;
  updated_at: string;
}

export interface ShiftSwapRequest {
  id: string;
  requester_id: string;
  responder_id: string;
  requester_shift_id: string;
  responder_shift_id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'escalated';
  created_at: string;
  updated_at: string;
}

export type PreferenceType = 'indifferent' | 'home' | 'office';

export interface ShiftPreference {
  id: string;
  user_id: string;
  preference_date: string; // YYYY-MM-DD
  preference: PreferenceType;
  month_year: string; // YYYY-MM
  created_at: string;
  updated_at: string;
}

export interface GoogleCalendarSync {
  id: string;
  user_id: string;
  google_calendar_id: string | null;
  google_access_token: string | null;
  google_refresh_token: string | null;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Settings {
  id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  description: string | null;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

// Calendar view types
export interface DayShifts {
  date: string;
  shifts: ShiftWithUser[];
  officeCount: number;
  maxCapacity: number;
}

export interface MonthCalendar {
  year: number;
  month: number;
  days: DayShifts[];
}

export interface ShiftStats {
  totalUsers: number;
  officeToday: number;
  smartworkToday: number;
  sickToday: number;
  vacationToday: number;
  permissionToday: number;
  onCallToday: string | null;
}
