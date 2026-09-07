import { supabase } from './supabase';
import { settingsAPI } from './api/settings';
import { encrypt, decrypt } from './crypto';
import { formatDate } from './utils';
import { createLogger } from './logger';

const log = createLogger('google');

// Scope: gestione eventi calendario + email dell'account (per lo stato).
export const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email';

const TOKEN_KEY = 'google_oauth';                 // JSON cifrato
const CAL_KEY = 'google_calendar_id';             // id calendario destinazione
const TITLE_KEY = 'google_ferie_title';           // template titolo evento ferie
const PERM_TITLE_KEY = 'google_permesso_title';   // template titolo evento permesso
const DEFAULT_TITLE = '{name} (Developer) - Ferie';
const DEFAULT_PERM_TITLE = '{name} (Developer) - Permesso';
const DEFAULT_CAL = 'primary';

// Tag interno per riconoscere SOLO i nostri eventi (mai toccare quelli altrui).
// Il valore distingue il tipo: 'ferie' (all-day) | 'permesso' (a orario).
const TAG_KEY = 'octoshift';
const TAG_VAL = 'ferie';
const TAG_VAL_PERM = 'permesso';

// Pausa pranzo esclusa dai permessi (coerente con computePermissionHours in utils.ts).
const LUNCH_START_MIN = 13 * 60;
const LUNCH_END_MIN = 14 * 60;

export interface GoogleToken {
  refresh_token: string;
  access_token: string;
  expiry: number; // epoch ms
  email: string | null;
  scope: string;
}

/**
 * Base URL usata per costruire il redirect_uri. Deve combaciare ESATTAMENTE con
 * quello registrato su Google Cloud. Dietro proxy (Vercel) req.nextUrl.origin può
 * differire dal dominio pubblico → si preferisce NEXT_PUBLIC_APP_URL se impostata.
 */
export function resolveBaseUrl(originFallback: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  return (configured || originFallback).replace(/\/$/, '');
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
export async function getPermTitleTemplate(): Promise<string> {
  return (await settingsAPI.getSetting(PERM_TITLE_KEY)) || DEFAULT_PERM_TITLE;
}
export async function setPermTitleTemplate(t: string): Promise<void> {
  await settingsAPI.setSetting(PERM_TITLE_KEY, t || DEFAULT_PERM_TITLE);
}

export async function getStatus() {
  const token = await loadToken();
  const calendarId = await getCalendarId();
  const titleTemplate = await getTitleTemplate();
  const permTitleTemplate = await getPermTitleTemplate();
  const hasClient = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  return {
    configured: hasClient,
    connected: Boolean(token?.refresh_token),
    email: token?.email ?? null,
    expiresAt: token ? new Date(token.expiry).toISOString() : null,
    expired: token ? Date.now() >= token.expiry : null,
    calendarId,
    titleTemplate,
    permTitleTemplate,
  };
}

export async function listCalendars(): Promise<Array<{ id: string; summary: string; primary?: boolean; accessRole?: string; writable: boolean }>> {
  const token = await ensureAccessToken();
  // include anche i calendari condivisi con l'account (tutti quelli nella calendarList).
  const data = await gcal('/users/me/calendarList', {}, token.access_token);
  return (data.items || [])
    .map((c: any) => ({
      id: c.id,
      summary: c.summaryOverride || c.summary,
      primary: c.primary,
      accessRole: c.accessRole,          // owner | writer | reader | freeBusyReader
      writable: c.accessRole === 'owner' || c.accessRole === 'writer', // serve scrittura per creare eventi
    }))
    // scrivibili prima, poi il principale in cima tra questi
    .sort((a: any, b: any) =>
      (b.writable ? 1 : 0) - (a.writable ? 1 : 0) ||
      (b.primary ? 1 : 0) - (a.primary ? 1 : 0));
}

function addDaysStr(ds: string, n: number): string {
  const d = new Date(ds + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function weekdayName(ds: string): string {
  return WEEKDAY_NAMES[new Date(ds + 'T12:00:00Z').getUTCDay()];
}

/**
 * Raggruppa date di ferie in blocchi contigui PER IL CALENDARIO.
 * Due giorni di ferie stanno nello stesso evento solo se OGNI giorno intermedio
 * è non-lavorativo (fuori da work_days o festività). Così un Ven+Lun si uniscono
 * (sabato/domenica in mezzo), ma Lun+Gio restano due eventi separati (mar/mer lavorativi).
 */
function groupCalendarVacationBlocks(
  dates: string[],
  workDays: Set<string>,
  holidays: Set<string>,
): string[][] {
  const sorted = [...new Set(dates)].sort();
  const isWorking = (ds: string) => workDays.has(weekdayName(ds)) && !holidays.has(ds);
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const ds of sorted) {
    if (current.length === 0) { current = [ds]; continue; }
    const prev = current[current.length - 1];
    // controlla i giorni strettamente tra prev e ds
    let bridgeable = true;
    let g = addDaysStr(prev, 1);
    while (g < ds) {
      if (isWorking(g)) { bridgeable = false; break; }
      g = addDaysStr(g, 1);
    }
    if (bridgeable) current.push(ds);
    else { blocks.push(current); current = [ds]; }
  }
  if (current.length) blocks.push(current);
  return blocks;
}

interface DesiredEvent {
  key: string;        // octoshiftKey stabile
  tag: string;        // TAG_VAL (ferie) | TAG_VAL_PERM (permesso)
  title: string;
  allDay: boolean;
  // all-day (ferie)
  startDate?: string; // inclusivo
  endDate?: string;   // ESCLUSIVO per Google
  // a orario (permesso)
  startDateTime?: string; // 'YYYY-MM-DDTHH:MM:00' (wall time nel timeZone)
  endDateTime?: string;
  timeZone?: string;
}

/** Estrae "dalle HH:MM alle HH:MM" da una nota permesso. */
function parsePermRange(note: string | null | undefined): { start: string; end: string } | null {
  if (!note) return null;
  const m = note.match(/dalle\s+(\d{1,2}:\d{2})\s+alle\s+(\d{1,2}:\d{2})/i);
  if (!m) return null;
  const pad = (t: string) => (t.length === 4 ? '0' + t : t);
  return { start: pad(m[1]), end: pad(m[2]) };
}

/** Spezza [start,end) escludendo la pausa pranzo 13–14. Ritorna 0, 1 o 2 fasce "HH:MM". */
function segmentsExcludingLunch(start: string, end: string): Array<[string, string]> {
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const toStr = (mn: number) => `${String(Math.floor(mn / 60)).padStart(2, '0')}:${String(mn % 60).padStart(2, '0')}`;
  const s = toMin(start), e = toMin(end);
  if (e <= s) return [];
  const raw: Array<[number, number]> = [];
  if (e <= LUNCH_START_MIN || s >= LUNCH_END_MIN) {
    raw.push([s, e]); // nessuna sovrapposizione con 13–14
  } else {
    if (s < LUNCH_START_MIN) raw.push([s, Math.min(e, LUNCH_START_MIN)]);
    if (e > LUNCH_END_MIN) raw.push([Math.max(s, LUNCH_END_MIN), e]);
  }
  return raw.filter(([a, b]) => b > a).map(([a, b]) => [toStr(a), toStr(b)] as [string, string]);
}

function eventBody(d: DesiredEvent) {
  const priv: Record<string, string> = { [TAG_KEY]: d.tag, octoshiftKey: d.key };
  let start: any, end: any;
  if (d.allDay) {
    start = { date: d.startDate }; end = { date: d.endDate };
  } else {
    start = { dateTime: d.startDateTime, timeZone: d.timeZone };
    end = { dateTime: d.endDateTime, timeZone: d.timeZone };
    // salviamo la wall-time nostra → confronto "invariato" robusto (a prova di offset/DST)
    priv.octoshiftStart = d.startDateTime!;
    priv.octoshiftEnd = d.endDateTime!;
  }
  return {
    summary: d.title, start, end,
    transparency: 'transparent',
    reminders: { useDefault: false, overrides: [] }, // niente notifiche
    extendedProperties: { private: priv },
  };
}

function sameEvent(ev: any, d: DesiredEvent): boolean {
  if (ev.summary !== d.title) return false;
  if (d.allDay) return ev.start?.date === d.startDate && ev.end?.date === d.endDate;
  const p = ev.extendedProperties?.private || {};
  return p.octoshiftStart === d.startDateTime && p.octoshiftEnd === d.endDateTime;
}

/** Reconcile generico: crea/aggiorna/elimina SOLO gli eventi col tag dato. */
async function reconcile(
  calendarId: string, accessToken: string, tag: string,
  desired: Map<string, DesiredEvent>, timeMinDate: string, timeMaxDate: string,
): Promise<{ created: number; updated: number; deleted: number; unchanged: number }> {
  const existing = new Map<string, any>();
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      privateExtendedProperty: `${TAG_KEY}=${tag}`,
      timeMin: `${timeMinDate}T00:00:00Z`,
      timeMax: `${timeMaxDate}T23:59:59Z`,
      showDeleted: 'false', maxResults: '250', singleEvents: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await gcal(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {}, accessToken);
    for (const ev of data.items || []) {
      const k = ev.extendedProperties?.private?.octoshiftKey;
      if (k) existing.set(k, ev);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);

  let created = 0, updated = 0, deleted = 0, unchanged = 0;
  for (const [key, d] of desired) {
    const ev = existing.get(key);
    const body = JSON.stringify(eventBody(d));
    if (!ev) {
      await gcal(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body }, accessToken);
      created++;
    } else if (sameEvent(ev, d)) {
      unchanged++;
    } else {
      await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${ev.id}`, { method: 'PATCH', body }, accessToken);
      updated++;
    }
  }
  for (const [key, ev] of existing) {
    if (!desired.has(key)) {
      await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${ev.id}`, { method: 'DELETE' }, accessToken);
      deleted++;
    }
  }
  return { created, updated, deleted, unchanged };
}

/**
 * Sincronizza FERIE (all-day) e PERMESSI (a orario) su Google Calendar.
 * - Ferie (leave_type='vacation'): raggruppate in eventi all-day per blocco.
 * - Permessi (leave_type='permission'): eventi a orario da leave_note "dalle..alle..",
 *   escludendo la pausa pranzo 13–14 (spezzati in 2 fasce se la attraversano).
 * - Crea/aggiorna/elimina SOLO eventi taggati octoshift ('ferie'|'permesso'); mai altri.
 */
export async function syncFerie(): Promise<{ created: number; updated: number; deleted: number; unchanged: number; total: number }> {
  const token = await ensureAccessToken();
  const calendarId = await getCalendarId();
  const template = await getTitleTemplate();
  const permTemplate = await getPermTitleTemplate();
  const timeZone = await settingsAPI.getTimezone();

  const today = new Date();
  const timeMinDate = formatDate(new Date(today.getTime() - 60 * 86400000));
  const timeMaxDate = formatDate(new Date(today.getTime() + 365 * 86400000));

  const workDays = new Set(await settingsAPI.getWorkDays());
  const holidays = new Set(await settingsAPI.getHolidayDates());

  // ── FERIE (all-day) ────────────────────────────────────────────
  const { data: ferieRows, error: fErr } = await supabase
    .from('shifts')
    .select('user_id, shift_date, users:user_id(full_name)')
    .eq('leave_type', 'vacation')
    .gte('shift_date', timeMinDate).lte('shift_date', timeMaxDate);
  if (fErr) throw new Error(`Lettura ferie fallita: ${fErr.message}`);

  const byUser = new Map<string, string[]>();
  const nameByUser = new Map<string, string>();
  for (const r of ferieRows || []) {
    const uid = (r as any).user_id as string;
    if (!byUser.has(uid)) byUser.set(uid, []);
    byUser.get(uid)!.push((r as any).shift_date);
    const nm = (r as any).users?.full_name;
    if (nm) nameByUser.set(uid, nm);
  }
  const ferieDesired = new Map<string, DesiredEvent>();
  for (const [uid, dates] of byUser) {
    const name = nameByUser.get(uid) ?? 'Dipendente';
    for (const block of groupCalendarVacationBlocks(dates, workDays, holidays)) {
      const startDate = block[0];
      const key = `${uid}:${startDate}`;
      ferieDesired.set(key, {
        key, tag: TAG_VAL, title: template.replace('{name}', name), allDay: true,
        startDate, endDate: addDaysStr(block[block.length - 1], 1),
      });
    }
  }

  // ── PERMESSI (a orario, pausa 13–14 esclusa) ───────────────────
  const { data: permRows, error: pErr } = await supabase
    .from('shifts')
    .select('user_id, shift_date, leave_note, users:user_id(full_name)')
    .eq('leave_type', 'permission')
    .gte('shift_date', timeMinDate).lte('shift_date', timeMaxDate);
  if (pErr) throw new Error(`Lettura permessi fallita: ${pErr.message}`);

  const permDesired = new Map<string, DesiredEvent>();
  for (const r of permRows || []) {
    const range = parsePermRange((r as any).leave_note);
    if (!range) continue; // permesso senza orario nella nota → non sincronizzabile a orario
    const uid = (r as any).user_id as string;
    const date = (r as any).shift_date as string;
    const name = (r as any).users?.full_name ?? 'Dipendente';
    for (const [s, e] of segmentsExcludingLunch(range.start, range.end)) {
      const key = `${uid}:${date}:${s.replace(':', '')}-${e.replace(':', '')}`;
      permDesired.set(key, {
        key, tag: TAG_VAL_PERM, title: permTemplate.replace('{name}', name), allDay: false,
        startDateTime: `${date}T${s}:00`, endDateTime: `${date}T${e}:00`, timeZone,
      });
    }
  }

  const rf = await reconcile(calendarId, token.access_token, TAG_VAL, ferieDesired, timeMinDate, timeMaxDate);
  const rp = await reconcile(calendarId, token.access_token, TAG_VAL_PERM, permDesired, timeMinDate, timeMaxDate);

  const sum = {
    created: rf.created + rp.created,
    updated: rf.updated + rp.updated,
    deleted: rf.deleted + rp.deleted,
    unchanged: rf.unchanged + rp.unchanged,
    total: ferieDesired.size + permDesired.size,
  };
  log.info('syncFerie', 'Sync completata', { ferie: rf, permessi: rp });
  return sum;
}

/**
 * Cancella TUTTI gli eventi creati da questo script (tag octoshift=ferie), su qualsiasi
 * data — usato dal pulsante "Pulisci eventi". Non tocca MAI eventi non taggati (di altri).
 * Nessun filtro temporale: raccoglie tutto il taggato e lo elimina.
 */
export async function purgeFerie(): Promise<{ deleted: number }> {
  const token = await ensureAccessToken();
  const calendarId = await getCalendarId();

  const ids: string[] = [];
  for (const tag of [TAG_VAL, TAG_VAL_PERM]) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        privateExtendedProperty: `${TAG_KEY}=${tag}`,
        showDeleted: 'false',
        maxResults: '250',
        singleEvents: 'true',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const data = await gcal(`/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`, {}, token.access_token);
      for (const ev of data.items || []) {
        // doppia sicurezza: elimina solo se il tag è davvero il nostro
        if (ev.id && ev.extendedProperties?.private?.[TAG_KEY] === tag) ids.push(ev.id);
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }

  let deleted = 0;
  for (const id of ids) {
    await gcal(`/calendars/${encodeURIComponent(calendarId)}/events/${id}`, { method: 'DELETE' }, token.access_token);
    deleted++;
  }

  log.info('purgeFerie', 'Pulizia completata', { deleted });
  return { deleted };
}
