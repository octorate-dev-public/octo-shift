# octo-shift

SmartWork Scheduler — applicazione full-stack (Next.js 15 + Supabase) per la
gestione di turni smartwork/ufficio, rotazione on-call, ferie/permessi e
richieste di scambio turno. UI in italiano.

## Comandi

```bash
npm run dev          # server di sviluppo (localhost:3000)
npm run build        # build di produzione
npm run lint         # ESLint
npm run type-check   # tsc --noEmit
```

Prima di ogni commit: `npm run type-check && npm run lint`.

## Documentazione

Documentazione di alto livello (questo file rimanda sempre alla guida corretta):

- [CLAUDE.md](./CLAUDE.md) — istruzioni tooling/env/comandi essenziali
- [SETUP.md](./SETUP.md) — setup ambiente locale
- [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) — sintesi del progetto
- [IMPLEMENTATION_GUIDE.md](./IMPLEMENTATION_GUIDE.md) — guida storica delle pagine
- [supabase-schema.sql](./supabase-schema.sql) — schema DB completo
- [migrations/](./migrations/) — migrazioni applicate dopo lo schema iniziale

## Guida operativa frazionata (`.claude/`)

La cartella [`.claude/`](./.claude/) contiene istruzioni atomiche pensate per
aiutare un assistente AI (e qualsiasi nuovo collaboratore) a orientarsi
velocemente senza dover rileggere tutto il codice. Ogni file copre un'area
specifica:

| File | Contenuto |
|------|-----------|
| [.claude/README.md](./.claude/README.md) | Indice e regole d'uso |
| [.claude/architecture.md](./.claude/architecture.md) | Stack, layering, flusso request → DB |
| [.claude/data-model.md](./.claude/data-model.md) | Schema, tipi, modello leave overlay |
| [.claude/pages.md](./.claude/pages.md) | Mappa rotte e gruppi di pagine collegate |
| [.claude/api-modules.md](./.claude/api-modules.md) | Endpoint ⇄ moduli `lib/api/*` |
| [.claude/algorithms.md](./.claude/algorithms.md) | Scheduler, rotazione on-call, swap atomico, KEROS, ICS |
| [.claude/conventions.md](./.claude/conventions.md) | Stile, helper riusabili, checklist DRY |
| [.claude/common-tasks.md](./.claude/common-tasks.md) | Ricette: nuova pagina, nuova route, nuova migration, ... |
| [.claude/gotchas.md](./.claude/gotchas.md) | Trappole note (UNIQUE deferrable, leave overlay, ...) |
| [.claude/self-update.md](./.claude/self-update.md) | Come mantenere aggiornata questa documentazione |

## Regola di manutenzione della documentazione

> **Quando modifichi il codice in modo che renda obsoleta una qualsiasi
> affermazione contenuta in `.claude/` (o nei file linkati qui sopra), aggiorna
> il file corrispondente nella stessa modifica.**
>
> Questa regola vale sia per gli umani che per gli assistenti AI: la mappa
> "tipo di modifica → file da aggiornare" è in [.claude/self-update.md](./.claude/self-update.md).
> Se aggiungi/rimuovi un file in `.claude/`, aggiorna anche la tabella in questo
> README e l'indice in [.claude/README.md](./.claude/README.md).
