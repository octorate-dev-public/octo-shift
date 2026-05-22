# Ricette pronte ("come faccio a…")

## Aggiungere una nuova pagina utente

1. Crea `app/<rotta>/page.tsx`. Inizia con:
   ```tsx
   'use client';
   import { useAuth } from '@/lib/useAuth';
   import Layout from '@/components/Layout';
   export default function Page() {
     const { userId, userName, userRole, loading, logout } = useAuth();
     if (loading || !userId) return null;
     return <Layout userName={userName} userRole={userRole} onLogout={logout}>...</Layout>;
   }
   ```
2. Aggiungi la voce in [`components/Sidebar.tsx`](../components/Sidebar.tsx) nel
   gruppo giusto (admin/user/shared) — altrimenti non si vede in navigazione.
3. Aggiorna [pages.md](./pages.md) con la nuova riga in tabella.

## Aggiungere una nuova route API

1. Decidi modulo: `app/api/<resource>/route.ts`.
2. Boilerplate:
   ```ts
   import { withHandler, jsonOk, parseBody, requireParam } from '@/lib/api-handler';
   import { mioModuloAPI } from '@/lib/api/mio-modulo';

   export const GET = withHandler('api/mio', 'GET', async (req) => {
     const id = requireParam(req, 'id');
     return jsonOk(await mioModuloAPI.getById(id));
   });
   ```
3. Logica DB in `lib/api/mio-modulo.ts` con il pattern `log.withTiming` + `toAppError`.
4. Lato client: chiama via `lib/fetcher.ts` (`request<T>`).
5. Aggiorna [api-modules.md](./api-modules.md) e — se serve — [pages.md](./pages.md).

## Aggiungere una migrazione DB

1. Crea `migrations/AAAA-MM-GG-descrizione.sql`. Sintassi `CREATE … IF NOT EXISTS`.
2. Esegui a mano dalla Supabase SQL Editor.
3. Se cambi colonne usate dal codice, aggiorna `types/index.ts` e i moduli `lib/api/*`.
4. Aggiorna `supabase-schema.sql` se è un cambio "fondante" (no se è un fix puntuale: la migration basta).
5. Aggiorna [data-model.md](./data-model.md) con la nuova riga.

## Aggiungere un setting di configurazione

1. Aggiungilo nella tabella `settings` (key/value) — niente nuova colonna.
2. Aggiungi getter/setter in [`lib/api/settings.ts`](../lib/api/settings.ts) con default robusto e `log.warn` se invalid.
3. Esponilo in `/admin/settings`.
4. Se è sensibile, aggiungilo a `SENSITIVE_KEYS` in `app/api/settings/route.ts` e cifralo via `lib/crypto.ts`.

## Toccare la logica di scheduling

File: [`lib/api/scheduling.ts`](../lib/api/scheduling.ts).

Prima leggi [algorithms.md](./algorithms.md) — ci sono i pesi e la **gerarchia
voluta**. Se cambi un peso, aggiorna lì i numeri e i commenti.

Test manuale rapido:
- `POST /api/scheduling { action: 'validate', year, month }` per vedere violazioni.
- `POST /api/scheduling { action: 'generate', year, month }` per rigenerare.
- `POST /api/scheduling { action: 'rebalance', year, month }` per riequilibrare senza rigenerare.

## Aggiungere/modificare uno status di swap

File: [`lib/api/swap-requests.ts`](../lib/api/swap-requests.ts) + CHECK in `supabase-schema.sql`.

Se aggiungi uno stato:
- Estendi il `CHECK` SQL (migration).
- Estendi l'union in `types/index.ts > ShiftSwapRequest.status`.
- Aggiorna la state machine in [algorithms.md](./algorithms.md).

## Modificare la rotazione on-call

File: [`lib/api/on-call.ts`](../lib/api/on-call.ts). Vedi `generateAnnualOnCall`.
Se cambi soglia ferie (oggi: `≥ 4 giorni nella settimana`), aggiorna
[algorithms.md](./algorithms.md) — la soglia è documentata lì.

## Importare ferie da KEROS

Endpoint: `POST /api/keros { startDate?, endDate?, situazione?, dryRun? }`.
Credenziali: salvate cifrate in `settings.keros_username/password` (configurabili
da `/admin/settings`). Fallback: `KEROS_USERNAME/PASSWORD` env.

## Creare un nuovo helper "shared"

Se è una funzione pura (date/leave/shift/format) → [`lib/utils.ts`](../lib/utils.ts).
Se tocca Supabase → un modulo in `lib/api/*`. Se è UI → un componente in
`components/`. **Non mettere logica DB in `components/` o in `lib/utils.ts`.**

## Aggiungere un componente shared

`components/` è piatto. Naming: `PascalCase.tsx`. Esporta `default`. Tipi delle
props in cima al file. Se ha state, `'use client'` in cima.

## Aggiungere voce alla sidebar

Una sola sorgente di verità: [`components/Sidebar.tsx`](../components/Sidebar.tsx).
Le voci sono raggruppate per ruolo (admin/user/shared). Aggiungi lì.
