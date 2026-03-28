# CLAUDE.md — octo-shift (SmartWork Scheduler)

## Panoramica del progetto

Applicazione web full-stack per la gestione dei turni di smartwork/ufficio.
Permette agli admin di creare e bloccare schedule settimanali, gestire rotazioni on-call e approvare richieste di cambio turno tra dipendenti. UI completamente in italiano.

---

## Stack tecnologico

| Layer | Tecnologia |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Linguaggio | TypeScript 5.3 (strict mode) |
| UI | React 19, Tailwind CSS 3.3 |
| Database | PostgreSQL via Supabase |
| Auth | Supabase Auth |
| Drag & Drop | @hello-pangea/dnd |
| Date | date-fns |
| Validazione | Zod |
| Deploy | Vercel |

---

## Comandi essenziali

```bash
npm run dev          # server di sviluppo su localhost:3000
npm run build        # build di produzione
npm run lint         # ESLint
npm run type-check   # TypeScript (tsc --noEmit)
```

Non esiste una suite di test. Prima di ogni commit eseguire `npm run type-check` e `npm run lint`.

---

## Struttura del progetto

```
app/                    # Next.js App Router
  page.tsx              # Login
  admin/
    page.tsx            # Dashboard admin
    schedule/page.tsx   # Creazione schedule (drag & drop)
  calendar/page.tsx     # Vista calendario
  public-on-call/page.tsx # On-call pubblica (no auth)

components/             # Layout, Header, Sidebar, Calendar, DraggableUserList
lib/
  supabase.ts           # Client Supabase
  utils.ts              # Date, formatting, cn(), getShiftColor()
  api/                  # Un file per entità: shifts, users, on-call, swap-requests, settings, scheduling
types/index.ts          # Tutti i tipi TypeScript
supabase-schema.sql     # Schema PostgreSQL completo
```

---

## Alias TypeScript

```typescript
@/*            → root
@/components/* → components/
@/lib/*        → lib/
@/types/*      → types/
```

---

## Variabili d'ambiente

Il file `.env` è escluso da git (repo pubblico). Usare `.env.example` come riferimento.

```bash
# Obbligatorie
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Facoltative
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_ANALYTICS_ID=
```

Su Vercel le variabili si configurano in **Project Settings → Environment Variables**.
Non aggiungere mai `.env` o `.env.local` al repo — sono già in `.gitignore`.

---

## Pattern API

Tutti i moduli in `lib/api/` seguono la stessa struttura:

```typescript
export const moduleAPI = {
  getAll(): Promise<T[]>
  getById(id: string): Promise<T>
  create(data: Partial<T>): Promise<T>
  update(id: string, data: Partial<T>): Promise<T>
  delete(id: string): Promise<void>
}
```

Il client Supabase è inizializzato in `lib/supabase.ts` — non crearne altri.

---

## Convenzioni del codice

- UI e label in **italiano**
- Tipi in `types/index.ts` — non ridefinirli inline
- Colori turni via `getShiftColor()` in `lib/utils.ts`
- Classi Tailwind concatenate con `cn()` (re-export di `clsx`)
- Immagini non ottimizzate (`unoptimized: true` in `next.config.js`) per compatibilità Supabase Storage

---

## Pagine mancanti (da implementare)

Le seguenti route non esistono ancora:

```
/admin/users       # Gestione dipendenti
/admin/teams       # Gestione team
/admin/settings    # Configurazione globale
/admin/leave       # Richieste permesso/ferie (admin)
/admin/on-call     # Assegnazione on-call
/admin/swaps       # Approvazione cambi turno
/schedule          # Schedule personale utente
/swaps             # Richieste cambio turno (utente)
/leave             # Richieste ferie/permesso (utente)
/on-call           # Vista on-call (utente)
```

Seguire il pattern delle pagine già completate (`admin/schedule/page.tsx`) e la guida in `IMPLEMENTATION_GUIDE.md`.

---

## Deploy su Vercel

- Il progetto è configurato per Vercel out-of-the-box (Next.js App Router)
- Framework preset: **Next.js** (rilevato automaticamente)
- Root directory: `/` (default)
- Build command: `npm run build`
- Output directory: `.next` (default)
- Impostare le variabili d'ambiente nel dashboard Vercel prima del deploy

---

## Note importanti

- Il repo è **pubblico**: non committare mai secret, token o chiavi API
- `SUPABASE_SERVICE_ROLE_KEY` è una chiave privilegiata — usarla solo server-side, mai in variabili `NEXT_PUBLIC_*`
- Lo schema del database è in `supabase-schema.sql` — applicarlo dalla Supabase SQL Editor
