# Architettura

## Stack

- **Next.js 15** (App Router) — sia frontend che backend (route handlers in `app/api/*`)
- **TypeScript 5.3** strict mode
- **React 19** lato client
- **Tailwind CSS 3.3** per lo styling
- **Supabase** (Postgres + Auth) — unica fonte di verità per dati e autenticazione
- **@hello-pangea/dnd** per drag & drop nella creazione dello schedule
- **date-fns** per formattazione date (ma il grosso passa per helper interni in `lib/utils.ts`)
- **Zod** per la validazione (uso ancora limitato)
- **Vercel** come host di produzione

## Flusso di una richiesta

```
Browser (React)
   │
   │  lib/fetcher.ts  (sempre via fetch → /api/*)
   ▼
Next.js Route Handler  app/api/<resource>/route.ts
   │
   │  wrappato da `withHandler(module, method, fn)`   ← lib/api-handler.ts
   │  (logging strutturato + AppError → JSON)
   ▼
Modulo logica  lib/api/<resource>.ts
   │
   │  ogni metodo wrappato da log.withTiming(...)
   ▼
Client Supabase  lib/supabase.ts
   │
   ▼
Postgres (Supabase)
```

**Regola d'oro:** il client React NON parla mai direttamente a Supabase per le
operazioni di scrittura/lettura business — passa sempre per `/api/*`. Questo
garantisce che logging, error mapping e timing siano centralizzati e visibili
nei Vercel Runtime Logs. Vedi `lib/fetcher.ts` per il client lato browser.

Eccezione storica: `lib/useAuth.ts` chiama direttamente `supabase.auth.*` per
gestire la sessione (Supabase Auth richiede il client browser).

## Layering

```
app/             ← UI + route handlers Next.js
  api/           ← route.ts che chiamano lib/api/*
  <pagina>/      ← pagina React (client component)
components/      ← UI condivisa (Layout, Calendar, Sidebar, DraggableUserList...)
lib/
  api/<dom>.ts   ← UN file per dominio (shifts, users, on-call, ...)
  supabase.ts    ← UN solo client Supabase (lazy via Proxy)
  utils.ts       ← date, leave, shift helpers (cn, formatDate, isAbsenceShift, ...)
  logger.ts      ← createLogger() + AppError + toAppError()
  api-handler.ts ← withHandler() per route Next.js
  fetcher.ts     ← FetchError + helper request<T>()
  useAuth.ts     ← hook React per sessione + ruolo
  crypto.ts      ← AES-256-GCM per credenziali sensibili (es. KEROS)
  keros.ts       ← scraper KEROS HR (login + parsing griglia)
types/index.ts   ← TUTTI i tipi del dominio
middleware.ts    ← logging delle request a livello edge
```

## Cartelle particolari

- `migrations/` — SQL eseguibili a mano sulla Supabase SQL Editor **dopo**
  che lo schema iniziale (`supabase-schema.sql`) è già stato applicato.
- `public/` — asset statici (icon).
- `.next/` — build artefatti (ignorato).
- `.env.local` — credenziali locali (mai committate; il repo è pubblico).

## Punti di ingresso da ricordare

- Login: [/app/page.tsx](../app/page.tsx)
- Layout root: [/app/layout.tsx](../app/layout.tsx) (lang="it")
- Auth callback: [/app/auth/callback/page.tsx](../app/auth/callback/page.tsx)
- Middleware edge (log): [/middleware.ts](../middleware.ts)
- Sidebar (mappa navigazione admin/user): [/components/Sidebar.tsx](../components/Sidebar.tsx)

## Vedi anche

- [data-model.md](./data-model.md) per come sono modellati shifts/leave/on-call.
- [api-modules.md](./api-modules.md) per la corrispondenza endpoint ⇄ modulo.
