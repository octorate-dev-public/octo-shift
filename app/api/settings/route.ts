import { withHandler, jsonOk, parseBody, noContent } from '@/lib/api-handler';
import { settingsAPI } from '@/lib/api/settings';
import { encrypt, isEncrypted } from '@/lib/crypto';

/** Chiavi che contengono credenziali sensibili — mai esposte in chiaro via API. */
const SENSITIVE_KEYS = new Set(['keros_username', 'keros_password']);

/**
 * GET /api/settings             → tutte le impostazioni (sensibili oscurate)
 * GET /api/settings?key=...     → singola impostazione
 */
export const GET = withHandler('api/settings', 'GET', async (req) => {
  const key = req.nextUrl.searchParams.get('key');

  if (key) {
    // Le chiavi sensibili non vengono mai restituite in chiaro
    if (SENSITIVE_KEYS.has(key)) return jsonOk({ key, value: null });
    const value = await settingsAPI.getSetting(key);
    return jsonOk({ key, value });
  }

  const all = await settingsAPI.getAllSettings();

  // Per ogni chiave sensibile: rimuovi il valore, aggiungi flag "_set"
  for (const sk of SENSITIVE_KEYS) {
    if (sk in all) {
      all[`${sk}_set`] = all[sk] ? 'true' : 'false';
      delete all[sk];
    }
  }

  return jsonOk(all);
});

/**
 * POST /api/settings  { key, value }
 * Le chiavi sensibili vengono cifrate con AES-256-GCM prima della scrittura.
 */
export const POST = withHandler('api/settings', 'POST', async (req) => {
  const { key, value } = await parseBody(req);

  let valueToStore = value;

  if (SENSITIVE_KEYS.has(key) && value) {
    // Cifra solo se non è già cifrato (evita doppia cifratura)
    if (!isEncrypted(value)) {
      try {
        valueToStore = encrypt(value);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Errore di cifratura';
        return jsonOk({ error: msg }, 500);
      }
    }
  }

  const setting = await settingsAPI.setSetting(key, valueToStore);
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
