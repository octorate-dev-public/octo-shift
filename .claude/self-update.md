# Self-update — istruzioni per Claude

Questi file sono utili solo se restano aggiornati. **Quando modifichi il codice,
aggiorna anche `.claude/` nella stessa modifica.**

## Quando aggiornare cosa

| Tipo di modifica al codice | File `.claude/` da aggiornare |
|----------------------------|--------------------------------|
| Aggiungi/rimuovi una rotta (`app/*/page.tsx`) | [pages.md](./pages.md), [Sidebar.tsx](../components/Sidebar.tsx) |
| Aggiungi/rimuovi una API route (`app/api/*`) | [api-modules.md](./api-modules.md) |
| Aggiungi/rinomini un metodo di `lib/api/*` | [api-modules.md](./api-modules.md), eventualmente [common-tasks.md](./common-tasks.md) |
| Modifichi `types/index.ts` | [data-model.md](./data-model.md) |
| Aggiungi una migration `migrations/*.sql` | [data-model.md](./data-model.md), e se cambia il modello mentale anche [gotchas.md](./gotchas.md) |
| Modifichi pesi/regole in `lib/api/scheduling.ts` | [algorithms.md](./algorithms.md) (sezione 1) |
| Modifichi `lib/api/on-call.ts` (rotazione, swap blocchi) | [algorithms.md](./algorithms.md) (sezione 2) |
| Modifichi `swap_shift_users` o `acceptSwapRequest` | [algorithms.md](./algorithms.md) (sezione 3 + 4), [gotchas.md](./gotchas.md) |
| Cambi un helper in `lib/utils.ts` | [conventions.md](./conventions.md) (tabella helper) |
| Aggiungi un setting o cambi default in `lib/api/settings.ts` | [common-tasks.md](./common-tasks.md), [data-model.md](./data-model.md) |
| Cambi il flusso di logging/error handling | [architecture.md](./architecture.md), [conventions.md](./conventions.md) |
| Cambi la lista delle chiavi sensibili | [api-modules.md](./api-modules.md) (sezione Sicurezza) |

## Regola pratica

Prima del commit: chiediti "se rileggo `.claude/` da zero, c'è qualcosa di
**falso** dopo la mia modifica?". Se sì, sistema, **nella stessa modifica**.

## Quando aggiungere un nuovo file in `.claude/`

Solo quando emerge un'area concettuale nuova (es. "testing", "monitoring",
"i18n" se mai arrivasse). In quel caso:

1. Crea `.claude/<area>.md`.
2. Linkalo in [.claude/README.md](./README.md) (la tabella indice).
3. Aggiorna anche il README principale del repo se cambia la mappa.

## Quando *non* aggiornare i `.claude/`

- Refactor puramente meccanici che non cambiano l'API/forma del modulo.
- Fix di tipi che non cambiano il dominio (`types/index.ts`).
- Aggiunta di test (al momento non ne abbiamo).

## Stile dei file `.claude/`

- Italiano.
- Tabelle e bullet brevi: l'obiettivo è essere **scannable** in <30 secondi.
- Link ai file di codice usando path relativi `../<file>` o `[label](../file#Lline)`.
- Niente codice di esempio gigante: massimo 10 righe per snippet.
- Mai duplicare informazione: se è già altrove, linka.

## Audit periodico (manuale)

Ogni tanto Claude può proporre un audit: legge tutti i file `.claude/`, confronta
con la realtà del codice (grep su file e simboli citati) e segnala drift.
