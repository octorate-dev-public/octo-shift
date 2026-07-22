/**
 * Next.js instrumentation: eseguito una volta all'avvio del server.
 * Usato per verifiche/migrazioni idempotenti dello schema (best-effort, non bloccanti).
 */
export async function register() {
  // Solo runtime Node (non Edge), e mai durante il build statico.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  try {
    const { ensureUserPhoneColumn } = await import('./lib/ensure-schema');
    await ensureUserPhoneColumn();
  } catch {
    // Non bloccare mai l'avvio dell'app per una verifica di schema.
  }
}
