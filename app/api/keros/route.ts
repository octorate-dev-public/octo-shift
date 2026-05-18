/**
 * POST /api/keros  { startDate?, endDate?, situazione?, dryRun? }
 *   Importa ferie/permessi approvati da KEROS nel calendario Supabase.
 *
 * GET /api/keros
 *   Testa la connessione KEROS.
 *
 * Le credenziali vengono lette (in ordine di priorità):
 *   1. Tabella settings Supabase  → chiavi "keros_username" / "keros_password"
 *      (configurabili da Admin → Impostazioni, senza toccare Vercel)
 *   2. Variabili d'ambiente       → KEROS_USERNAME / KEROS_PASSWORD
 *      (fallback opzionale)
 */

import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { KerosClient, kerosDateToIso, workdaysInRange, matchUserByKerosName } from '@/lib/keros';
import { shiftsAPI } from '@/lib/api/shifts';
import { supabase, getServerSupabaseClient } from '@/lib/supabase';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/keros');

/** Legge le credenziali KEROS: prima da Supabase settings, poi da env vars. */
async function resolveCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    // Usa il service role key per non esporre la password all'anon role
    const db = getServerSupabaseClient();
    const { data } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['keros_username', 'keros_password']);

    if (data && data.length === 2) {
      const u = data.find((r: { key: string; value: string }) => r.key === 'keros_username')?.value;
      const p = data.find((r: { key: string; value: string }) => r.key === 'keros_password')?.value;
      if (u && p) return { username: u, password: p };
    }
  } catch {
    // fallback a env vars
  }

  const username = process.env.KEROS_USERNAME;
  const password = process.env.KEROS_PASSWORD;
  if (username && password) return { username, password };

  return null;
}

// ─── GET — test connessione ───────────────────────────────────────────────────
export const GET = withHandler('api/keros', 'GET', async () => {
  const creds = await resolveCredentials();

  if (!creds) {
    return jsonOk({
      ok: false,
      configured: false,
      error: 'Credenziali KEROS non configurate. Vai su Admin → Impostazioni → KEROS HR.',
    }, 400);
  }

  try {
    const client = new KerosClient();
    await client.login(creds.username, creds.password);
    return jsonOk({ ok: true, configured: true, message: `Connessione KEROS riuscita per ${creds.username}` });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return jsonOk({ ok: false, configured: true, error: msg }, 502);
  }
});

// ─── POST — importa assenze ───────────────────────────────────────────────────
export const POST = withHandler('api/keros', 'POST', async (req) => {
  const creds = await resolveCredentials();

  if (!creds) {
    return jsonOk({
      ok: false,
      error: 'Credenziali KEROS non configurate. Vai su Admin → Impostazioni → KEROS HR.',
    }, 400);
  }

  const body = await parseBody(req);
  const {
    startDate,          // YYYY-MM-DD opzionale
    endDate,            // YYYY-MM-DD opzionale
    situazione = '2',   // 2=Approvata di default
    dryRun = false,     // se true, non scrive su Supabase
  } = body as {
    startDate?: string;
    endDate?: string;
    situazione?: string;
    dryRun?: boolean;
  };

  // Converti date ISO → DD/MM/YYYY per KEROS (se fornite)
  const kerosStart = startDate
    ? `${startDate.slice(8, 10)}/${startDate.slice(5, 7)}/${startDate.slice(0, 4)}`
    : undefined;
  const kerosEnd = endDate
    ? `${endDate.slice(8, 10)}/${endDate.slice(5, 7)}/${endDate.slice(0, 4)}`
    : undefined;

  log.info('POST', 'Avvio importazione KEROS', { startDate, endDate, situazione, dryRun });

  // 1. Autenticazione KEROS
  const client = new KerosClient();
  try {
    await client.login(creds.username, creds.password);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login KEROS fallito';
    return jsonOk({ ok: false, error: msg }, 502);
  }

  // 2. Fetch assenze
  let kerosEntries;
  try {
    kerosEntries = await client.fetchLeaves({
      tipo: 'A',
      situazione: situazione as '1' | '2' | '3' | '4' | '9',
      dataInizio: kerosStart,
      dataFine: kerosEnd,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore recupero KEROS';
    return jsonOk({ ok: false, error: msg }, 502);
  }

  // 3. Carica utenti Supabase per il matching
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('is_active', true);

  if (usersError) {
    return jsonOk({ ok: false, error: 'Errore caricamento utenti Supabase' }, 500);
  }

  // 4. Processo ogni voce
  const results = {
    ok: true,
    total: kerosEntries.length,
    imported: 0,
    skipped: 0,
    unmatched: 0,
    details: [] as Array<{
      nominativo: string;
      leaveType: string | null;
      dataInizio: string;
      dataFine: string;
      giorni: number;
      userId: string | null;
      status: 'imported' | 'skipped' | 'unmatched' | 'dryrun';
    }>,
  };

  for (const entry of kerosEntries) {
    // Considera solo voci con leaveType riconosciuto
    if (!entry.leaveType) {
      results.skipped++;
      results.details.push({
        nominativo: entry.nominativo,
        leaveType: null,
        dataInizio: entry.dataInizio,
        dataFine: entry.dataFine,
        giorni: 0,
        userId: null,
        status: 'skipped',
      });
      continue;
    }

    // Matching nome
    const userId = matchUserByKerosName(entry.nominativo, users || []);
    if (!userId) {
      results.unmatched++;
      results.details.push({
        nominativo: entry.nominativo,
        leaveType: entry.leaveType,
        dataInizio: entry.dataInizio,
        dataFine: entry.dataFine,
        giorni: 0,
        userId: null,
        status: 'unmatched',
      });
      log.warn('POST', `Nessun match Supabase per: ${entry.nominativo}`);
      continue;
    }

    // Genera la lista di giorni lavorativi nel range
    const startIso = kerosDateToIso(entry.dataInizio);
    const endIso = kerosDateToIso(entry.dataFine);
    if (!startIso || !endIso) {
      results.skipped++;
      continue;
    }
    const days = workdaysInRange(startIso, endIso);

    if (!dryRun) {
      // Crea/aggiorna uno shift per ogni giorno lavorativo
      for (const day of days) {
        try {
          await shiftsAPI.setLeaveType(userId, day, entry.leaveType);
        } catch (err: unknown) {
          log.error('POST', `Errore scrittura shift ${userId} ${day}`, err instanceof Error ? err : new Error(String(err)));
        }
      }
    }

    results.imported += days.length;
    results.details.push({
      nominativo: entry.nominativo,
      leaveType: entry.leaveType,
      dataInizio: entry.dataInizio,
      dataFine: entry.dataFine,
      giorni: days.length,
      userId,
      status: dryRun ? 'dryrun' : 'imported',
    });
  }

  log.info('POST', `Importazione completata: ${results.imported} giorni, ${results.unmatched} non abbinati`);
  return jsonOk(results);
});
