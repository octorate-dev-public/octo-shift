import { supabase } from '../supabase';
import { ShiftSwapRequest } from '@/types';

export const swapRequestsAPI = {
  // Get all pending swap requests
  async getPendingRequests(userId?: string): Promise<ShiftSwapRequest[]> {
    let query = supabase
      .from('shift_swap_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`requester_id.eq.${userId},responder_id.eq.${userId}`);
    }

    const { data, error } = await query;

    if (error) throw error;
    return data || [];
  },

  // Get swap requests for a user
  async getUserSwapRequests(userId: string): Promise<ShiftSwapRequest[]> {
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .select('*')
      .or(`requester_id.eq.${userId},responder_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  // Create a swap request
  async createSwapRequest(
    requesterId: string,
    responderId: string,
    requesterShiftId: string,
    responderShiftId: string
  ): Promise<ShiftSwapRequest> {
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .insert({
        requester_id: requesterId,
        responder_id: responderId,
        requester_shift_id: requesterShiftId,
        responder_shift_id: responderShiftId,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Accept a swap request
  async acceptSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    // Get the request details
    const { data: request, error: fetchError } = await supabase
      .from('shift_swap_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (fetchError) throw fetchError;

    // Get the shifts
    const { data: requesterShift, error: shift1Error } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', request.requester_shift_id)
      .single();

    const { data: responderShift, error: shift2Error } = await supabase
      .from('shifts')
      .select('*')
      .eq('id', request.responder_shift_id)
      .single();

    if (shift1Error || shift2Error) throw shift1Error || shift2Error;

    // Swap the shifts
    await supabase
      .from('shifts')
      .update({ user_id: responderShift.user_id })
      .eq('id', requesterShift.id);

    await supabase
      .from('shifts')
      .update({ user_id: requesterShift.user_id })
      .eq('id', responderShift.id);

    // Update request status
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'accepted' })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Reject a swap request
  async rejectSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'rejected' })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Cancel a swap request
  async cancelSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .update({ status: 'cancelled' })
      .eq('id', requestId)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  // Get swap request with user details
  async getSwapRequestWithDetails(requestId: string) {
    const { data, error } = await supabase
      .from('shift_swap_requests')
      .select(`
        *,
        requester:requester_id(id, full_name, email),
        responder:responder_id(id, full_name, email),
        requester_shift:requester_shift_id(shift_date, shift_type),
        responder_shift:responder_shift_id(shift_date, shift_type)
      `)
      .eq('id', requestId)
      .single();

    if (error) throw error;
    return data;
  },
};
