import { withHandler, jsonOk, parseBody, noContent } from '@/lib/api-handler';
import { onCallAPI } from '@/lib/api/on-call';

/**
 * GET /api/on-call?date=YYYY-MM-DD         → on-call for that date's week
 * GET /api/on-call?week=YYYY-MM-DD         → on-call for specific week start
 * GET /api/on-call?year=2026&month=4       → all month on-call
 * GET /api/on-call?users=true              → all users in rotation
 */
export const GET = withHandler('api/on-call', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;

  if (p.has('date')) {
    const data = await onCallAPI.getOnCallForDate(p.get('date')!);
    return jsonOk(data);
  }

  if (p.has('week')) {
    const data = await onCallAPI.getWeekOnCall(p.get('week')!);
    return jsonOk(data);
  }

  if (p.has('year') && p.has('month')) {
    const data = await onCallAPI.getMonthOnCall(
      parseInt(p.get('year')!),
      parseInt(p.get('month')!),
    );
    return jsonOk(data);
  }

  if (p.get('users') === 'true') {
    const data = await onCallAPI.getOnCallUsers();
    return jsonOk(data);
  }

  return jsonOk({ error: 'Parametri mancanti' }, 400);
});

/**
 * POST /api/on-call  { userId, weekStartDate }
 * POST /api/on-call  { generate: true, year, month, userIds: string[] }
 */
export const POST = withHandler('api/on-call', 'POST', async (req) => {
  const body = await parseBody(req);

  if (body.generate) {
    const data = await onCallAPI.generateMonthOnCall(body.year, body.month, body.userIds);
    return jsonOk(data, 201);
  }

  const data = await onCallAPI.createOnCallAssignment(body.userId, body.weekStartDate);
  return jsonOk(data, 201);
});

/**
 * PATCH /api/on-call  { id, userId }
 */
export const PATCH = withHandler('api/on-call', 'PATCH', async (req) => {
  const { id, userId } = await parseBody(req);
  const data = await onCallAPI.updateOnCallAssignment(id, userId);
  return jsonOk(data);
});

/**
 * DELETE /api/on-call?id=...
 */
export const DELETE = withHandler('api/on-call', 'DELETE', async (req) => {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return jsonOk({ error: 'Parametro id mancante' }, 400);
  await onCallAPI.deleteOnCallAssignment(id);
  return noContent();
});
