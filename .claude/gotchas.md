# Gotchas — trappole note

## 1. `UNIQUE(user_id, shift_date)` su `shifts` è DEFERRABLE

Causa: serve allo swap atomico di due turni nello stesso giorno (vedi `swap_shift_users` RPC).

Conseguenze:

- **Mai `upsert(..., { onConflict: 'user_id,shift_date' })`** su `shifts`.
  Postgres rifiuta i constraint deferrable come arbitri di `ON CONFLICT`.
- Strategia attuale (in `shiftsAPI.upsertShift` / `bulkUpsertShifts` / `setLeaveType`):
  fetch esistenti → INSERT i nuovi, UPDATE gli esistenti. Più verboso ma corretto.
- Se vedi errore `there is no unique or exclusion constraint matching the
  ON CONFLICT specification`, è quasi sempre questo.

## 2. Doppia rappresentazione delle assenze

`shift_type` può essere ancora `'vacation'|'permission'|'sick'` (legacy) **oppure**
`leave_type` è popolato sopra a `shift_type ∈ {office,smartwork}` (nuovo overlay).

**Sempre usare gli helper** `isAbsenceShift` / `isOfficePresence` / `isSmartPresence`
da `lib/utils.ts`. Mai filtrare `shift.shift_type === 'office'` da solo.

Vedi `getOfficeCountForDate` e `getShiftStatsForDate` in `shiftsAPI` per esempi
di SQL che gestiscono entrambi i mondi.

## 3. `team_id` vs `team_ids`

- `users.team_id` (colonna DB) è legacy "primo team".
- `team_ids: string[]` (campo virtuale TS) è popolato da [`usersAPI.mapUser`](../lib/api/users.ts) dal join `user_teams`.
- Quando aggiorni le membership team in `usersAPI.updateUser`, **aggiorna entrambi** (`_setUserTeams` + colonna legacy = primo team).

## 4. `user_teams` può non esistere ancora

Se la migration non è stata applicata, `usersAPI` fa **fallback graceful** a
`select('*')` senza join. Non rompe. Vedi `selectUsers` in `lib/api/users.ts`.

## 5. Reperibilità: weekly vs daily

Due tabelle convivono:

- `on_call_assignments` (legacy weekly).
- `on_call_daily_assignments` (attuale, daily, dopo migration 2026-05-14).

`getOnCallForDate` prova prima la daily, fallback alla weekly. Se aggiungi
funzionalità on-call **usa la daily**, mantieni la weekly solo come fallback in lettura.

## 6. Client Supabase: SINGOLO singleton

`lib/supabase.ts` esporta:
- `supabase` — singleton lazy via `Proxy` (browser + server con anon key)
- `getServerSupabaseClient()` — server-only con SERVICE_ROLE_KEY

**Non chiamare `createClient(...)` da nessun'altra parte.** L'unica eccezione
attuale: `app/api/admin/sync-auth-users/route.ts` ha il suo client perché è uno
script one-shot di migrazione.

## 7. Magic Link / Supabase Auth

Login in `/app/page.tsx` usa Supabase Auth. La callback è `/auth/callback`. Se
aggiungi flow OAuth, configura redirect URL sia in Supabase che in Vercel.

## 8. ICS feed: l'UID utente è il token

`/api/ics?uid=<userId>` NON ha auth — chiunque con l'UID legge il calendario.
È volutamente così per integrare con Google Calendar "Aggiungi da URL". Non
mettere mai informazioni davvero confidenziali nel feed.

## 9. Repo PUBBLICO

- `.env.local` mai committato (in `.gitignore`).
- Mai mettere segreti in costanti del codice.
- `SUPABASE_SERVICE_ROLE_KEY` mai in `NEXT_PUBLIC_*`.
- `ENCRYPTION_KEY` (per `lib/crypto.ts`) mai in `NEXT_PUBLIC_*`.

## 10. `getMonthDays(year, month)` è 0-based

`getMonthDays(2026, 4)` → maggio (m0 = 4 = maggio). Lo scheduler chiama
`getMonthDays(year, month - 1)` per partire da month 1-based. Attento alle
conversioni quando lavori col risultato.

## 11. Pagine: senza `useAuth` non c'è redirect

Una pagina senza `useAuth({ requireAuth: true })` resterà accessibile a non
loggati. Per pagine autenticate **chiama sempre `useAuth()`** in cima.
`/public-on-call` è l'unica pagina autenticata-no su intenzione.

## 12. Capienza ufficio: minimo 1

`settingsAPI.setMaxOfficeCapacity` rifiuta `< 1`. Se vuoi azzerare (giorno di
chiusura), aggiungi una festività (`holiday:YYYY-MM-DD`), non azzerare la capacity.

## 13. Pausa pranzo nei permessi è hard-coded

`computePermissionHours` toglie 13:00–14:00. Se cambia l'orario aziendale, **non**
rendere il codice "generico per tutti" senza prima aggiornare anche
`formatPermissionNote` e l'UI in `/leave` / `/admin/leave`.

## 14. `acceptSwapRequest` rifiuta turni `locked`

Non c'è un check lato DB — è check applicativo in `acceptSwapRequest`. Se aggiungi
un'altra via per fare lo swap, replicalo o sposta il check nella funzione RPC.

## 15. Rifiuto swap = escalation, non chiusura

`rejectSwapRequest` mette status = `'escalated'` (admin decide).
`adminRejectSwapRequest` è quello che mette davvero `'rejected'`. Non confonderli.

## 16. Reperibilità: turno 18:00 → 09:00, handoff alle 9

Il turno di reperibilità copre 18:00 → 09:00 del giorno dopo (Europe/Rome, vedi
`app/api/ics/route.ts`). Perciò "chi è reperibile ADESSO" prima delle 09:00 è la
persona assegnata a IERI, non a oggi. Usare `getActiveOnCallDate()` (in
`lib/utils.ts`) per il fetch/visualizzazione del reperibile corrente — mai
`formatDate(new Date())` grezzo. Calcola in Europe/Rome (non nel fuso del browser).
Usato in `app/public-on-call/page.tsx` e `app/on-call/page.tsx` (card "reperibile
oggi"). Il resto (calendario, prossimo turno, presenze ufficio) resta su oggi reale.
