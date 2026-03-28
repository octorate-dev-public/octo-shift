import { withHandler, jsonOk, parseBody, noContent } from '@/lib/api-handler';
import { settingsAPI } from '@/lib/api/settings';

/**
 * GET /api/settings             → all settings
 * GET /api/settings?key=...     → single setting
 */
export const GET = withHandler('api/settings', 'GET', async (req) => {
  const key = req.nextUrl.searchParams.get('key');

  if (key) {
    const value = await settingsAPI.getSetting(key);
    return jsonOk({ key, value });
  }

  const all = await settingsAPI.getAllSettings();
  return jsonOk(all);
});

/**
 * POST /api/settings  { key, value }
 */
export const POST = withHandler('api/settings', 'POST', async (req) => {
  const { key, value } = await parseBody(req);
  const setting = await settingsAPI.setSetting(key, value);
  return jsonOk(setting, 201);
});

/**
 * DELETE /api/settings?key=...
 */
export const DELETE = withHandler('api/settings', 'DELETE', async (req) => {
  const key = req.nextUrl.searchParams.get('key');
  if (!key) return jsonOk({ error: 'Parametro key mancante' }, 400);
  await settingsAPI.deleteSetting(key);
  return noContent();
});
