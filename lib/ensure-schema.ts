import { getServerSupabaseClient } from './supabase';
import { createLogger } from './logger';

const log = createLogger('ensureSchema');

const PHONE_DDL = 'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);';

/**
 * Verifica allo start dell'app che la colonna `users.phone` esista.
 * Se manca, prova ad aggiungerla via RPC `exec_sql` (se disponibile nel DB).
 * La DDL NON è eseguibile direttamente dal client Supabase: se l'RPC non esiste,
 * logga un avviso ben visibile con l'SQL esatto da eseguire una volta a mano.
 * Idempotente e non-bloccante: qualsiasi errore viene solo loggato.
 */
export async function ensureUserPhoneColumn(): Promise<void> {
  let supabase;
  try {
    supabase = getServerSupabaseClient();
  } catch (e) {
    log.warn('ensureUserPhoneColumn', 'Client service-role non disponibile, salto', {
      err: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  // 1. La colonna esiste già?
  const { error: selErr } = await supabase.from('users').select('phone').limit(1);
  if (!selErr) {
    log.info('ensureUserPhoneColumn', 'Colonna users.phone presente');
    return;
  }

  const missing =
    selErr.code === '42703' || /column .*phone.* does not exist/i.test(selErr.message ?? '');
  if (!missing) {
    log.warn('ensureUserPhoneColumn', 'Verifica colonna phone fallita (non per assenza)', {
      code: selErr.code,
      message: selErr.message,
    });
    return;
  }

  // 2. Manca → prova ad aggiungerla via RPC exec_sql (se il DB la espone)
  const { error: rpcErr } = await supabase.rpc('exec_sql', { sql: PHONE_DDL });
  if (!rpcErr) {
    log.info('ensureUserPhoneColumn', 'Colonna users.phone aggiunta via RPC exec_sql');
    return;
  }

  // 3. Nessun modo automatico → avviso esplicito con l'SQL da eseguire
  log.warn(
    'ensureUserPhoneColumn',
    `⚠️  Colonna 'users.phone' MANCANTE e impossibile crearla in automatico ` +
      `(RPC exec_sql non disponibile: ${rpcErr.message}). ` +
      `Esegui una volta sulla Supabase SQL Editor: ${PHONE_DDL}`,
  );
}
