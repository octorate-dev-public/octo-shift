import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { settingsAPI } from '@/lib/api/settings';
import { getServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/distance  { userId, address }
 * Calcola il tempo di percorrenza (auto) casa→ufficio con Google Routes API
 * (computeRoutes) e salva su users: work_address + commute_minutes.
 *
 * Richiede la env GOOGLE_MAPS_API_KEY (server-side) e la "Routes API" abilitata
 * sul progetto Google Cloud (la vecchia Distance Matrix API è legacy e restituisce
 * REQUEST_DENIED). L'origine è l'indirizzo passato; la destinazione è
 * l'indirizzo ufficio da impostazioni (office_address).
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

  const resp = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify({
      origin: { address: String(address).trim() },
      destination: { address: office },
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      languageCode: 'it',
      units: 'METRIC',
    }),
  });
  const data = await resp.json();

  if (!resp.ok) {
    return jsonOk({ error: `Google Routes API: ${data.error?.status || resp.status}${data.error?.message ? ' — ' + data.error.message : ''}` }, 400);
  }

  const route = data.routes?.[0];
  if (!route) {
    return jsonOk({ error: 'Percorso non trovato (indirizzo non risolvibile)' }, 400);
  }

  // duration è una stringa tipo "1234s"
  const durSeconds = parseInt(String(route.duration || '0').replace('s', ''), 10) || 0;
  const minutes = Math.round(durSeconds / 60);
  const distanceMeters = route.distanceMeters ?? null;
  const distanceText = distanceMeters != null ? `${(distanceMeters / 1000).toFixed(1)} km` : null;

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
    durationText: `${minutes} min`,
    distanceText,
    office,
  });
});
