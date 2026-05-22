import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { AppError } from '@/lib/logger';

// ─── Tipi della richiesta ────────────────────────────────────────────────────

interface AiOnCallUser {
  id: string;
  name: string;
  totalDays: number;   // giorni totali nell'anno
  futureDays: number;  // giorni dal "today" in poi
  pastDays: number;    // giorni già svolti
}

interface AiOnCallDay {
  date: string;        // YYYY-MM-DD
  dayLabel: string;    // es. "Lun 5 Gen"
  userId: string;
  userName: string;
  hasVacation: boolean; // l'utente è in ferie quel giorno
  isPast: boolean;      // giorno già passato
}

interface AiOnCallUserVacation {
  userId: string;
  userName: string;
  vacationDates: string[]; // date future in cui l'utente è in ferie (YYYY-MM-DD)
}

interface AiOnCallRequest {
  year: number;
  today: string;          // YYYY-MM-DD
  users: AiOnCallUser[];
  days: AiOnCallDay[];
  userVacations?: AiOnCallUserVacation[]; // ferie future di tutti gli utenti on-call disponibili
  userPrompt?: string;    // istruzioni opzionali dall'admin
}

// ─── Tipi della risposta ─────────────────────────────────────────────────────

import type { AiSuggestion, AiSuggestionAction } from '@/types';
export type { AiSuggestion, AiSuggestionAction } from '@/types';

// ─── Costruzione prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `Sei un assistente esperto nella gestione dei turni di reperibilità aziendale.
Analizzi la programmazione annuale e produci suggerimenti concreti per migliorarla,
rispettando le regole del sistema e le priorità indicate.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
REGOLE INVARIABILI DEL SISTEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. Copertura totale: ogni giorno deve avere ESATTAMENTE 1 persona in reperibilità.
   Ogni swap deve essere simmetrico: userId1 cede dates1 → userId2 le riceve,
   userId2 cede dates2 → userId1 le riceve. Il numero totale di giorni coperti
   non cambia mai.

2. Granularità degli swap: puoi proporre scambi di qualsiasi granularità —
   un singolo giorno, più giorni non contigui, o un blocco settimanale intero.
   Usa la granularità minima necessaria per risolvere il problema specifico.
   Esempio: se il conflitto è solo mercoledì 14 maggio, proponi lo swap di quel
   solo giorno con un giorno equivalente di un altro collega, non dell'intera settimana.

3. Round-robin come linea guida: la rotazione round-robin è l'obiettivo di partenza,
   ma può essere sacrificata per risolvere priorità più importanti (vedi sotto).
   Quando proponi uno swap, spiega brevemente se e quanto si discosta dall'equità
   e perché ne vale la pena.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITÀ DI INTERVENTO (in ordine decrescente)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 PRIORITÀ 1 — CONFLITTI FERIE (severity: high)
   Giorni in cui l'utente assegnato ha hasVacation: true, PIÙ i weekend impliciti:
   se un utente ha reperibilità di sabato o domenica E ha ferie il venerdì precedente
   o il lunedì successivo, quel weekend va trattato come conflitto ferie (severity: high)
   anche se hasVacation non è esplicitamente true per sabato/domenica.
   Vanno sempre risolti per primi. Per ciascun conflitto:
   - Identifica il/i giorno/i esatti in conflitto.
   - Trova il collega con meno giorni futuri (o meno giorni consecutivi) che
     NON sia in ferie in quel periodo.
   - Proponi uno swap del/dei solo/i giorno/i in conflitto (non dell'intera settimana
     se non è necessario), scambiandoli con un giorno equivalente del collega scelto.
   - Se non esiste nessun collega libero da ferie in quel periodo, emetti invece un
     suggerimento tipo "info" / severity "high" che avvisa esplicitamente:
     "Tutti i colleghi disponibili sono in ferie in questo periodo — impossibile
      risolvere il conflitto con uno scambio automatico."

🟠 PRIORITÀ 2 — MAX 7 GIORNI CONSECUTIVI (severity: high/medium)
   Se un utente ha più di 7 giorni di reperibilità consecutivi, spezza il blocco
   cedendo i giorni in eccesso al collega con meno giorni futuri (verificando
   che non crei un conflitto ferie). Preferisci scambi che interrompono la
   consecutività nel modo meno invasivo possibile.

🟡 PRIORITÀ 3 — EQUITÀ SUI GIORNI FUTURI (severity: medium)
   Chi ha troppi giorni futuri rispetto alla media? Proponi swap che riequilibrano,
   rispettando sempre le priorità 1 e 2. Privilegia scambi che non spostano blocchi
   in periodi festivi già gravosi per il ricevente.

🔵 PRIORITÀ 4 — DISTRIBUZIONE STAGIONALE (severity: low)
   Qualcuno copre sempre agosto, i weekend di Natale o le festività?
   Suggerisci rotazioni più eque su questi periodi.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VALIDAZIONE OBBLIGATORIA PRIMA DI OGNI SWAP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Prima di emettere qualsiasi suggerimento di tipo "swap", verifica nella sezione
"FERIE PER UTENTE" che:
  a) userId2 NON abbia ferie in nessuna data di dates1 (le date che riceverà).
  b) userId1 NON abbia ferie in nessuna data di dates2 (le date che riceverà).
  c) Lo swap non crei per nessuno dei due un nuovo blocco di più di 7 giorni
     consecutivi (considera i giorni già assegnati adiacenti alle date scambiate).
  d) REGOLA WEEKEND: se una data ricevuta è sabato o domenica, l'utente ricevente
     NON deve avere ferie il venerdì precedente NÉ il lunedì successivo a quel weekend.
     Motivazione: ferie venerdì o lunedì adiacenti al weekend indicano quasi certamente
     una vacanza che include il sabato/domenica — assegnare la reperibilità in quel
     weekend sarebbe un conflitto pratico anche se non formalmente registrato.
     Esempio: se l'utente ha ferie venerdì 23 maggio, non assegnargli sabato 24 né
     domenica 25 maggio. Se ha ferie lunedì 26 maggio, stesso vincolo su 24 e 25.

Se una di queste condizioni fallisce, scarta il candidato e cercane un altro.
Solo se nessun candidato supera la validazione, emetti un "info" che spiega perché.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FORMATO RISPOSTA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza markdown, senza testo aggiuntivo:
{
  "suggestions": [
    {
      "id": "1",
      "type": "swap",
      "severity": "high",
      "title": "Titolo breve in italiano",
      "description": "Descrizione del problema, motivazione dello swap e impatto sull'equità. Cita nomi, date e giorni coinvolti.",
      "action": {
        "userId1": "uuid-utente-1",
        "userName1": "Nome Cognome 1",
        "dates1": ["YYYY-MM-DD"],
        "userId2": "uuid-utente-2",
        "userName2": "Nome Cognome 2",
        "dates2": ["YYYY-MM-DD"]
      }
    },
    {
      "id": "2",
      "type": "info",
      "severity": "high",
      "title": "Conflitto irrisolvibile",
      "description": "Tutti i colleghi sono in ferie nel periodo X–Y: impossibile trovare un sostituto.",
      "action": null
    }
  ]
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VINCOLI FINALI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- type="swap": action non può essere null. Date e userId devono esistere nei dati forniti.
- dates1 appartengono a userId1, dates2 appartengono a userId2 nella programmazione attuale.
- Suggerisci scambi solo su giorni futuri (isPast: false).
- Produci da 3 a 10 suggerimenti, ordinati per priorità decrescente.
- Non inventare date o userId: usa solo i valori presenti nei dati.
- Non proporre mai uno swap che crea un conflitto ferie o >7 consecutivi sull'utente ricevente.`;
}

function buildUserMessage(req: AiOnCallRequest): string {
  const futureDays = req.days.filter((d) => !d.isPast);
  const vacationConflicts = req.days.filter((d) => d.hasVacation && !d.isPast);

  // Riepilogo utenti
  const usersTable = req.users
    .map(
      (u) =>
        `- ${u.name} (id: ${u.id}): ${u.totalDays} giorni totali, ${u.futureDays} futuri, ${u.pastDays} già svolti`,
    )
    .join('\n');

  // Conflitti ferie (solo futuri)
  const conflictsTable =
    vacationConflicts.length > 0
      ? vacationConflicts
          .map((d) => `- ${d.date} (${d.dayLabel}): ${d.userName} IN FERIE`)
          .join('\n')
      : '(nessun conflitto ferie futuro)';

  // Lista giorni futuri (compatta: solo le prime 60 righe per non esplodere il contesto, poi un riassunto)
  const futureSample = futureDays.slice(0, 200);
  const daysTable = futureSample
    .map((d) => `${d.date}|${d.userName}|${d.userId}${d.hasVacation ? '|FERIE' : ''}`)
    .join('\n');

  const parts: string[] = [
    `ANNO ANALIZZATO: ${req.year}`,
    `DATA ODIERNA: ${req.today}`,
    ``,
    `## DIPENDENTI IN ROTAZIONE`,
    usersTable,
    ``,
    `## CONFLITTI FERIE FUTURI (priorità alta)`,
    conflictsTable,
    ``,
    `## PROGRAMMAZIONE FUTURA (formato: data|nome|userId[|FERIE])`,
    `(mostrati i prossimi ${futureSample.length} giorni su ${futureDays.length} totali futuri)`,
    daysTable,
  ];

  // Ferie future per ciascun utente on-call (usate per il cross-check degli swap)
  if (req.userVacations && req.userVacations.length > 0) {
    parts.push(``, `## FERIE PER UTENTE (usa questa sezione per validare gli swap)`);
    parts.push(`(formato: userId|userName: data1, data2, ...)`);
    for (const uv of req.userVacations) {
      parts.push(`- ${uv.userId}|${uv.userName}: ${uv.vacationDates.join(', ')}`);
    }
    parts.push(
      ``,
      `REMINDER: prima di suggerire uno swap, verifica che l'utente ricevente NON abbia ferie`,
      `nelle date che gli verrebbero assegnate. Se tutti gli utenti sono in ferie nel periodo`,
      `del conflitto, emetti un suggerimento di tipo "info" con severity "high" invece dello swap.`,
    );
  }

  if (req.userPrompt?.trim()) {
    parts.push(``, `## ISTRUZIONI AGGIUNTIVE DELL'AMMINISTRATORE`, req.userPrompt.trim());
  }

  return parts.join('\n');
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export const POST = withHandler('api/ai-oncall', 'POST', async (req) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      'Chiave API Anthropic non configurata. Aggiungi ANTHROPIC_API_KEY alle variabili d\'ambiente.',
      { code: 'AI_KEY_MISSING', httpStatus: 503 },
    );
  }

  const body = await parseBody<AiOnCallRequest>(req);

  if (!body.year || !body.today || !Array.isArray(body.users) || !Array.isArray(body.days)) {
    throw new AppError('Dati mancanti nella richiesta AI', { code: 'INVALID_REQUEST', httpStatus: 400 });
  }

  const systemPrompt = buildSystemPrompt();
  const userMessage = buildUserMessage(body);

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
    const errText = await anthropicResponse.text().catch(() => 'unknown error');
    throw new AppError(`Errore dalla API Anthropic: ${anthropicResponse.status} – ${errText}`, {
      code: 'AI_API_ERROR',
      httpStatus: 502,
    });
  }

  const anthropicData = await anthropicResponse.json() as {
    content: Array<{ type: string; text: string }>;
  };

  const rawText = anthropicData.content?.find((c) => c.type === 'text')?.text ?? '';

  // Estrai il JSON dalla risposta (potrebbe avere testo extra nonostante le istruzioni)
  let suggestions: AiSuggestion[] = [];
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Nessun JSON trovato nella risposta');
    const parsed = JSON.parse(jsonMatch[0]) as { suggestions?: AiSuggestion[] };
    suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  } catch (parseErr) {
    throw new AppError(`Risposta AI non valida: ${parseErr instanceof Error ? parseErr.message : 'JSON malformato'}`, {
      code: 'AI_PARSE_ERROR',
      httpStatus: 502,
    });
  }

  return jsonOk({ suggestions });
});
