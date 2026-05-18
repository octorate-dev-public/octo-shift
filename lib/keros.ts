/**
 * KEROS HR Client — evo.cronos.eu/gruppobuffetti
 *
 * Flusso:
 *  1. GET /servlet/hlogin          → estrai GXState
 *  2. POST /servlet/hlogin          → login, ottieni sessione cookie
 *  3. GET /servlet/hgestrautorresp  → estrai nuovo GXState
 *  4. POST /servlet/hgestrautorresp?0,,,,0 → cerca autorizzazioni
 *  5. Parsa HTML → estrai righe griglia
 *
 * Credenziali da variabili d'ambiente:
 *   KEROS_USERNAME  (es. TAIETTA.DEVIN)
 *   KEROS_PASSWORD
 */

import { createLogger } from './logger';

const log = createLogger('keros');

const BASE = 'https://evo.cronos.eu/gruppobuffetti';

// ─── Tipi ────────────────────────────────────────────────────────────────────

export type KerosLeaveType = 'vacation' | 'permission';

export interface KerosEntry {
  matricola: string;
  nominativo: string;          // "NOVELLI GIANMARCO"
  tipoRichiesta: string;       // "ASSENZA" | "TIMBRATURA" | ...
  dataInizio: string;          // "14/05/2026"
  dataFine: string;            // "14/05/2026"
  situazione: string;          // "IN SOSPESO" | "APPROVATA" | ...
  descrizione: string;         // "FERIE METALMECCANICO" | "RICHIESTA ROL" | ...
  causalizzazione: string;     // "FERM" | "ROL"
  leaveType: KerosLeaveType | null;
}

export interface KerosFilters {
  /** A=Assenza, B=Timbratura, Z=Tutti. Default: A */
  tipo?: 'A' | 'B' | 'Z';
  /** 1=In sospeso, 2=Approvata, 3=Rifiutata, 9=Tutte. Default: 2 */
  situazione?: '1' | '2' | '3' | '4' | '9';
  /** DD/MM/YYYY */
  dataInizio?: string;
  /** DD/MM/YYYY */
  dataFine?: string;
  /** Cognome libero */
  cognome?: string;
  /** Matricola */
  matricola?: string;
}

// ─── Cookie Jar minimalista ───────────────────────────────────────────────────

class CookieJar {
  private jar = new Map<string, string>();

  update(headers: Headers): void {
    let raw: string[] = [];
    // Node 18+ espone getSetCookie() che gestisce header multipli
    if (typeof (headers as any).getSetCookie === 'function') {
      raw = (headers as any).getSetCookie() as string[];
    } else {
      const single = headers.get('set-cookie');
      if (single) raw = [single];
    }
    for (const cookie of raw) {
      const [nameVal] = cookie.split(';');
      const eqIdx = nameVal.indexOf('=');
      if (eqIdx < 1) continue;
      const name = nameVal.slice(0, eqIdx).trim();
      const value = nameVal.slice(eqIdx + 1).trim();
      if (name) this.jar.set(name, value);
    }
  }

  header(): string {
    return Array.from(this.jar.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
}

// ─── Utility HTML ─────────────────────────────────────────────────────────────

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/** Estrae il valore dell'input[name=GXState] dall'HTML. */
function extractGXState(html: string): string {
  // Cerca name="GXState" oppure name='GXState' con valore dopo
  const patterns = [
    /name=["']GXState["'][^>]+?value=["']([\s\S]*?)["']\s*(?:\/>|>)/i,
    /value=["']([\s\S]*?)["']\s*name=["']GXState["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeHtmlEntities(m[1]);
  }
  // Fallback: cerca il blocco esplicito
  const idx = html.indexOf('name="GXState"');
  if (idx < 0) return '{}';
  const valStart = html.indexOf('value="', idx);
  if (valStart < 0) return '{}';
  const valEnd = html.indexOf('"', valStart + 7);
  if (valEnd < 0) return '{}';
  return decodeHtmlEntities(html.slice(valStart + 7, valEnd));
}

/** Estrae il testo da un frammento HTML di cella TD. */
function cellText(tdInner: string): string {
  return tdInner
    .replace(/<input[^>]*>/gi, '')  // rimuove checkbox
    .replace(/<[^>]+>/g, '')         // rimuove tutti i tag
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

// ─── Parser griglia KEROS ─────────────────────────────────────────────────────

/**
 * GeneXus renderizza le righe del grid come <tr> con ~32 <td>.
 * Colonne (0-based index):
 *   6  = Matricola
 *   8  = Nominativo
 *   9  = Tipo richiesta
 *   10 = Data inizio
 *   11 = Data fine
 *   12 = Situazione
 *   16 = Descrizione
 *   26 = Causalizzazione
 */
function parseGrid(html: string): KerosEntry[] {
  const entries: KerosEntry[] = [];

  // Trova tutte le <tr>...</tr>
  const trRe = /<tr[\s>][\s\S]*?<\/tr>/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRe.exec(html)) !== null) {
    const trHtml = trMatch[0];

    // Estrai tutte le <td>
    const cells: string[] = [];
    const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch: RegExpExecArray | null;
    while ((tdMatch = tdRe.exec(trHtml)) !== null) {
      cells.push(cellText(tdMatch[1]));
    }

    // Le righe dati hanno almeno 27 colonne
    if (cells.length < 27) continue;

    const tipo = (cells[9] || '').toUpperCase();

    // Considera solo assenze
    if (!tipo.includes('ASSENZ')) continue;

    const dataInizio = cells[10]?.trim() || '';
    const dataFine = cells[11]?.trim() || '';

    // Dati minimi indispensabili
    if (!dataInizio || !dataFine) continue;

    const causalizzazione = (cells[26] || '').trim().toUpperCase();

    let leaveType: KerosLeaveType | null = null;
    if (causalizzazione === 'FERM') leaveType = 'vacation';
    else if (causalizzazione === 'ROL') leaveType = 'permission';

    entries.push({
      matricola: cells[6]?.trim() || '',
      nominativo: cells[8]?.trim() || '',
      tipoRichiesta: tipo,
      dataInizio,
      dataFine,
      situazione: cells[12]?.trim() || '',
      descrizione: cells[16]?.trim() || '',
      causalizzazione,
      leaveType,
    });
  }

  return entries;
}

// ─── Data utils ──────────────────────────────────────────────────────────────

/** DD/MM/YYYY → YYYY-MM-DD */
export function kerosDateToIso(d: string): string | null {
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** YYYY-MM-DD → DD/MM/YYYY */
export function isoToKerosDate(d: string): string {
  const [y, mo, day] = d.split('-');
  return `${day}/${mo}/${y}`;
}

/** Restituisce tutti i giorni lavorativi (lun-ven) tra due date ISO inclusive. */
export function workdaysInRange(startIso: string, endIso: string): string[] {
  const dates: string[] = [];
  const cur = new Date(startIso + 'T00:00:00');
  const end = new Date(endIso + 'T00:00:00');

  while (cur <= end) {
    const dow = cur.getDay();
    if (dow !== 0 && dow !== 6) {
      const y = cur.getFullYear();
      const mo = String(cur.getMonth() + 1).padStart(2, '0');
      const d = String(cur.getDate()).padStart(2, '0');
      dates.push(`${y}-${mo}-${d}`);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

/** Normalizza un token: minuscolo, senza accenti, senza punti. */
function normalizeToken(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // rimuove diacritici
    .replace(/\./g, '')              // rimuove punti ("N." → "N")
    .trim();
}

/** Tokenizza e normalizza un nome completo. */
function nameTokens(name: string): string[] {
  return name
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean);
}

/**
 * Abbina un nominativo KEROS ("NOVELLI GIANMARCO") a un utente Supabase
 * che potrebbe avere il nome troncato ("Gianmarco N.").
 *
 * Strategia (in ordine di priorità):
 *  1. Match esatto (token ordinati uguali)  — es. "Mario Rossi" ↔ "ROSSI MARIO"
 *  2. Match per iniziale/prefisso           — es. "Gianmarco N." ↔ "NOVELLI GIANMARCO"
 *     Ogni token del nome Supabase deve essere prefisso di un token KEROS.
 *     Almeno un token deve essere uguale (non solo iniziale) per evitare falsi positivi.
 */
export function matchUserByKerosName(
  kerosName: string,
  users: { id: string; full_name: string }[],
): string | null {
  const kTokens = nameTokens(kerosName).sort();

  // 1. Match esatto
  for (const u of users) {
    const uTokens = nameTokens(u.full_name).sort();
    if (uTokens.join(' ') === kTokens.join(' ')) return u.id;
  }

  // 2. Match per iniziale/prefisso
  //    Ogni token utente deve essere prefisso (o uguale) di qualche token KEROS.
  //    Almeno un token utente deve corrispondere esattamente (non solo iniziale).
  for (const u of users) {
    const uTokens = nameTokens(u.full_name);
    if (uTokens.length === 0) continue;

    const allPrefixMatch = uTokens.every((ut) =>
      kTokens.some((kt) => kt === ut || kt.startsWith(ut)),
    );
    const hasExactMatch = uTokens.some((ut) =>
      kTokens.some((kt) => kt === ut),
    );

    if (allPrefixMatch && hasExactMatch) return u.id;
  }

  return null;
}

// ─── KerosClient ─────────────────────────────────────────────────────────────

export class KerosClient {
  private jar = new CookieJar();

  private async req(url: string, init: RequestInit = {}): Promise<Response> {
    const cookieHeader = this.jar.header();
    const headers: HeadersInit = {
      'User-Agent': 'Mozilla/5.0 (compatible; OctoShift/1.0)',
      Accept: 'text/html,application/xhtml+xml',
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...(init.headers || {}),
    };
    const res = await fetch(url, { ...init, headers, redirect: 'follow' });
    this.jar.update(res.headers);
    return res;
  }

  /**
   * Autentica sulla piattaforma KEROS.
   * Log dettagliato ad ogni step — in caso di ko spiega il motivo esatto.
   */
  async login(username: string, password: string): Promise<void> {
    log.info('login', `[KEROS 1/2] Inizio autenticazione per utente "${username}"`);

    // ── Step 1: GET pagina login ──────────────────────────────────────────────
    log.info('login', `[KEROS 1/2 · step 1] GET ${BASE}/servlet/hlogin`);
    let loginPage: Response;
    try {
      loginPage = await this.req(`${BASE}/servlet/hlogin`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('login', '[KEROS 1/2 · step 1] NETWORK ERROR — impossibile raggiungere il server KEROS', new Error(msg));
      throw new Error(`Errore di rete verso KEROS: ${msg}. Verifica che il server sia raggiungibile.`);
    }

    log.info('login', `[KEROS 1/2 · step 1] Risposta HTTP ${loginPage.status} ${loginPage.statusText}`);
    if (!loginPage.ok) {
      log.error('login', `[KEROS 1/2 · step 1] KO — status ${loginPage.status}`, new Error(`HTTP ${loginPage.status}`));
      throw new Error(`Pagina login KEROS non disponibile (HTTP ${loginPage.status}). Il servizio potrebbe essere in manutenzione.`);
    }

    const loginHtml = await loginPage.text();
    log.info('login', `[KEROS 1/2 · step 1] HTML ricevuto (${loginHtml.length} byte)`);

    const gxState = extractGXState(loginHtml);
    if (!gxState || gxState === '{}') {
      log.error('login', '[KEROS 1/2 · step 1] KO — GXState non trovato nell\'HTML', new Error('missing GXState'));
      log.info('login', `[DEBUG] Primi 500 char HTML: ${loginHtml.slice(0, 500)}`);
      throw new Error('GXState non trovato nella pagina di login KEROS. La struttura della pagina potrebbe essere cambiata.');
    }
    log.info('login', `[KEROS 1/2 · step 1] GXState estratto (${gxState.length} byte) ✓`);

    // ── Step 2: POST credenziali ──────────────────────────────────────────────
    log.info('login', `[KEROS 1/2 · step 2] POST credenziali per "${username}"`);
    const body = new URLSearchParams({
      vUSER1: username,
      vPASSWORD: password,
      LOGINENTER: '',
      vBLNINSTALLATO: '',
      GXState: gxState,
    });

    let loginRes: Response;
    try {
      loginRes = await this.req(`${BASE}/servlet/hlogin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('login', '[KEROS 1/2 · step 2] NETWORK ERROR durante il POST login', new Error(msg));
      throw new Error(`Errore di rete durante il login KEROS: ${msg}`);
    }

    log.info('login', `[KEROS 1/2 · step 2] Risposta HTTP ${loginRes.status} (dopo redirect: ${loginRes.url})`);

    const loginResHtml = await loginRes.text();
    log.info('login', `[KEROS 1/2 · step 2] HTML risposta (${loginResHtml.length} byte)`);

    // Diagnosi dettagliata del fallimento login
    if (loginResHtml.includes('vUSER1') && loginResHtml.includes('vPASSWORD')) {
      // Il server ha restituito di nuovo il form di login → credenziali errate
      // Cerca messaggi di errore noti nell'HTML
      const errorPatterns = [
        { pattern: /password.*errat/i, msg: 'Password errata' },
        { pattern: /utente.*non.*trov/i, msg: 'Utente non trovato' },
        { pattern: /account.*blocc/i, msg: 'Account bloccato' },
        { pattern: /accesso.*negat/i, msg: 'Accesso negato' },
        { pattern: /credenziali.*non.*valid/i, msg: 'Credenziali non valide' },
        { pattern: /error/i, msg: 'Errore generico' },
      ];

      let detectedReason = 'Credenziali non valide (il server ha restituito nuovamente il form di login)';
      for (const { pattern, msg } of errorPatterns) {
        if (pattern.test(loginResHtml)) {
          detectedReason = msg;
          break;
        }
      }

      log.error('login', `[KEROS 1/2 · step 2] KO — login fallito: ${detectedReason}`, new Error('login_failed'));
      log.info('login', `[DEBUG] URL finale dopo redirect: ${loginRes.url}`);
      log.info('login', `[DEBUG] Cookies presenti: ${this.jar.header().slice(0, 200)}`);
      throw new Error(`Login KEROS fallito: ${detectedReason}. Verifica username ("${username}") e password in Admin → Impostazioni.`);
    }

    // Verifica che la sessione sia stata stabilita correttamente
    const cookies = this.jar.header();
    if (!cookies) {
      log.warn('login', '[KEROS 1/2 · step 2] ⚠️ Nessun cookie ricevuto dopo login — la sessione potrebbe non essere valida');
    } else {
      log.info('login', `[KEROS 1/2 · step 2] Cookie di sessione ricevuti: ${cookies.split(';').length} cookie ✓`);
    }

    log.info('login', `[KEROS 1/2 · step 2] Login riuscito ✓ — URL post-login: ${loginRes.url}`);
  }

  /**
   * Recupera le autorizzazioni (ferie/permessi) dalla pagina responsabile.
   */
  async fetchLeaves(filters: KerosFilters = {}): Promise<KerosEntry[]> {
    log.info('fetchLeaves', '[KEROS 2/2] Inizio recupero autorizzazioni', { filters });

    // ── Step 3: GET pagina autorizzazioni ─────────────────────────────────────
    log.info('fetchLeaves', `[KEROS 2/2 · step 3] GET ${BASE}/servlet/hgestrautorresp`);
    let authPage: Response;
    try {
      authPage = await this.req(`${BASE}/servlet/hgestrautorresp`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('fetchLeaves', '[KEROS 2/2 · step 3] NETWORK ERROR', new Error(msg));
      throw new Error(`Errore di rete recuperando la pagina autorizzazioni: ${msg}`);
    }

    log.info('fetchLeaves', `[KEROS 2/2 · step 3] HTTP ${authPage.status} — URL: ${authPage.url}`);
    if (!authPage.ok) {
      log.error('fetchLeaves', `[KEROS 2/2 · step 3] KO — HTTP ${authPage.status}`, new Error(`HTTP ${authPage.status}`));
      throw new Error(`Pagina autorizzazioni KEROS non disponibile (HTTP ${authPage.status}). La sessione potrebbe essere scaduta.`);
    }

    const authHtml = await authPage.text();
    log.info('fetchLeaves', `[KEROS 2/2 · step 3] HTML ricevuto (${authHtml.length} byte)`);

    // Controlla se siamo stati reindirizzati al login (sessione scaduta)
    if (authHtml.includes('vUSER1') && authHtml.includes('vPASSWORD')) {
      log.error('fetchLeaves', '[KEROS 2/2 · step 3] KO — reindirizzato al login, sessione non stabilita', new Error('session_invalid'));
      throw new Error('La sessione KEROS non è stata stabilita correttamente. Il login potrebbe essere fallito silenziosamente.');
    }

    const rawGxState = extractGXState(authHtml);
    if (!rawGxState || rawGxState === '{}') {
      log.error('fetchLeaves', '[KEROS 2/2 · step 3] KO — GXState non trovato', new Error('missing GXState'));
      log.info('fetchLeaves', `[DEBUG] Primi 300 char HTML: ${authHtml.slice(0, 300)}`);
      throw new Error('GXState non trovato nella pagina autorizzazioni KEROS. Struttura pagina inaspettata.');
    }
    log.info('fetchLeaves', `[KEROS 2/2 · step 3] GXState estratto ✓`);

    // ── Step 4: modifica GXState con evento Cerca ─────────────────────────────
    log.info('fetchLeaves', '[KEROS 2/2 · step 4] Impostazione evento EENTER_MPAGE nel GXState');
    let gx: Record<string, unknown>;
    try {
      gx = JSON.parse(rawGxState);
    } catch (err: unknown) {
      log.error('fetchLeaves', '[KEROS 2/2 · step 4] KO — GXState non è JSON valido', new Error(String(err)));
      log.info('fetchLeaves', `[DEBUG] GXState raw (primi 200 char): ${rawGxState.slice(0, 200)}`);
      throw new Error('GXState KEROS non è JSON valido. La struttura della pagina potrebbe essere cambiata.');
    }
    gx['_EventName'] = 'EENTER_MPAGE.';
    gx['_EventGridId'] = '';
    gx['_EventRowId'] = '';
    const gxState = JSON.stringify(gx);
    log.info('fetchLeaves', `[KEROS 2/2 · step 4] GXState aggiornato con _EventName="EENTER_MPAGE." ✓`);

    // Data corrente per W0003vDATINISETTIMANA
    const today = new Date();
    const todayStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    // ── Step 5: POST ricerca ─────────────────────────────────────────────────
    log.info('fetchLeaves', `[KEROS 2/2 · step 5] POST ricerca — filtri: tipo=${filters.tipo || 'A'}, situazione=${filters.situazione || '2'}, da=${filters.dataInizio || 'tutti'}, a=${filters.dataFine || 'tutti'}`);
    const params = new URLSearchParams({
      vSTROPZIONESEARCH_MPAGE: '',
      MPGridmenuContainerDataV: '[]',
      MPLinksContainerDataV: '[["","","Home Keros","","->"],["","","Gestione autorizzazioni responsabile","",""]]',
      W0003vSTRRICERCA: '',
      W0003vSTRCODICE: filters.matricola || '',
      W0003vSTRDESCRI: filters.cognome || '',
      W0003vRAUTORSITUAZ: filters.situazione || '2',   // 2=Approvata di default
      W0003vRAUTORFLAGVAR: 'Z',
      W0003vRAUTORDATIMMDA: '          ',
      W0003vRAUTORDATIMMA: '          ',
      W0003vRAUTORTIPO: filters.tipo || 'A',             // A=Assenza di default
      W0003vRAUTORDADATA: filters.dataInizio || '          ',
      W0003vRAUTORADATA: filters.dataFine || '          ',
      W0003vSTRSELPGMCODICE: '',
      W0003vRAUTORDATVALIDITA: '          ',
      W0003vRAUTORMODINS: '3',
      W0003vANADIPCODICE: '',
      W0003vNUMTIPOINSERIMENTO: '0',
      W0003vSTRTIPOINSERIMENTO: 'A',
      W0003vDATINISETTIMANA: todayStr,
      W0003vNUMSITUAZIONE: '1',
      GXState: gxState,
    });

    // 30 campi STORICI vuoti (richiesti dal form GeneXus)
    for (let i = 1; i <= 30; i++) {
      params.set(`W0003vSTRAUTORSTORICIZ_${String(i).padStart(4, '0')}`, '');
    }

    let searchRes: Response;
    try {
      searchRes = await this.req(`${BASE}/servlet/hgestrautorresp?0,,,,0`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error('fetchLeaves', '[KEROS 2/2 · step 5] NETWORK ERROR durante il POST ricerca', new Error(msg));
      throw new Error(`Errore di rete durante la ricerca KEROS: ${msg}`);
    }

    log.info('fetchLeaves', `[KEROS 2/2 · step 5] HTTP ${searchRes.status} — URL: ${searchRes.url}`);

    if (!searchRes.ok) {
      log.error('fetchLeaves', `[KEROS 2/2 · step 5] KO — HTTP ${searchRes.status}`, new Error(`HTTP ${searchRes.status}`));
      throw new Error(`Ricerca KEROS fallita (HTTP ${searchRes.status}).`);
    }

    const searchHtml = await searchRes.text();
    log.info('fetchLeaves', `[KEROS 2/2 · step 5] HTML risposta ricevuto (${searchHtml.length} byte)`);

    // Controlla se la sessione è scaduta durante la ricerca
    if (searchHtml.includes('vUSER1') && searchHtml.includes('vPASSWORD')) {
      log.error('fetchLeaves', '[KEROS 2/2 · step 5] KO — sessione scaduta, reindirizzato al login', new Error('session_expired'));
      throw new Error('Sessione KEROS scaduta durante la ricerca. Riprova.');
    }

    // ── Step 6: parsing griglia ───────────────────────────────────────────────
    log.info('fetchLeaves', '[KEROS 2/2 · step 6] Parsing griglia HTML…');
    const entries = parseGrid(searchHtml);

    // Log riepilogo per tipo
    const vacation = entries.filter(e => e.leaveType === 'vacation').length;
    const permission = entries.filter(e => e.leaveType === 'permission').length;
    const unrecognized = entries.filter(e => e.leaveType === null).length;

    log.info('fetchLeaves',
      `[KEROS 2/2 · step 6] Parsing completato ✓ — ` +
      `${entries.length} assenze totali: ${vacation} ferie (FERM), ${permission} ROL, ${unrecognized} non riconosciute`,
    );

    if (entries.length === 0) {
      log.warn('fetchLeaves',
        '[KEROS 2/2 · step 6] Nessuna riga estratta. Possibili cause: ' +
        'nessuna assenza nel periodo, struttura HTML cambiata, o filtri troppo restrittivi.',
      );
      log.info('fetchLeaves', `[DEBUG] Numero di <tr> nell'HTML: ${(searchHtml.match(/<tr/gi) || []).length}`);
    }

    if (unrecognized > 0) {
      const unknownCausal = [...new Set(entries.filter(e => !e.leaveType).map(e => e.causalizzazione))];
      log.warn('fetchLeaves',
        `[KEROS 2/2 · step 6] ${unrecognized} assenze con causalizzazione non riconosciuta: [${unknownCausal.join(', ')}]. ` +
        `Solo FERM (ferie) e ROL (permessi) vengono importati.`,
      );
    }

    return entries;
  }
}
