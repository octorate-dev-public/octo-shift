# Pagine

Pattern App Router: `app/<segment>/page.tsx`. Tutte le UI sono in italiano.

## Mappa rotte

### Pubbliche (no auth)

| Rotta | File | Cosa fa |
|-------|------|---------|
| `/` | [/app/page.tsx](../app/page.tsx) | Login (Supabase Auth + Magic Link). |
| `/auth/callback` | [/app/auth/callback/page.tsx](../app/auth/callback/page.tsx) | Conferma magic link. |
| `/public-on-call` | [/app/public-on-call/page.tsx](../app/public-on-call/page.tsx) | Vista pubblica reperibilità, no auth. |

### Utente loggato

| Rotta | File | Note |
|-------|------|------|
| `/schedule` | [/app/schedule/page.tsx](../app/schedule/page.tsx) | Schedule personale + auto-richiesta swap su altri utenti. |
| `/preferences` | [/app/preferences/page.tsx](../app/preferences/page.tsx) | Home/Office/Indifferente giorno per giorno. Deadline configurabile. |
| `/swaps` | [/app/swaps/page.tsx](../app/swaps/page.tsx) | Le mie richieste di scambio (creare/accettare/rifiutare). |
| `/leave` | [/app/leave/page.tsx](../app/leave/page.tsx) | Ferie e permessi personali. |
| `/calendar` | [/app/calendar/page.tsx](../app/calendar/page.tsx) | Vista calendario condiviso. |
| `/on-call` | [/app/on-call/page.tsx](../app/on-call/page.tsx) | Chi è reperibile (vista utente). |

### Admin

| Rotta | File | Note |
|-------|------|------|
| `/admin` | [/app/admin/page.tsx](../app/admin/page.tsx) | Dashboard. |
| `/admin/schedule` | [/app/admin/schedule/page.tsx](../app/admin/schedule/page.tsx) | Creazione schedule con drag & drop, generazione, validate, rebalance. |
| `/admin/users` | [/app/admin/users/page.tsx](../app/admin/users/page.tsx) | Gestione dipendenti. |
| `/admin/teams` | [/app/admin/teams/page.tsx](../app/admin/teams/page.tsx) | Gestione team. |
| `/admin/settings` | [/app/admin/settings/page.tsx](../app/admin/settings/page.tsx) | Capienza ufficio, festività, work_days, credenziali KEROS. |
| `/admin/leave` | [/app/admin/leave/page.tsx](../app/admin/leave/page.tsx) | Ferie/permessi di tutti. |
| `/admin/on-call` | [/app/admin/on-call/page.tsx](../app/admin/on-call/page.tsx) | Assegnazione reperibilità (matrice annuale). |
| `/admin/swaps` | [/app/admin/swaps/page.tsx](../app/admin/swaps/page.tsx) | Richieste escalated da approvare. |

## Gruppi di pagine da considerare INSIEME

Quando modifichi una di queste, controlla anche le sorelle perché condividono
stato/dati o pattern UI.

### Gruppo "Schedule turni"

- `/admin/schedule` (creazione drag & drop, generate, validate, rebalance)
- `/schedule` (vista utente del proprio mese)
- `/calendar` (vista condivisa del mese)
- Stessa source: tabella `shifts`. Stessa logica capienza/leave overlay.
- Componenti condivisi: `components/Calendar.tsx`, `components/DayShiftPanel.tsx`, `components/DraggableUserList.tsx`.

### Gruppo "Reperibilità"

- `/admin/on-call` (assegnazione annuale, swap blocchi)
- `/on-call` (vista utente mensile)
- `/public-on-call` (pubblica, no auth — usata da numero verde / dashboard)
- Source: `on_call_daily_assignments` (preferita) + `on_call_assignments` (fallback weekly).

### Gruppo "Swap"

- `/swaps` (utente: crea/accetta/rifiuta — rifiuto = escalation admin)
- `/admin/swaps` (admin: approva/rifiuta escalated)
- Backend: tabella `shift_swap_requests` + RPC `swap_shift_users`.

### Gruppo "Leave"

- `/leave` (utente: richiede ferie/permessi)
- `/admin/leave` (admin: panoramica e import KEROS)
- Si appoggia a `shifts.leave_type` (overlay) + helper in `lib/utils.ts`.

### Gruppo "Preferenze ⇄ Scheduling"

- `/preferences` (utente: home/office/indifferente per il mese)
- `/admin/schedule` (legge le preferenze come secondary score nello scheduler)
- Backend: `shift_preferences` + `lib/api/preferences.ts`.

## Componenti shared significativi

- [`components/Layout.tsx`](../components/Layout.tsx) — Sidebar + Header per le pagine autenticate.
- [`components/Sidebar.tsx`](../components/Sidebar.tsx) — **mappa di navigazione**: aggiungi qui ogni nuova route che vuoi visibile.
- [`components/Header.tsx`](../components/Header.tsx) — top bar con iniziali utente.
- [`components/Calendar.tsx`](../components/Calendar.tsx) — calendario riusabile (mensile + matrice utenti).
- [`components/DayShiftPanel.tsx`](../components/DayShiftPanel.tsx) — pannello laterale per modificare un giorno.
- [`components/DraggableUserList.tsx`](../components/DraggableUserList.tsx) — lista utenti drag-able usata in `/admin/schedule`.

## Hook condiviso

[`lib/useAuth.ts`](../lib/useAuth.ts) — usalo in OGNI pagina autenticata. Gestisce
sessione, redirect a `/`, espone `{ userId, userName, userRole, loading, error, logout }`.
