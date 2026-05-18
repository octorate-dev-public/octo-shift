import { withHandler, jsonOk, parseBody, noContent } from '@/lib/api-handler';
import { onCallAPI } from '@/lib/api/on-call';

/**
 * GET /api/on-call?date=YYYY-MM-DD         → on-call settimanale per quella data
 * GET /api/on-call?week=YYYY-MM-DD         → on-call per settimana specifica
 * GET /api/on-call?year=2026&month=4       → tutte le assegnazioni del mese (tabella weekly)
 * GET /api/on-call?users=true              → tutti gli utenti in rotazione
 * GET /api/on-call?dailyYear=2026          → assegnazioni giornaliere dell'anno (matrice)
 * GET /api/on-call?dailyDate=YYYY-MM-DD   → assegnazione giornaliera per una data
 */
export const GET = withHandler('api/on-call', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;

  // Daily: anno completo (matrice)
  if (p.has('dailyYear') && !p.has('dailyMonth')) {
    const data = await onCallAPI.getYearDailyOnCall(parseInt(p.get('dailyYear')!));
    return jsonOk(data);
  }

  // Daily: mese specifico con join users (pagina /on-call utente)
  if (p.has('dailyYear') && p.has('dailyMonth')) {
    const data = await onCallAPI.getMonthDailyOnCall(
      parseInt(p.get('dailyYear')!),
      parseInt(p.get('dailyMonth')!),
    );
    return jsonOk(data);
  }

  // Daily: singola data
  if (p.has('dailyDate')) {
    const data = await onCallAPI.getDailyOnCallForDate(p.get('dailyDate')!);
    return jsonOk(data);
  }

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
 * POST /api/on-call  { userId, weekStartDate }               → crea assegnazione settimanale
 * POST /api/on-call  { generate: true, year, month, userIds }→ genera rotazione mensile (weekly)
 * POST /api/on-call  { generateAnnual: true, year, userIds } → genera anno completo (daily)
 */
export const POST = withHandler('api/on-call', 'POST', async (req) => {
  const body = await parseBody(req);

  // Generazione annuale (matrice giornaliera)
  if (body.generateAnnual) {
    const data = await onCallAPI.generateAnnualOnCall(body.year, body.userIds);
    return jsonOk({ generated: data.length }, 201);
  }

  // Generazione mensile (tabella weekly legacy)
  if (body.generate) {
    const data = await onCallAPI.generateMonthOnCall(body.year, body.month, body.userIds);
    return jsonOk(data, 201);
  }

  // Singola settimana
  const data = await onCallAPI.createOnCallAssignment(body.userId, body.weekStartDate);
  return jsonOk(data, 201);
});

/**
 * PATCH /api/on-call  { id, userId }                                      → aggiorna assegnazione settimanale
 * PATCH /api/on-call  { reassign: true, date, userId }                    → riassegna un singolo giorno
 * PATCH /api/on-call  { swap: true, userId1, dates1, userId2, dates2 }    → swap blocchi giornalieri
 */
export const PATCH = withHandler('api/on-call', 'PATCH', async (req) => {
  const body = await parseBody(req);

  // Swap blocchi giornalieri
  if (body.swap) {
    await onCallAPI.swapDayRanges(body.userId1, body.dates1, body.userId2, body.dates2);
    return jsonOk({ ok: true });
  }

  // Riassegna singolo giorno
  if (body.reassign) {
    const data = await onCallAPI.reassignDay(body.date, body.userId);
    return jsonOk(data);
  }

  // Aggiorna assegnazione settimanale (legacy)
  const { id, userId } = body;
  const data = await onCallAPI.updateOnCallAssignment(id, userId);
  return jsonOk(data);
});

/**
 * DELETE /api/on-call?id=...              → elimina assegnazione settimanale
 * DELETE /api/on-call?clearYear=2026      → elimina tutte le assegnazioni giornaliere dell'anno
 */
export const DELETE = withHandler('api/on-call', 'DELETE', async (req) => {
  const p = req.nextUrl.searchParams;

  if (p.has('clearYear')) {
    await onCallAPI.clearYearDailyOnCall(parseInt(p.get('clearYear')!));
    return noContent();
  }

  const id = p.get('id');
  if (!id) return jsonOk({ error: 'Parametro id mancante' }, 400);
  await onCallAPI.deleteOnCallAssignment(id);
  return noContent();
});
