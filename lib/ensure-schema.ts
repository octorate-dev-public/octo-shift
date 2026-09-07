import { getServerSupabaseClient } from './supabase';
import { createLogger } from './logger';

const log = createLogger('ensureSchema');

// Colonne opzionali della tabella users che l'app tenta di garantire allo start.
const USER_COLUMNS: Array<{ name: string; ddl: string }> = [
  { name: 'phone', ddl: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);' },
  { name: 'work_address', ddl: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS work_address VARCHAR(255);' },
  { name: 'commute_minutes', ddl: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS commute_minutes INTEGER;' },
  { name: 'preferred_smart_day', ddl: 'ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_smart_day VARCHAR(10);' },
];

/**
 * Verifica allo start che le colonne opzionali di `users` esistano. Se una manca,
 * prova ad aggiungerla via RPC `exec_sql` (se disponibile nel DB). La DDL NON è
 * eseguibile direttamente dal client Supabase: se l'RPC non c'è, logga un avviso
 * con l'SQL esatto da eseguire una volta a mano. Idempotente e non-bloccante.
 */
export async function ensureUserColumns(): Promise<void> {
  let supabase;
  try {
    supabase = getServerSupabaseClient();
  } catch (e) {
    log.warn('ensureUserColumns', 'Client service-role non disponibile, salto', {
      err: e instanceof Error ? e.message : String(e),
    });
    return;
  }

  for (const col of USER_COLUMNS) {
    const { error: selErr } = await supabase.from('users').select(col.name).limit(1);
    if (!selErr) continue; // colonna presente

    const missing =
      selErr.code === '42703' ||
      new RegExp(`column .*${col.name}.* does not exist`, 'i').test(selErr.message ?? '');
    if (!missing) {
      log.warn('ensureUserColumns', `Verifica colonna ${col.name} fallita (non per assenza)`, {
        code: selErr.code,
        message: selErr.message,
      });
      continue;
    }

    const { error: rpcErr } = await supabase.rpc('exec_sql', { sql: col.ddl });
    if (!rpcErr) {
      log.info('ensureUserColumns', `Colonna users.${col.name} aggiunta via RPC exec_sql`);
      continue;
    }

    log.warn(
      'ensureUserColumns',
      `⚠️  Colonna 'users.${col.name}' MANCANTE e impossibile crearla in automatico ` +
        `(RPC exec_sql non disponibile: ${rpcErr.message}). Esegui a mano: ${col.ddl}`,
    );
  }
}
