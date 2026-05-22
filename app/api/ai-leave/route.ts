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
   - Dipendenti che non hanno preso ferie da mesi (rischio burnout).
   - Ferie sempre concentrate in uno stesso periodo (es. solo agosto).
   - Blocchi di ferie molto lunghi (>15 giorni consecutivi).

5. PERMESSI (severity: low/info)
   - Abuso di permessi brevi frequenti?
   - Permessi concentrati in certi giorni della settimana?

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
      "affectedUsers": ["Nome Cognome 1", "Nome Cognome 2"]
    }
  ]
}

VINCOLI:
- Produci da 4 a 10 suggerimenti, ordinati per severity decrescente.
- Sii specifico: cita nomi, numeri di giorni, date, periodi.
- Se i dati non mostrano anomalie reali per una categoria, omettila (non inventare problemi).
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
      model: 'claude-opus-4-6',
      max_tokens: 4096,
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
