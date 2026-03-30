import { supabase } from '../supabase';
import { ShiftSwapRequest } from '@/types';
import { createLogger, toAppError } from '../logger';

const log = createLogger('swapRequestsAPI');

export const swapRequestsAPI = {
  async getPendingRequests(userId?: string): Promise<ShiftSwapRequest[]> {
    return log.withTiming('getPendingRequests', { userId: userId ?? 'all' }, async () => {
      let query = supabase
        .from('shift_swap_requests')
        .select('*')
        .in('status', ['pending', 'escalated'])
        .order('created_at', { ascending: false });

      if (userId) {
        query = query.or(`requester_id.eq.${userId},responder_id.eq.${userId}`);
      }

      const { data, error } = await query;
      if (error) throw toAppError(error, 'Impossibile caricare le richieste di scambio');
      return data || [];
    });
  },

  async getUserSwapRequests(userId: string): Promise<ShiftSwapRequest[]> {
    return log.withTiming('getUserSwapRequests', { userId }, async () => {
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .select('*')
        .or(`requester_id.eq.${userId},responder_id.eq.${userId}`)
        .order('created_at', { ascending: false });

      if (error) throw toAppError(error, 'Impossibile caricare le richieste di scambio dell\'utente');
      return data || [];
    });
  },

  async createSwapRequest(
    requesterId: string,
    responderId: string,
    requesterShiftId: string,
    responderShiftId: string,
  ): Promise<ShiftSwapRequest> {
    return log.withTiming('createSwapRequest', { requesterId, responderId }, async () => {
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

      if (error) throw toAppError(error, 'Impossibile creare la richiesta di scambio');
      log.info('createSwapRequest', 'Richiesta di scambio creata', { id: data.id });
      return data;
    });
  },

  async acceptSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    return log.withTiming('acceptSwapRequest', { requestId }, async () => {
      // 1. Fetch request
      const { data: request, error: fetchError } = await supabase
        .from('shift_swap_requests')
        .select('*')
        .eq('id', requestId)
        .single();

      if (fetchError) throw toAppError(fetchError, 'Richiesta di scambio non trovata');

      // 2. Fetch both shifts
      const [{ data: requesterShift, error: e1 }, { data: responderShift, error: e2 }] =
        await Promise.all([
          supabase.from('shifts').select('*').eq('id', request.requester_shift_id).single(),
          supabase.from('shifts').select('*').eq('id', request.responder_shift_id).single(),
        ]);

      if (e1 || e2) {
        const err = e1 || e2;
        throw toAppError(err, 'Turno associato alla richiesta non trovato');
      }

      // 3. Check neither shift is locked
      if (requesterShift.locked || responderShift.locked) {
        log.warn('acceptSwapRequest', 'Tentativo di swap su turno bloccato', {
          requestId,
          requesterLocked: requesterShift.locked,
          responderLocked: responderShift.locked,
        });
        throw toAppError(
          new Error('Uno dei turni è bloccato'),
          'Impossibile scambiare turni bloccati',
        );
      }

      // 4. Perform the swap
      const [{ error: swap1 }, { error: swap2 }] = await Promise.all([
        supabase.from('shifts').update({ user_id: responderShift.user_id }).eq('id', requesterShift.id),
        supabase.from('shifts').update({ user_id: requesterShift.user_id }).eq('id', responderShift.id),
      ]);

      if (swap1 || swap2) {
        log.error('acceptSwapRequest', 'Errore durante lo swap effettivo', new Error((swap1 || swap2)!.message));
        throw toAppError(swap1 || swap2, 'Errore durante lo scambio dei turni');
      }

      // 5. Mark accepted
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .update({ status: 'accepted' })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile aggiornare lo stato della richiesta');
      log.info('acceptSwapRequest', 'Scambio completato con successo', { requestId });
      return data;
    });
  },

  /**
   * Quando il responder rifiuta, la richiesta viene escalata all'admin
   * (status → 'escalated') anziché chiusa definitivamente.
   */
  async rejectSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    return log.withTiming('rejectSwapRequest', { requestId }, async () => {
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .update({ status: 'escalated' })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile escalare la richiesta');
      log.info('rejectSwapRequest', 'Richiesta escalata all\'admin', { requestId });
      return data;
    });
  },

  /**
   * Admin rifiuta definitivamente una richiesta escalata.
   */
  async adminRejectSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    return log.withTiming('adminRejectSwapRequest', { requestId }, async () => {
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .update({ status: 'rejected' })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile rifiutare la richiesta');
      log.info('adminRejectSwapRequest', 'Richiesta rifiutata dall\'admin', { requestId });
      return data;
    });
  },

  async cancelSwapRequest(requestId: string): Promise<ShiftSwapRequest> {
    return log.withTiming('cancelSwapRequest', { requestId }, async () => {
      const { data, error } = await supabase
        .from('shift_swap_requests')
        .update({ status: 'cancelled' })
        .eq('id', requestId)
        .select()
        .single();

      if (error) throw toAppError(error, 'Impossibile annullare la richiesta');
      log.info('cancelSwapRequest', 'Richiesta annullata', { requestId });
      return data;
    });
  },

  async getSwapRequestWithDetails(requestId: string) {
    return log.withTiming('getSwapRequestWithDetails', { requestId }, async () => {
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

      if (error) throw toAppError(error, 'Impossibile caricare i dettagli della richiesta');
      return data;
    });
  },
};
