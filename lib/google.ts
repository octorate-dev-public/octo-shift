import { supabase } from './supabase';
import { settingsAPI } from './api/settings';
import { encrypt, decrypt } from './crypto';
import { groupVacationBlocks, formatDate } from './utils';
import { createLogger } from './logger';

const log = createLogger('google');

// Scope: gestione eventi calendario + email dell'account (per lo stato).
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';

const TOKEN_KEY = 'google_oauth';                 // JSON cifrato
const CAL_KEY = 'google_calendar_id';             // id calendario destinazione
const TITLE_KEY = 'google_ferie_title';           // template titolo evento
const DEFAULT_TITLE = '{name} (Developer) - Ferie';
const DEFAULT_CAL = 'primary';

// Tag interno per riconoscere SOLO i nostri eventi (mai toccare quelli altrui).
const TAG_KEY = 'octoshift';
const TAG_VAL = 'ferie';

export interface GoogleToken {
  refresh_token: string;
  access_token: string;
  expiry: number; // epoch ms
  email: string | null;
  scope: string;
}

export function getClientCreds() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET non configurati');
  }
  return { clientId, clientSecret };
}

export function buildAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = getClientCreds();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent select_account', // forza refresh_token e scelta account (per cambiare account)
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function fetchEmail(accessToken: string): Promise<string | null> {
  try {
    const r = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!r.ok) return null;
    const j = await r.json();
    return j.email ?? null;
  } catch {
    return null;
  }
}

export async function exchangeCode(code: string, redirectUri: string): Promise<GoogleToken> {
  const { clientId, clientSecret } = getClientCreds();
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Token exchange fallito: ${data.error_description || data.error || resp.status}`);
  }
  if (!data.refresh_token) {
    throw new Error('Google non ha restituito un refresh_token. Revoca l\'accesso e ricollega (serve prompt=consent).');
  }
  const email = await fetchEmail(data.access_token);
  return {
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    email,
    scope: data.scope ?? GOOGLE_SCOPE,
  };
}

export async function loadToken(): Promise<GoogleToken | null> {
  const raw = await settingsAPI.getSetting(TOKEN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(decrypt(raw)) as GoogleToken;
  } catch (e) {
    log.warn('loadToken', 'Token non decifrabile', { err: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

export async function saveToken(token: GoogleToken): Promise<void> {
  await settingsAPI.setSetting(TOKEN_KEY, encrypt(JSON.stringify(token)));
}

export async function clearToken(): Promise<void> {
  await settingsAPI.setSetting(TOKEN_KEY, '');
}

/** Ritorna un access_token valido, rinfrescandolo se scaduto. Lancia se non collegato. */
export async function ensureAccessToken(): Promise<GoogleToken> {
  const token = await loadToken();
  if (!token || !token.refresh_token) throw new Error('Google Calendar non collegato');

  if (Date.now() < token.expiry - 60_000) return token; // ancora valido

  const { clientId, clientSecret } = getClientCreds();
  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: token.refresh_token,
      grant_type: 'refresh_token',
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    throw new Error(`Refresh token fallito: ${data.error_description || data.error || resp.status}`);
  }
  const updated: GoogleToken = {
    ...token,
    access_token: data.access_token,
    expiry: Date.now() + (data.expires_in ?? 3600) * 1000,
    scope: data.scope ?? token.scope,
  };
  await saveToken(updated);
  return updated;
}

async function gcal(path: string, init: RequestInit, accessToken: string): Promise<any> {
  const r = await fetch(`https://www.googleapis.com/calendar/v3${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const text = await r.text();
  const json = text ? JSON.parse(text) : {};
  if (!r.ok) {
    throw new Error(`Google Calendar API ${r.status}: ${json.error?.message || text}`);
  }
  return json;
}

export async function getCalendarId(): Promise<string> {
  return (await settingsAPI.getSetting(CAL_KEY)) || DEFAULT_CAL;
}
export async function setCalendarId(id: string): Promise<void> {
  await settingsAPI.setSetting(CAL_KEY, id || DEFAULT_CAL);
}
export async function getTitleTemplate(): Promise<string> {
  return (await settingsAPI.getSetting(TITLE_KEY)) || DEFAULT_TITLE;
}
export async function setTitleTemplate(t: string): Promise<void> {
  await settingsAPI.setSetting(TITLE_KEY, t || DEFAULT_TITLE);
}

export async function getStatus() {
  const token = await loadToken();
  const calendarId = await getCalendarId();
  const titleTemplate = await getTitleTemplate();
  const hasClient = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return {
    configured: hasClient,
    connected: Boolean(token?.refresh_token),
    email: token?.email ?? null,
    expiresAt: token ? new Date(token.expiry).toISOString() : null,
    expired: token ? Date.now() >= token.expiry : null,
    calendarId,
    titleTemplate,
  };
}

export async function listCalendars(): Promise<Array<{ id: string; summary: string; primary?: boolean }>> {
  const token = await ensureAccessToken();
  const data = await gcal('/users/me/calendarList', {}, token.access_token);
  return (data.items || [])
    .map((c: any) => ({ id: c.id, summary: c.summary, primary: c.primary }))
    .sort((a: any, b: any) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
}

function addDaysStr(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface DesiredEvent {
  key: string;        // octoshiftKey stabile: userId:startDate
  title: string;
  startDate: string;  // all-day start (inclusivo)
  endDate: string;    // all-day end (ESCLUSIVO per Google)
}

/**
 * Sincronizza le FERIE su Google Calendar.
 * - Legge le ferie (leave_type='vacation') nella finestra [oggi-7g, +365g].
 * - Raggruppa per utente in blocchi di giorni consecutivi → un evento all-day per blocco.
 * - Crea/aggiorna/elimina SOLO gli eventi con extendedProperties.private.octoshift='ferie'.
 *   Gli eventi creati da altri (senza il nostro tag) non vengono MAI toccati.
 */
export async function syncFerie(): Promise<{ created: number; updated: number; deleted: number; unchanged: number; total: number }> {
  const token = await ensureAccessToken();
  const calendarId = await getCalendarId();
  const template = await getTitleTemplate();

  const today = new Date();
  const timeMinDate = formatDate(new Date(today.getTime() - 7 * 86400000));
  const timeMaxDate = formatDate(new Date(today.getTime() + 365 * 86400000));

  // 1. Ferie dal DB nella finestra, con nome utente
  const { data: rows, error } = await supabase
    .from('shifts')
    .select('user_id, shift_date, leave_type, users:user_id(full_name)')
    .eq('leave_type', 'vacation')
    .gte('shift_date', timeMinDate)
    .lte('shift_date', timeMaxDate);
  if (error) throw new Error(`Lettura ferie fallita: ${error.message}`);

  // 2. Raggruppa per utente → blocchi
  const byUser = new Map<string, Array<{ shift_date: string; leave_type: string | null }>>();
  const nameByUser = new Map<string, string>();
  for (const r of rows || []) {
    const uid = (r as any).user_id as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push({ shift_date: (r as any).shift_date, leave_type: (r as any).leave_type });
    const nm = (r as any).users?.full_name;
    if (nm) nameByUser.set(uid, nm);
  }

  const desired = new Map<string, DesiredEvent>();
  for (const [uid, shifts] of byUser) {
    const blocks = groupVacationBlocks(shifts);
    const name = nameByUser.get(uid) ?? 'Dipendente';
    for (const block of blocks) {
      const startDate = block[0].shift_date;
      const endDate = block[block.length - 1].shift_date;
      const key = `${uid}:${startDate}`;
      desired.set(key, {
        key,
        title: template.replace('{name}', name),
        startDate,
        endDate: addDaysStr(endDate, 1), // Google: end all-day è esclusivo
      });
    }
  }

  // 3. Eventi NOSTRI già presenti (solo quelli col tag octoshift=ferie)
  const existing = new Map<string, any>(); // key → event
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `${TAG_KEY}=${TAG_VAL}`,
      timeMin: `${timeMinDate}T00:00:00Z`,
      timeMax: `${timeMaxDate}T23:59:59Z`,
      showDeleted: 'false',
      maxResults: '250',
      singleEvents: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gcal(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {}, token.access_token);
    for (const ev of data.items || []) {
      const k = ev.extendedProperties?.private?.octoshiftKey;
      if (k) existing.set(k, ev);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  let created = 0, updated = 0, deleted = 0, unchanged = 0;

  // 4. Crea / aggiorna
  for (const [key, d] of desired) {
    const body = {
      summary: d.title,
      start: { date: d.startDate },
      end: { date: d.endDate },
      transparency: 'transparent',
      extendedProperties: { private: { [TAG_KEY]: TAG_VAL, octoshiftKey: key } },
    };
    const ev = existing.get(key);
    if (!ev) {
      await gcal(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body: JSON.stringify(body) }, token.access_token);
      created++;
    } else {
      const same = ev.summary === d.title && ev.start?.date === d.startDate && ev.end?.date === d.endDate;
      if (same) { unchanged++; }
      else {
        await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${ev.id}`, { method: 'PATCH', body: JSON.stringify(body) }, token.access_token);
        updated++;
      }
    }
  }

  // 5. Elimina i NOSTRI eventi non più desiderati (ferie cancellate/spostate)
  for (const [key, ev] of existing) {
    if (!desired.has(key)) {
      await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${ev.id}`, { method: 'DELETE' }, token.access_token);
      deleted++;
    }
  }

  log.info('syncFerie', 'Sync completata', { created, updated, deleted, unchanged });
  return { created, updated, deleted, unchanged, total: desired.size };
}
