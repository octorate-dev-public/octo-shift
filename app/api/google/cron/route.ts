import { NextRequest, NextResponse } from 'next/server';
import { loadToken, syncFerie } from '@/lib/google';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const log = createLogger('googleCron');

/**
 * GET /api/google/cron  → rete di sicurezza: risincronizza le ferie su Google.
 *
 * Pensato per Vercel Cron (vedi vercel.json). Recupera qualunque modifica che la
 * sync istantanea in background (lib/googleSync.ts) potrebbe aver perso (es. runtime
 * serverless terminato prima di completare).
 *
 * Protezione: se CRON_SECRET è impostata, richiede header
 * `Authorization: Bearer <CRON_SECRET>` (Vercel Cron lo invia in automatico).
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }
  }

  try {
    const token = await loadToken();
    if (!token?.refresh_token) {
      return NextResponse.json({ ok: true, skipped: 'Google non collegato' });
    }
    const r = await syncFerie();
    log.info('cron', 'Sync ferie da cron', r);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn('cron', 'Sync da cron fallita', { err: msg });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
