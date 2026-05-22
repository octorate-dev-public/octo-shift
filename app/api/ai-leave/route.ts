import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { AppError } from '@/lib/logger';

// ─── Tipi della richiesta ────────────────────────────────────────────────────

export interface AiLeaveUser {
  id: string;
  name: string;
  role: 'admin' | 'user';
  skillRoles: string[];       // es. ['BACKEND', 'QUALITY']
  teamNames: string[];
  seniorityDate: string;      // YYYY-MM-DD
  seniorityYears: number;
  isActive: boolean;
}

export interface AiLeaveEntry {
  userId: string;
  userName: string;
  date: string;               // YYYY-MM-DD
  type: 'vacation' | 'permission' | 'sick';
  note?: string;
}

export interface AiLeaveUserStats {
  userId: string;
  userName: string;
  skillRoles: string[];
  teamNames: string[];
  seniorityYears: number;
  vacationDays: number;       // totale ferie anno
  permissionDays: number;     // totale permessi anno
  sickDays: number;
  vacationBlocks: number;     // blocchi distinti di ferie consecutive
  longestBlock: number;       // blocco più lungo in giorni
  monthDistribution: number[];// [0..11] quante ferie per mese
  lastVacationDate: string | null;
  firstVacationDate: string | null;
}

export interface AiLeaveRequest {
  year: number;
  today: string;              // YYYY-MM-DD
  vacationAllowanceDays: number; // limite ferie annuale (default 26)
  users: AiLeaveUser[];
  leaves: AiLeaveEntry[];
  userStats: AiLeaveUserStats[];
  userPrompt?: string;
}

// ─── Risposta ────────────────────────────────────────────────────────────────

import type { AiLeaveSuggestion } from '@/types';
export type { AiLeaveSuggestion } from '@/types';

// ─── Costruzione prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(year: number, vacationAllowance: number): string {
  return `Sei un HR analyst esperto che analizza i dati di ferie e permessi di un team di sviluppo software.
Anno analizzato: ${year}. Limite ferie annuale per dipendente: ${vacationAllowance} giorni lavorativi.

COSA DEVI ANALIZZARE (in ordine di priorità):

1. SFORAMENTO FERIE (severity: high)
   - Chi ha già superato o rischia di superare i ${vacationAllowance} giorni di ferie nell'anno?
   - Considera anche ferie future pianificate.

2. CONCENTRAZIONE/COPERTURA DEL TEAM (severity: high/medium)
   - Ci sono periodi (settimane/mesi) in cui più persone dello stesso team o skill sono assenti contemporaneamente?
   - Periodi critici: agosto, dicembre, festività.
   - Valuta la copertura per ruolo tecnico (BACKEND, FRONTEND, QUALITY, ecc.).

3. EQUITÀ TRA COLLEGHI (severity: medium)
   - Chi ha preso molte ferie rispetto alla media? Chi quasi nessuna?
   - Considera la seniority: i senior tendono ad avere più ferie maturate.
   - Confronta dipendenti con stessa skill/team.

4. PATTERN ANOMALI (severity: medium/low)
   - Ferie sempre concentrate in uno stesso periodo (es. solo agosto).
   - Blocchi di ferie molto lunghi (>15 giorni consecutivi).

4b. BURNOUT / TUTELA DEL DIPENDENTE (severity: high/medium) — POLICY OBBLIGATORIA
   Analizza i PERIODI CRITICI di recupero sotto. Per ciascuno, verifica chi
   NON ha preso nemmeno un giorno di ferie in quel periodo.

   NOTA SUI PERMESSI — AMMORTIZZATORE BURNOUT:
   I permessi brevi (dalla sezione "PERMESSI BREVI PER DIPENDENTE") attenuano
   il rischio burnout perché rappresentano micro-pause fuori ufficio.
   Regola di conversione: ogni 4 permessi ≈ 1 giorno di ferie equivalente.
   Applica questo aggiustamento PRIMA di classificare la severity:
   - Chi ha 0 ferie ma ≥8 permessi nell'anno → considera come se avesse
     ~2 giorni ferie equivalenti (abbassa la severity da high a medium).
   - Chi ha 0 ferie ma ≥16 permessi → ~4 giorni equiv. → severity medium/low,
     ma segnala comunque che non ha blocchi di recupero continuativi.
   - Chi ha pochi giorni in un periodo critico (es. 1–2 ferie in estate) ma
     ha preso ≥4 permessi nello stesso mese → considera il periodo parzialmente
     coperto (non emettere avviso per quel periodo specifico).
   In tutti i casi, nella description specifica sempre sia le ferie effettive
   che i permessi: es. "Mario: 2 ferie + 10 permessi (≈4.5gg equiv.)".

   PERIODI CRITICI (${year}):
   • Estate: 1 luglio – 31 agosto
   • Natale/Capodanno: 23 dicembre – 6 gennaio ${year + 1}
   • Pasqua: ±3 giorni lavorativi intorno al lunedì di Pasqua
   • Ponti principali: 25 aprile, 1° maggio, 2 giugno (±1 giorno lavorativo)

   POLICY DI TUTELA (dopo aggiustamento permessi):
   a) Chi ha 0 ferie + 0 permessi nell'intero anno (severity: high) → avviso
      esplicito + suggerisci i periodi migliori in base alla copertura del team.
   b) Chi ha saltato TUTTI i periodi critici (né estate né natale) e ha meno
      della metà della media ferie+equiv. dei colleghi → severity high.
   c) Chi ha saltato 1 solo periodo critico ma ha comunque poche assenze totali
      (<30% della dotazione, permessi inclusi) → severity medium.
   d) Chi non prende né ferie né permessi da più di 90 giorni consecutivi
      (data odierna ${new Date().toISOString().split('T')[0]}) → severity medium.

   SUGGERIMENTO PERIODI:
   Quando un dipendente non ha ferie o ha saltato periodi critici, popola il
   campo "suggestedPeriods" con 2–4 finestre specifiche in cui:
   - Il team ha MENO sovrapposizioni (bassa presenza nella sezione 3+ assenti).
   - Il dipendente non ha già ferie pianificate.
   - Preferisci finestre che includono festività (recupero più efficiente).
   Esempio: ["1–15 agosto (team scarico)", "23 dic – 3 gen (periodo festivo)"].
   Se non c'è alcuna finestra libera, dì esplicitamente perché.

5. PERMESSI (severity: low/info)
   - Abuso di permessi brevi frequenti? (es. >8 permessi nell'anno)
   - Permessi concentrati in certi giorni della settimana? Usa la sezione
     "PERMESSI BREVI PER DIPENDENTE" che include data e giorno (Lun/Ven/ecc.):
     pattern come "sempre Lun o Ven" suggeriscono long weekend sistematici.
   - Permessi back-to-back (più permessi in settimane consecutive).

6. PREVISIONI (severity: low/info)
   - Se continua il ritmo attuale, chi finirà le ferie prima di fine anno?
   - Chi arriverà a fine anno con molte ferie non usufruite?

FORMATO RISPOSTA:
Rispondi ESCLUSIVAMENTE con JSON valido, senza markdown:
{
  "suggestions": [
    {
      "id": "1",
      "severity": "high",
      "category": "overflow",
      "title": "Titolo breve e specifico",
      "description": "Descrizione dettagliata con nomi, numeri e suggerimento pratico per l'HR.",
      "affectedUsers": ["Nome Cognome 1", "Nome Cognome 2"],
      "suggestedPeriods": []
    },
    {
      "id": "2",
      "severity": "high",
      "category": "burnout",
      "title": "Nessuna ferie presa nell'anno",
      "description": "Mario Rossi non ha ancora preso nessun giorno di ferie nel ${year}. Rischio burnout elevato. Il team è meno affollato in agosto e tra Natale e Capodanno.",
      "affectedUsers": ["Mario Rossi"],
      "suggestedPeriods": ["1–15 agosto (team scarico)", "27 dic – 3 gen (periodo festivo)"]
    }
  ]
}

CATEGORIE VALIDE: overflow, equity, coverage, pattern, anomaly, burnout, info
VINCOLI:
- Produci da 4 a 12 suggerimenti, ordinati per severity decrescente.
- Sii specifico: cita nomi, numeri di giorni, date, periodi.
- Se i dati non mostrano anomalie reali per una categoria, omettila (non inventare problemi).
- Ogni suggerimento burnout DEVE includere suggestedPeriods (array non vuoto) se esistono finestre libere.
- Il tono è professionale e costruttivo, non giudicante.`;
}

function buildUserMessage(req: AiLeaveRequest): string {
  const lines: string[] = [
    `DATA ODIERNA: ${req.today}`,
    `ANNO: ${req.year} — Limite ferie: ${req.vacationAllowanceDays}gg lavorativi per dipendente`,
    ``,
    `## DIPENDENTI ATTIVI`,
  ];

  for (const u of req.users.filter((u) => u.isActive)) {
    const stats = req.userStats.find((s) => s.userId === u.id);
    const skillStr = u.skillRoles.length > 0 ? u.skillRoles.join('+') : 'n/d';
    const teamStr  = u.teamNames.length > 0 ? u.teamNames.join('+') : 'n/d';
    const vacDays  = stats?.vacationDays ?? 0;
    const permDays = stats?.permissionDays ?? 0;
    const sickDays = stats?.sickDays ?? 0;
    const blocks   = stats?.vacationBlocks ?? 0;
    const longest  = stats?.longestBlock ?? 0;
    const monthDist = stats?.monthDistribution ?? [];
    const monthStr = monthDist
      .map((v, i) => (v > 0 ? `${['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][i]}:${v}` : ''))
      .filter(Boolean)
      .join(' ');

    lines.push(
      `- ${u.name} | skill:${skillStr} | team:${teamStr} | anzianità:${u.seniorityYears}a | ` +
      `ferie:${vacDays}gg (${blocks} blocchi, max ${longest}gg) | permessi:${permDays}gg | malattia:${sickDays}gg` +
      (monthStr ? ` | distribuzione:${monthStr}` : '') +
      (stats?.lastVacationDate ? ` | ultima_ferie:${stats.lastVacationDate}` : ''),
    );
  }

  // Periodi di concentrazione: cerca settimane con più assenti
  const absenceByDate = new Map<string, string[]>();
  for (const l of req.leaves) {
    if (l.type !== 'vacation') continue;
    if (!absenceByDate.has(l.date)) absenceByDate.set(l.date, []);
    absenceByDate.get(l.date)!.push(l.userName);
  }
  const crowdedDays = [...absenceByDate.entries()]
    .filter(([, names]) => names.length >= 3)
    .sort((a, b) => b[1].length - a[1].length)
    .slice(0, 20);

  if (crowdedDays.length > 0) {
    lines.push(``, `## GIORNI CON 3+ PERSONE IN FERIE CONTEMPORANEAMENTE`);
    for (const [date, names] of crowdedDays) {
      lines.push(`- ${date}: ${names.join(', ')} (${names.length} assenti)`);
    }
  }

  // Permessi individuali per utente (per analisi pattern giorno-settimana e abuso)
  const DAYS_IT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
  const permByUser = new Map<string, { name: string; entries: string[] }>();
  for (const l of req.leaves) {
    if (l.type !== 'permission') continue;
    if (!permByUser.has(l.userId)) permByUser.set(l.userId, { name: l.userName, entries: [] });
    const dow = DAYS_IT[new Date(l.date).getDay()];
    const entry = l.note ? `${l.date}(${dow}) [${l.note}]` : `${l.date}(${dow})`;
    permByUser.get(l.userId)!.entries.push(entry);
  }
  if (permByUser.size > 0) {
    lines.push(``, `## PERMESSI BREVI PER DIPENDENTE (formato: data(giorno) [nota])`);
    for (const { name, entries } of permByUser.values()) {
      lines.push(`- ${name}: ${entries.join(', ')}`);
    }
  }

  // Malattie individuali per utente (per analisi pattern e durata)
  const sickByUser = new Map<string, { name: string; dates: string[] }>();
  for (const l of req.leaves) {
    if (l.type !== 'sick') continue;
    if (!sickByUser.has(l.userId)) sickByUser.set(l.userId, { name: l.userName, dates: [] });
    sickByUser.get(l.userId)!.dates.push(l.date);
  }
  if (sickByUser.size > 0) {
    lines.push(``, `## MALATTIE PER DIPENDENTE`);
    for (const { name, dates } of sickByUser.values()) {
      lines.push(`- ${name}: ${dates.join(', ')}`);
    }
  }

  if (req.userPrompt?.trim()) {
    lines.push(``, `## ISTRUZIONI AGGIUNTIVE HR`, req.userPrompt.trim());
  }

  return lines.join('\n');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const POST = withHandler('api/ai-leave', 'POST', async (req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "Chiave API Anthropic non configurata. Aggiungi ANTHROPIC_API_KEY alle variabili d'ambiente.",
      { code: 'AI_KEY_MISSING', httpStatus: 503 },
    );
  }

  const body = await parseBody<AiLeaveRequest>(req);
  if (!body.year || !body.today || !Array.isArray(body.users)) {
    throw new AppError('Dati mancanti nella richiesta AI ferie', { code: 'INVALID_REQUEST', httpStatus: 400 });
  }

  const systemPrompt = buildSystemPrompt(body.year, body.vacationAllowanceDays ?? 26);
  const userMessage  = buildUserMessage(body);

  const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!anthropicResponse.ok) {
    const errText = await anthropicResponse.text().catch(() => 'unknown');
    throw new AppError(`Errore Anthropic API: ${anthropicResponse.status} – ${errText}`, {
      code: 'AI_API_ERROR',
      httpStatus: 502,
    });
  }

  const anthropicData = await anthropicResponse.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = anthropicData.content?.find((c) => c.type === 'text')?.text ?? '';

  let suggestions: AiLeaveSuggestion[] = [];
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Nessun JSON trovato');
    const parsed = JSON.parse(jsonMatch[0]) as { suggestions?: AiLeaveSuggestion[] };
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  } catch (parseErr) {
    throw new AppError(
      `Risposta AI non valida: ${parseErr instanceof Error ? parseErr.message : 'JSON malformato'}`,
      { code: 'AI_PARSE_ERROR', httpStatus: 502 },
    );
  }

  return jsonOk({ suggestions });
});
