import { supabase } from '../supabase';
import { OnCallAssignment } from '@/types';
import { formatDate, getWeekStart, getWeekEnd } from '../utils';

export const onCallAPI = {
  // Get on-call assignments for a week
  async getWeekOnCall(weekStartDate: string): Promise<OnCallAssignment[]> {
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const { data, error } = await supabase
      .from('on_call_assignments')
      .select('*')
      .eq('week_start_date', weekStartDate);

    if (error) throw error;
    return data || [];
  },

  // Get on-call for today
  async getOnCallForDate(date: string) {
    const startDate = formatDate(getWeekStart(new Date(date)));

    const { data, error } = await supabase
      .from('on_call_assignments')
      .select(`
        *,
        users:user_id(id, full_name, email)
      `)
      .eq('week_start_date', startDate);

    if (error) throw error;
    return (data || []).map((item: any) => ({
      ...item,
      user: item.users,
    }));
  },

  // Get on-call assignments for a month
  async getMonthOnCall(year: number, month: number): Promise<OnCallAssignment[]> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const { data, error } = await supabase
      .from('on_call_assignments')
      .select('*')
      .gte('week_start_date', formatDate(startDate))
      .lte('week_end_date', formatDate(endDate));

    if (error) throw error;
    return data || [];
  },

  // Create on-call assignment
  async createOnCallAssignment(
    userId: string,
    weekStartDate: string
  ): Promise<OnCallAssignment> {
    const startDate = new Date(weekStartDate);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const { data, error } = await supabase
      .from('on_call_assignments')
      .insert({
        user_id: userId,
        week_start_date: weekStartDate,
        week_end_date: formatDate(endDate),
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Update on-call assignment
  async updateOnCallAssignment(
    assignmentId: string,
    userId: string
  ): Promise<OnCallAssignment> {
    const { data, error } = await supabase
      .from('on_call_assignments')
      .update({ user_id: userId })
      .eq('id', assignmentId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Delete on-call assignment
  async deleteOnCallAssignment(assignmentId: string): Promise<void> {
    const { error } = await supabase
      .from('on_call_assignments')
      .delete()
      .eq('id', assignmentId);

    if (error) throw error;
  },

  // Generate on-call rotation for a month
  async generateMonthOnCall(
    year: number,
    month: number,
    userIds: string[]
  ): Promise<OnCallAssignment[]> {
    const assignments: OnCallAssignment[] = [];
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    let currentDate = getWeekStart(startDate);
    let userIndex = 0;

    while (currentDate <= endDate) {
      const userId = userIds[userIndex % userIds.length];
      const weekEnd = new Date(currentDate);
      weekEnd.setDate(weekEnd.getDate() + 6);

      const assignment = await this.createOnCallAssignment(
        userId,
        formatDate(currentDate)
      );
      assignments.push(assignment);

      userIndex++;
      currentDate.setDate(currentDate.getDate() + 7);
    }

    return assignments;
  },

  // Get all users in on-call rotation
  async getOnCallUsers(): Promise<any[]> {
    const { data, error } = await supabase
      .from('on_call_assignments')
      .select('users:user_id(id, full_name, email)')
      .select('DISTINCT(user_id)');

    if (error) throw error;
    return data || [];
  },
};
