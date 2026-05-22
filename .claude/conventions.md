# Convenzioni di codice e DRY

## Lingua

- **UI, label, messaggi d'errore, log "user-facing" → italiano.**
- Commenti tecnici, nomi di variabili e tipi → inglese (con eccezioni dove
  il dominio aziendale è già in italiano: `ferie`, `permesso`, `reperibilità`).
- File di documentazione (`.md` di progetto, contenuti `.claude/`) → italiano.

## Tipi

- TUTTI i tipi del dominio vivono in [`/types/index.ts`](../types/index.ts).
- **Non ridefinirli inline.** Se serve un tipo locale a una pagina/componente, ok,
  ma dominio = `types/index.ts`.
- Tipi calcolati lato UI (`DayShifts`, `ShiftStats`, …) anch'essi lì.

## Alias path

`tsconfig.json` definisce:

```
@/*            → root
@/components/* → components/
@/lib/*        → lib/
@/types/*      → types/
```

Usali sempre; mai path relativi a salti `../../`.

## Helper riusabili — usa sempre questi, non reinventarli

### Date

| Helper | File | Cosa fa |
|--------|------|---------|
| `formatDate(d)` | `lib/utils.ts` | `Date|string → YYYY-MM-DD` (locale-safe) |
| `parseDateString(s)` | idem | `YYYY-MM-DD → Date` |
| `getMonthDays(y, m0)` | idem | array di `Date` del mese (m0 0-based) |
| `getDayName(d)` | idem | `'Mon'`/`'Tue'`/... |
| `getWeekStart(d)` / `getWeekEnd(d)` | idem | settimana ISO |
| `getWeekNumber(d)` | idem | numero settimana nell'anno |
| `getSeniorityDays(seniorityDate)` | idem | giorni di anzianità |

### Shift / leave

| Helper | Cosa fa |
|--------|---------|
| `isAbsenceShiftType(s)` | true per `'vacation'\|'permission'\|'sick'` (legacy) |
| `isAbsenceShift({shift_type,leave_type})` | true se overlay leave_type OR legacy |
| `isOfficePresence(shift)` | office E non in assenza |
| `isSmartPresence(shift)` | smartwork E non in assenza |
| `getShiftColor(t)` / `getShiftLabel(t)` | colori Tailwind e label IT per shift |
| `getLeaveColor(t)` / `getLeaveLabel(t)` / `getLeaveIcon(t)` | overlay leave |
| `computePermissionHours(start,end)` | ore nette esclusa pausa 13–14 |
| `formatPermissionNote(start,end)` | "dalle HH:MM alle HH:MM (Xh)" |
| `groupVacationBlocks(shifts)` | raggruppa giorni consecutivi (gap ≤ 3 per coprire weekend) |

### UI

- `cn(...classes)` (in `lib/utils.ts`, re-export di `clsx`) — concatenazione classi Tailwind condizionale.
- `getInitials(fullName)` — iniziali "DA" da "Devin Astuto".

### API client (browser)

[`lib/fetcher.ts`](../lib/fetcher.ts) — `request<T>(method, path, body?)` con `FetchError` tipizzato. Usalo invece di `fetch()` raw.

### Hook auth

[`lib/useAuth.ts`](../lib/useAuth.ts) — `useAuth({ requireAuth: true })`.

## Logging

```ts
import { createLogger } from '@/lib/logger';
const log = createLogger('miaFeature');

log.info('action', 'cosa è successo', { meta });
log.warn('action', '...', { meta });
log.error('action', '...', errorObj, { meta });
await log.withTiming('action', { meta }, async () => { ... });
```

- In **prod (Vercel)** emette JSON → Log Drains.
- In **dev** emette stringa human-readable.
- Per le route handler, il logging in/out è già fatto da `withHandler`.

## Errori

```ts
import { toAppError, AppError } from '@/lib/logger';

if (error) throw toAppError(error, 'Messaggio italiano user-friendly');

// In route handler:
throw new AppError('Parametro mancante', { code: 'MISSING_PARAM', httpStatus: 400 });
```

Mai `try/catch` che assorbe in silenzio. Lascia che il bubble fino a `withHandler`.

## DRY checklist prima di scrivere nuovo codice

1. Vado a chiamare Supabase direttamente da React? → **No.** Crea/usa una route `/api/*`.
2. Sto formattando una data a mano? → Usa `formatDate`.
3. Sto contando presenze in ufficio? → Usa `isOfficePresence`, non confrontare `shift_type === 'office'` da solo.
4. Sto facendo un `fetch('/api/...')` con boilerplate? → Usa `request<T>` di `lib/fetcher.ts`.
5. Sto facendo `try/catch + console.error`? → Usa `log.withTiming` + `toAppError`.
6. Sto definendo un tipo che descrive una tabella DB? → Già in `types/index.ts`.
7. Sto creando un nuovo client Supabase? → Usa il singleton `supabase` o `getServerSupabaseClient()`.

## Stile

- Niente test suite (non esistono). Prima di commit: `npm run type-check` e `npm run lint`.
- Tailwind core utilities only (vedi anche regole artifact in `CLAUDE.md` per il riassunto progetto).
- Componenti React: `'use client'` esplicito quando serve (hooks/state).
- Image: `unoptimized: true` in `next.config.js` per compatibilità Supabase Storage.

## Commit / repo

Il repo è **pubblico**: mai committare `.env`, chiavi, password, magic link.
`.env*` è già in `.gitignore`. La service role key Supabase resta server-side.
