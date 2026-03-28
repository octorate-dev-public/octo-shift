import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { swapRequestsAPI } from '@/lib/api/swap-requests';

/**
 * GET /api/swap-requests?userId=...   → user's swap requests with full details
 * GET /api/swap-requests?pending=true → all pending requests (admin)
 */
export const GET = withHandler('api/swap-requests', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;

  if (p.has('userId')) {
    const userId = p.get('userId')!;
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase
      .from('shift_swap_requests')
      .select(
        `*, requester:requester_id(id,full_name,email), responder:responder_id(id,full_name,email), requester_shift:requester_shift_id(shift_date,shift_type), responder_shift:responder_shift_id(shift_date,shift_type)`,
      )
      .or(`requester_id.eq.${userId},responder_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    return jsonOk(data ?? []);
  }

  if (p.get('pending') === 'true') {
    const data = await swapRequestsAPI.getPendingRequests();
    return jsonOk(data);
  }

  return jsonOk({ error: 'Parametri mancanti: usa userId o pending=true' }, 400);
});

/**
 * POST /api/swap-requests  { requesterId, responderId, requesterShiftId, responderShiftId }
 */
export const POST = withHandler('api/swap-requests', 'POST', async (req) => {
  const { requesterId, responderId, requesterShiftId, responderShiftId } = await parseBody(req);
  const data = await swapRequestsAPI.createSwapRequest(
    requesterId,
    responderId,
    requesterShiftId,
    responderShiftId,
  );
  return jsonOk(data, 201);
});

/**
 * PATCH /api/swap-requests  { id, action: 'accept' | 'reject' | 'cancel' }
 */
export const PATCH = withHandler('api/swap-requests', 'PATCH', async (req) => {
  const { id, action } = await parseBody(req);

  if (action === 'accept') {
    const data = await swapRequestsAPI.acceptSwapRequest(id);
    return jsonOk(data);
  }

  if (action === 'reject') {
    const data = await swapRequestsAPI.rejectSwapRequest(id);
    return jsonOk(data);
  }

  if (action === 'cancel') {
    const data = await swapRequestsAPI.cancelSwapRequest(id);
    return jsonOk(data);
  }

  return jsonOk({ error: 'Azione non riconosciuta: usa accept, reject o cancel' }, 400);
});
