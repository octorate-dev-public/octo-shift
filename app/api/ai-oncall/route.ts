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
Analizzi la programmazione annuale di reperibilità e produci suggerimenti concreti per migliorarla.

REGOLE DEL SISTEMA DI REPERIBILITÀ:
- Ogni giorno dell'anno deve avere esattamente 1 persona in reperibilità
- I turni sono assegnati in blocchi di 7 giorni (lun–dom)
- La rotazione segue un round-robin tra i dipendenti disponibili
- Se uno scambio viene applicato, la copertura totale non deve mai venire meno (ogni giorno deve avere 1 reperibile)
- Quando suggerisci uno swap, devi specificare le date di ENTRAMBI i blocchi da scambiare

COSA ANALIZZARE:
1. EQUITÀ SUI GIORNI FUTURI: chi ha troppi o troppo pochi giorni di reperibilità nei prossimi mesi rispetto alla media?
2. CONFLITTI FERIE: giorni in cui l'utente assegnato è in ferie (hasVacation: true) → priorità alta
3. GIORNI CONSECUTIVI ECCESSIVI: blocchi contigui allo stesso utente che superano 7 giorni consecutivi
4. DISTRIBUZIONE STAGIONALE: qualcuno fa sempre i weekend di festività/agosto/natale?
5. EVENTUALI ISTRUZIONI AGGIUNTIVE dell'amministratore (nel campo userPrompt)

VALIDAZIONE OBBLIGATORIA PRIMA DI SUGGERIRE UNO SWAP (CRITICA):
Prima di proporre uno scambio dove userId1 cede dates1 a userId2 e userId2 cede dates2 a userId1,
DEVI verificare nella sezione "FERIE PER UTENTE" che:
  a) userId2 NON abbia ferie in nessuna delle date in dates1 (altrimenti il conflitto si sposta su di lui)
  b) userId1 NON abbia ferie in nessuna delle date in dates2

Se lo swap crea un nuovo conflitto ferie sull'utente ricevente, NON proporlo.
Cerca invece un altro candidato senza ferie in quel periodo.

Se per un conflitto ferie NON esiste NESSUN utente disponibile senza ferie in quel periodo,
produci un suggerimento di tipo "info" (action: null) con severity "high" che avvisa:
"Tutti gli utenti disponibili sono in ferie in questo periodo: non è possibile risolvere il conflitto con uno scambio."

FORMATO RISPOSTA:
Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza markdown, senza testo aggiuntivo:
{
  "suggestions": [
    {
      "id": "1",
      "type": "swap",
      "severity": "high",
      "title": "Titolo breve in italiano",
      "description": "Descrizione chiara del problema e del perché lo scambio proposto risolve la situazione. Cita i nomi delle persone.",
      "action": {
        "userId1": "uuid-utente-1",
        "userName1": "Nome Cognome 1",
        "dates1": ["YYYY-MM-DD", "YYYY-MM-DD"],
        "userId2": "uuid-utente-2",
        "userName2": "Nome Cognome 2",
        "dates2": ["YYYY-MM-DD", "YYYY-MM-DD"]
      }
    },
    {
      "id": "2",
      "type": "info",
      "severity": "info",
      "title": "Osservazione senza azione",
      "description": "Considerazione che non richiede modifiche immediate.",
      "action": null
    }
  ]
}

VINCOLI:
- Per type="swap": action NON può essere null. Le date devono esistere nella programmazione fornita.
- dates1 e dates2 devono appartenere RISPETTIVAMENTE a userId1 e userId2 nella programmazione attuale.
- Suggerisci scambi solo su giorni FUTURI (isPast: false).
- Produci da 3 a 8 suggerimenti totali, ordinati per gravità decrescente.
- Non inventare date o user ID: usa solo i valori presenti nei dati forniti.
- Non proporre mai uno swap che crea un conflitto ferie sull'utente ricevente.`;
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
      model: 'claude-opus-4-6',
      max_tokens: 4096,
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
