import { withHandler, jsonOk, parseBody, requireParam, noContent } from '@/lib/api-handler';
import { shiftsAPI } from '@/lib/api/shifts';

/**
 * GET /api/shifts?date=YYYY-MM-DD          → shifts for that day
 * GET /api/shifts?year=2026&month=4        → all month shifts
 * GET /api/shifts?userId=...&start=...&end=...  → user range
 * GET /api/shifts?statsDate=YYYY-MM-DD     → stats for a day
 */
export const GET = withHandler('api/shifts', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;

  if (p.has('statsDate')) {
    const stats = await shiftsAPI.getShiftStatsForDate(p.get('statsDate')!);
    return jsonOk(stats);
  }

  if (p.has('date')) {
    const shifts = await shiftsAPI.getShiftsForDate(p.get('date')!);
    return jsonOk(shifts);
  }

  if (p.has('year') && p.has('month')) {
    const shifts = await shiftsAPI.getMonthShifts(
      parseInt(p.get('year')!),
      parseInt(p.get('month')!),
    );
    return jsonOk(shifts);
  }

  if (p.has('userId') && p.has('start') && p.has('end')) {
    const shifts = await shiftsAPI.getUserShifts(
      p.get('userId')!,
      p.get('start')!,
      p.get('end')!,
    );
    return jsonOk(shifts);
  }

  return jsonOk({ error: 'Parametri mancanti: usa date, year+month, o userId+start+end' }, 400);
});

/**
 * POST /api/shifts  { userId, shiftDate, shiftType }
 * POST /api/shifts  { bulk: [{ user_id, shift_date, shift_type }, ...] }
 */
export const POST = withHandler('api/shifts', 'POST', async (req) => {
  const body = await parseBody(req);

  if (body.bulk && Array.isArray(body.bulk)) {
    const shifts = await shiftsAPI.bulkUpsertShifts(body.bulk);
    return jsonOk(shifts, 201);
  }

  const { userId, shiftDate, shiftType } = body;
  const shift = await shiftsAPI.upsertShift(userId, shiftDate, shiftType);
  return jsonOk(shift, 201);
});

/**
 * PATCH /api/shifts  { userId, shiftDate, action: 'lock' | 'unlock', lockedBy? }
 */
export const PATCH = withHandler('api/shifts', 'PATCH', async (req) => {
  const body = await parseBody(req);
  const { userId, shiftDate, action, lockedBy } = body;

  if (action === 'lock') {
    const shift = await shiftsAPI.lockShift(userId, shiftDate, lockedBy);
    return jsonOk(shift);
  }

  if (action === 'unlock') {
    const shift = await shiftsAPI.unlockShift(userId, shiftDate);
    return jsonOk(shift);
  }

  return jsonOk({ error: 'Azione non riconosciuta: usa lock o unlock' }, 400);
});

/**
 * DELETE /api/shifts?userId=...&shiftDate=...
 */
export const DELETE = withHandler('api/shifts', 'DELETE', async (req) => {
  const userId = requireParam(req, 'userId');
  const shiftDate = requireParam(req, 'shiftDate');
  await shiftsAPI.deleteShift(userId, shiftDate);
  return noContent();
});
