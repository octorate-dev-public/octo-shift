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
import { decrypt, isEncrypted } from '@/lib/crypto';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/keros');

/**
 * Legge e decifra le credenziali KEROS.
 * Priorità:
 *   1. Supabase settings (lette con service role, decifrate con KEROS_ENCRYPTION_KEY)
 *   2. Variabili d'ambiente KEROS_USERNAME / KEROS_PASSWORD (plain text, fallback)
 */
async function resolveCredentials(): Promise<{ username: string; password: string } | null> {
  try {
    const db = getServerSupabaseClient(); // service role — non esposto al client
    const { data } = await db
      .from('settings')
      .select('key, value')
      .in('key', ['keros_username', 'keros_password']);

    if (data && data.length === 2) {
      const rawU = data.find((r: { key: string; value: string }) => r.key === 'keros_username')?.value;
      const rawP = data.find((r: { key: string; value: string }) => r.key === 'keros_password')?.value;

      if (rawU && rawP) {
        // Decifra se i valori sono stati cifrati con AES-256-GCM
        const username = isEncrypted(rawU) ? decrypt(rawU) : rawU;
        const password = isEncrypted(rawP) ? decrypt(rawP) : rawP;
        return { username, password };
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn('resolveCredentials', `Impossibile leggere/decifrare credenziali da Supabase: ${msg}`);
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

  log.info('POST', `━━━ KEROS IMPORT START ━━━ dryRun=${dryRun}, range=${startDate ?? 'tutti'} → ${endDate ?? 'tutti'}, situazione=${situazione}`);

  // ── 1. Autenticazione ─────────────────────────────────────────────────────
  log.info('POST', '[step 1/4] Autenticazione KEROS…');
  const client = new KerosClient();
  try {
    await client.login(creds.username, creds.password);
    log.info('POST', '[step 1/4] ✓ Autenticazione riuscita');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Login KEROS fallito';
    log.error('POST', `[step 1/4] ✗ Autenticazione fallita: ${msg}`, err instanceof Error ? err : new Error(msg));
    return jsonOk({ ok: false, step: 'login', error: msg }, 502);
  }

  // ── 2. Fetch assenze da KEROS ─────────────────────────────────────────────
  log.info('POST', '[step 2/4] Recupero assenze da KEROS…');
  let kerosEntries;
  try {
    kerosEntries = await client.fetchLeaves({
      tipo: 'A',
      situazione: situazione as '1' | '2' | '3' | '4' | '9',
      dataInizio: kerosStart,
      dataFine: kerosEnd,
    });
    log.info('POST', `[step 2/4] ✓ ${kerosEntries.length} assenze recuperate`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Errore recupero KEROS';
    log.error('POST', `[step 2/4] ✗ Fetch fallito: ${msg}`, err instanceof Error ? err : new Error(msg));
    return jsonOk({ ok: false, step: 'fetch', error: msg }, 502);
  }

  // ── 3. Carica utenti Supabase ─────────────────────────────────────────────
  log.info('POST', '[step 3/4] Caricamento utenti Supabase per il matching…');
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, full_name')
    .eq('is_active', true);

  if (usersError) {
    log.error('POST', `[step 3/4] ✗ Errore Supabase: ${usersError.message}`, new Error(usersError.message));
    return jsonOk({ ok: false, step: 'load_users', error: 'Errore caricamento utenti Supabase' }, 500);
  }
  log.info('POST', `[step 3/4] ✓ ${(users || []).length} utenti attivi caricati`);

  // ── 4. Matching e import ──────────────────────────────────────────────────
  log.info('POST', `[step 4/4] Inizio matching e import (dryRun=${dryRun})…`);
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
      log.info('POST', `  [skip] "${entry.nominativo}" — causalizzazione non gestita: "${entry.causalizzazione}" (solo FERM/ROL supportate)`);
      continue;
    }

    // Matching nome KEROS → utente Supabase
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
      const supabaseNames = (users || []).map(u => u.full_name).join(', ');
      log.warn('POST',
        `  [no match] "${entry.nominativo}" (KEROS) — nessun utente Supabase abbinato. ` +
        `Utenti disponibili: [${supabaseNames}]`,
      );
      continue;
    }

    const matchedUser = (users || []).find(u => u.id === userId);
    log.info('POST', `  [match ✓] "${entry.nominativo}" → "${matchedUser?.full_name}" (${userId})`);

    // Genera la lista di giorni lavorativi nel range
    const startIso = kerosDateToIso(entry.dataInizio);
    const endIso = kerosDateToIso(entry.dataFine);
    if (!startIso || !endIso) {
      log.warn('POST', `  [skip] "${entry.nominativo}" — date non parsabili: ${entry.dataInizio} / ${entry.dataFine}`);
      results.skipped++;
      continue;
    }
    const days = workdaysInRange(startIso, endIso);
    log.info('POST', `  [import] "${entry.nominativo}" — ${entry.leaveType} dal ${startIso} al ${endIso} (${days.length} giorni lavorativi)`);

    if (!dryRun) {
      for (const day of days) {
        try {
          await shiftsAPI.setLeaveType(userId, day, entry.leaveType);
          log.info('POST', `    ✓ shift aggiornato: ${day} → ${entry.leaveType}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          log.error('POST', `    ✗ errore scrittura shift ${userId} ${day}: ${msg}`, err instanceof Error ? err : new Error(msg));
        }
      }
    } else {
      log.info('POST', `    (dryRun — nessuna scrittura su Supabase)`);
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

  log.info('POST',
    `━━━ KEROS IMPORT END ━━━ ` +
    `totale=${results.total} | importati=${results.imported}gg | non-abbinati=${results.unmatched} | ignorati=${results.skipped} | dryRun=${dryRun}`,
  );
  if (results.unmatched > 0) {
    log.warn('POST',
      `${results.unmatched} dipendenti KEROS senza corrispondenza in Supabase. ` +
      `Verifica che i nomi in Supabase (es. "Mario R.") contengano almeno un token esatto del nome KEROS (es. "ROSSI MARIO").`,
    );
  }
  return jsonOk(results);
});
