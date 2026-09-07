import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import {
  getStatus,
  listCalendars,
  clearToken,
  setCalendarId,
  setTitleTemplate,
  syncFerie,
} from '@/lib/google';

/**
 * GET /api/google?action=status     → stato collegamento (email, scadenza token, calendario, template)
 * GET /api/google?action=calendars  → elenco calendari dell'account collegato
 */
export const GET = withHandler('api/google', 'GET', async (req) => {
  const action = req.nextUrl.searchParams.get('action') || 'status';
  if (action === 'calendars') {
    const items = await listCalendars();
    return jsonOk(items);
  }
  return jsonOk(await getStatus());
});

/**
 * POST /api/google  { action: 'disconnect' }
 * POST /api/google  { action: 'setCalendar', calendarId }
 * POST /api/google  { action: 'setTitle', titleTemplate }
 * POST /api/google  { action: 'sync' }                     → sincronizza le ferie
 */
export const POST = withHandler('api/google', 'POST', async (req) => {
  const body = await parseBody(req);
  const action = body.action;

  if (action === 'disconnect') {
    await clearToken();
    return jsonOk({ ok: true });
  }
  if (action === 'setCalendar') {
    await setCalendarId(body.calendarId);
    return jsonOk({ ok: true });
  }
  if (action === 'setTitle') {
    await setTitleTemplate(body.titleTemplate);
    return jsonOk({ ok: true });
  }
  if (action === 'sync') {
    const result = await syncFerie();
    return jsonOk(result);
  }
  return jsonOk({ error: 'Azione non riconosciuta' }, 400);
});
