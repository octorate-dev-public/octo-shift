# Guida operativa per Claude — octo-shift

Questa cartella contiene istruzioni **frazionate per area** pensate per aiutare Claude
(qualsiasi sessione) a orientarsi rapidamente nel progetto senza dover rileggere
tutto il codice. Ogni file è atomico: leggi solo quello che ti serve.

## Indice

| File | Quando leggerlo |
|------|-----------------|
| [architecture.md](./architecture.md) | Sempre, come primo file. Stack, layering, flusso request → DB. |
| [data-model.md](./data-model.md) | Quando tocchi tipi, schema, ferie/permessi, leave overlay. |
| [pages.md](./pages.md) | Quando crei/modifichi una pagina. Mappa rotte + pagine collegate. |
| [api-modules.md](./api-modules.md) | Quando aggiungi/modifichi un endpoint o un `lib/api/*`. |
| [algorithms.md](./algorithms.md) | Per lo scheduling mensile, la rotazione on-call, lo swap atomico, l'import KEROS. |
| [conventions.md](./conventions.md) | Stile di codice, naming, riuso DRY, util helpers. |
| [common-tasks.md](./common-tasks.md) | Ricette pronte: "aggiungi pagina admin", "nuova route API", ecc. |
| [gotchas.md](./gotchas.md) | Trappole note: UNIQUE deferrable, leave_type vs shift_type, ecc. |
| [self-update.md](./self-update.md) | **META — come tenere aggiornati questi file** quando il progetto cambia. |

## Regola fondamentale

Quando modifichi codice in modo che renda **obsoleta** una qualsiasi affermazione
contenuta in questi file (o nei link a riga di codice), aggiorna anche il file `.claude/`
corrispondente nella **stessa modifica**. Vedi [self-update.md](./self-update.md).

## File esterni di riferimento

- [/CLAUDE.md](../CLAUDE.md) — istruzioni di alto livello (tooling, env, comandi)
- [/IMPLEMENTATION_GUIDE.md](../IMPLEMENTATION_GUIDE.md) — guida storica per costruire le pagine
- [/PROJECT_SUMMARY.md](../PROJECT_SUMMARY.md) — sintesi originale del progetto
- [/SETUP.md](../SETUP.md) — setup ambiente
- [/supabase-schema.sql](../supabase-schema.sql) — schema DB completo
- [/migrations/](../migrations/) — migrazioni successive allo schema iniziale
