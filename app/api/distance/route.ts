import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { settingsAPI } from '@/lib/api/settings';
import { getServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/distance  { userId, address }
 * Calcola il tempo di percorrenza (auto) casa→ufficio con Google Distance Matrix
 * e salva su users: work_address + commute_minutes. Ritorna i minuti e i testi.
 *
 * Richiede la env GOOGLE_MAPS_API_KEY (server-side). L'origine è l'indirizzo
 * passato; la destinazione è l'indirizzo ufficio da impostazioni (office_address).
 */
export const POST = withHandler('api/distance', 'POST', async (req) => {
  const { userId, address } = await parseBody(req);

  if (!userId) return jsonOk({ error: 'userId mancante' }, 400);
  if (!address || !String(address).trim()) return jsonOk({ error: 'Indirizzo mancante' }, 400);

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return jsonOk({ error: 'GOOGLE_MAPS_API_KEY non configurata sul server' }, 400);
  }

  const office = await settingsAPI.getOfficeAddress();

  const url =
    'https://maps.googleapis.com/maps/api/distancematrix/json' +
    `?origins=${encodeURIComponent(String(address))}` +
    `&destinations=${encodeURIComponent(office)}` +
    '&mode=driving&language=it&units=metric' +
    `&key=${key}`;

  const resp = await fetch(url);
  const data = await resp.json();

  if (data.status !== 'OK') {
    return jsonOk({ error: `Google Distance Matrix: ${data.status}${data.error_message ? ' — ' + data.error_message : ''}` }, 400);
  }

  const element = data.rows?.[0]?.elements?.[0];
  if (!element || element.status !== 'OK') {
    return jsonOk({ error: `Indirizzo non risolvibile (${element?.status ?? 'NO_RESULT'})` }, 400);
  }

  const minutes = Math.round((element.duration?.value ?? 0) / 60);

  // Persisti su users (service role)
  const supabase = getServerSupabaseClient();
  const { error } = await supabase
    .from('users')
    .update({ work_address: String(address).trim(), commute_minutes: minutes })
    .eq('id', userId);

  if (error) {
    return jsonOk({ error: `Impossibile salvare la distanza: ${error.message}` }, 500);
  }

  return jsonOk({
    minutes,
    durationText: element.duration?.text ?? `${minutes} min`,
    distanceText: element.distance?.text ?? null,
    office,
  });
});
