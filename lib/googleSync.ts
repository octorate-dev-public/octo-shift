import { loadToken, syncFerie } from './google';
import { createLogger } from './logger';

const log = createLogger('googleSync');

/**
 * Innesca una sincronizzazione ferie su Google Calendar in background, senza far
 * fallire né rallentare l'operazione chiamante (salvataggio ferie).
 *
 * - Best-effort: se Google non è collegato o dà errore, logga e basta.
 * - NON viene awaited dal chiamante (fire-and-forget): la modifica al DB passa
 *   comunque. La rete di sicurezza è il cron notturno (/api/google/cron) che
 *   recupera qualunque modifica persa qui (es. runtime serverless terminato prima).
 */
export function triggerFerieSyncInBackground(reason: string): void {
  // non attendere: parte e ritorna subito
  void (async () => {
    try {
      const token = await loadToken();
      if (!token?.refresh_token) return; // Google non collegato → niente da fare
      const r = await syncFerie();
      log.info('triggerFerieSync', 'Sync automatica ferie', { reason, ...r });
    } catch (e) {
      log.warn('triggerFerieSync', 'Sync automatica fallita (ignorata)', {
        reason,
        err: e instanceof Error ? e.message : String(e),
      });
    }
  })();
}
