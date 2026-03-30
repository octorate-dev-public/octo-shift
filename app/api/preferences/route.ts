import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { preferencesAPI } from '@/lib/api/preferences';

/**
 * GET /api/preferences?userId=...&monthYear=YYYY-MM       → user's preferences for month
 * GET /api/preferences?monthYear=YYYY-MM                  → all preferences for month (admin)
 * GET /api/preferences?monthYear=YYYY-MM&checkDeadline=1  → check if deadline passed
 */
export const GET = withHandler('api/preferences', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;
  const monthYear = p.get('monthYear');

  if (!monthYear) {
    return jsonOk({ error: 'Parametro monthYear mancante (formato: YYYY-MM)' }, 400);
  }

  if (p.get('checkDeadline') === '1') {
    const passed = await preferencesAPI.isDeadlinePassed(monthYear);
    return jsonOk({ monthYear, deadlinePassed: passed });
  }

  const userId = p.get('userId');
  if (userId) {
    const data = await preferencesAPI.getUserMonthPreferences(userId, monthYear);
    return jsonOk(data);
  }

  // No userId → all preferences (admin use)
  const data = await preferencesAPI.getAllMonthPreferences(monthYear);
  return jsonOk(data);
});

/**
 * POST /api/preferences  { userId, date, preference }          → single day
 * POST /api/preferences  { userId, preferences: [{date, preference}] } → bulk
 */
export const POST = withHandler('api/preferences', 'POST', async (req) => {
  const body = await parseBody(req);

  // Bulk mode
  if (body.preferences && Array.isArray(body.preferences)) {
    await preferencesAPI.setBulkPreferences(body.userId, body.preferences);
    return jsonOk({ message: 'Preferenze salvate' });
  }

  // Single mode
  const { userId, date, preference } = body;
  const data = await preferencesAPI.setPreference(userId, date, preference);
  return jsonOk(data ?? { deleted: true });
});
