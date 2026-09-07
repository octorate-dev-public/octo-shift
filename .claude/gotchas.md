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

**Risoluzione dipendente (id vs email):** `useAuth` cerca la riga `users` prima per
`id === auth uid` (caso normale: `createUser` fa `id = auth uid`), poi come FALLBACK per
`email` (case-insensitive, `.ilike`). Serve perché login via magic link o utenti importati
possono avere `users.id ≠ auth uid`. `userId` ritornato è **l'id dell'app** (non l'auth uid)
→ turni/preferenze (chiavati su `users.id`) restano visibili. Se nessun match né per id né per
email → `accountUnlinked=true`. NON allineare cambiando la PK: le FK (`shifts`, `user_teams`,
`shift_preferences`, on-call, swap) sono `ON DELETE CASCADE` senza `ON UPDATE CASCADE` → si
allinea l'EMAIL della riga in `/admin/users` (email giusta = aziendale @octorate).

**Gate login (`app/page.tsx` `gateAndRedirect`):** dopo il sign-in risolve il dipendente per
id, poi per email; se nessuno → `supabase.auth.signOut()` + errore, l'utente NON entra (prima
entrava chiunque). Coerente con `useAuth`, che per una sessione unlinked rimanda a
`/?error=unlinked`. Quindi un account senza riga dipendente si becca un errore, non un login.

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

## 17. Reperibilità emergenza (Twilio) + colonna users.phone

Endpoint pubblico `GET /api/emergency/on-call` (in `app/api/emergency/on-call/route.ts`):
restituisce il reperibile ATTIVO adesso (usa `getActiveOnCallDate`, handoff 09:00) con
`phone`. JSON piatto di default; `?format=twiml` ritorna TwiML `<Dial>` per Twilio Voice.
Auth opzionale: se è settata la env `EMERGENCY_ONCALL_TOKEN`, serve `?token=` o header
`x-emergency-token`; altrimenti è aperto (espone il numero → valuta il token in prod).

La colonna `users.phone` (VARCHAR(30)) è nello schema. `instrumentation.ts` →
`ensureUserPhoneColumn()` la verifica allo start: la DDL NON è eseguibile dal client
Supabase, quindi se manca prova l'RPC `exec_sql` e altrimenti logga l'SQL da eseguire
a mano (`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(30);`). Il numero si
imposta da /admin/users (campo Telefono).

## 18. Blocca/sblocca giorno e mese

Oltre al lock/unlock per-cella (`lockShift`/`unlockShift`), ci sono ora azioni bulk in
`shiftsAPI`: `lockDay/unlockDay(date)` e `lockMonth/unlockMonth(year, month)` (month 1-based),
esposte via PATCH /api/shifts con `action: 'lockDay'|'unlockDay'|'lockMonth'|'unlockMonth'`
(lock passa `lockedBy`). UI in /admin/schedule: bottoni "🔒 Blocca mese"/"🔓 Sblocca mese"
in toolbar (con conferma), e nel DayShiftPanel bottone giorno + 🔒 per-cella cliccabile per
sbloccare la singola. Le bulk toccano solo i turni con `locked` opposto (idempotenti).

## 19. Distanza dal lavoro + giorno smart preferito

Nuovi campi su `users`: `work_address`, `commute_minutes` (Google **Routes API**, tempo auto),
`preferred_smart_day` ('monday'..'friday', una sola), `desired_smart_days_per_month` (slider 0–22,
preferenza soft). Aggiunti allo schema e garantiti allo start da `ensureUserColumns()` (ex
ensureUserPhoneColumn, ora generico su più colonne; la DDL resta non eseguibile dal client → se
manca l'RPC exec_sql logga l'ALTER da fare a mano).
Calcolo distanza: POST `/api/distance` { userId, address } → usa `GOOGLE_MAPS_API_KEY` (server) e
**Routes API** `directions/v2:computeRoutes` (la vecchia Distance Matrix API è legacy → REQUEST_DENIED,
va abilitata "Routes API"); destinazione = setting `office_address` (/admin/settings, default Via
Filippo Caruso 23, Roma), salva work_address + commute_minutes. Il dipendente li configura da
`/profile` (self-service: solo il proprio utente), incluso lo slider giorni-smart/mese desiderati.
Algoritmo: `SMART_DAY_PREF` spinge verso smart nel giorno preferito; `COMMUTE_WEIGHT` (cap 90 min)
tiebreaker distanza; `DESIRE_WEIGHT` (0.15 × scarto dei giorni desiderati dalla media del pool,
neutro=8) — chi vuole più smart della media va spinto verso lo smart, chi meno verso l'ufficio.
Tutti e tre sottratti allo score ufficio e SOTTO i minimi hard (ufficio + smart settimanale): la
preferenza può non essere soddisfatta.

## 20. Sync ferie su Google Calendar

Collegamento OAuth2 in /admin/settings (componente `GoogleCalendarCard`). Flusso:
`GET /api/google/auth` (redirect consenso, offline + prompt=consent select_account, state in cookie)
→ `GET /api/google/callback` (scambia code, salva token). Token cifrato (`lib/crypto`) nel
settings key `google_oauth`; calendario in `google_calendar_id`, titolo in `google_ferie_title`
(default `{name} (Developer) - Ferie`). Logica in `lib/google.ts`: `ensureAccessToken` rinfresca
via refresh_token; `syncFerie` legge le ferie (leave_type='vacation') in [oggi-60g,+365g] (finestra
indietro ampia così la key `userId:startDate` resta stabile tra sync), le raggruppa per utente con
`groupCalendarVacationBlocks` (NON `groupVacationBlocks`: due giorni si uniscono solo se OGNI giorno
intermedio è non-lavorativo — work_days/festività; così Ven+Lun = un evento, Lun+Gio = due eventi,
niente giorni lavorativi marcati "Ferie") in eventi all-day (end ESCLUSIVO), e crea/aggiorna/elimina
SOLO eventi con `extendedProperties.private.octoshift='ferie'` (mai toccare eventi altrui; match per
`octoshiftKey=userId:startDate`). `purgeFerie` elimina TUTTI i nostri eventi taggati (qualsiasi data,
nessun filtro temporale) — pulsante "Pulisci eventi", conferma richiesta. API JSON: `GET/POST /api/google`
(action=status|calendars|disconnect|setCalendar|setTitle|sync|purge). Auto-sync ferie: (1) manuale col pulsante; (2) al collegamento account (card, banner
`?google=connected` → action=sync); (3) **istantaneo su modifica ferie** — `/api/shifts`
(setLeave/setLeaveRange/clearLeaveRange) e import KEROS chiamano `triggerFerieSyncInBackground`
(lib/googleSync.ts, fire-and-forget, best-effort, NON blocca né fa fallire il salvataggio; salta
se Google non collegato); (4) **cron notturno** `/api/google/cron` (vercel.json, `0 2 * * *`) come
rete di sicurezza per ciò che la (3) perde (runtime serverless terminato prima). Il cron è protetto
da `CRON_SECRET` (header Authorization: Bearer, inviato in automatico da Vercel Cron). NB fire-and-forget
su Vercel non è garantito → la (4) garantisce la consistenza eventuale. Env: GOOGLE_CLIENT_ID/SECRET + Redirect URI {origine}/api/google/callback.
Il redirect_uri usa `resolveBaseUrl` (preferisce NEXT_PUBLIC_APP_URL, fallback origin) → dietro proxy
Vercel deve combaciare ESATTAMENTE con quello registrato su Google Cloud. "Cambia account" = ri-esegue
/api/google/auth (prompt select_account); se l'email cambia il callback resetta `google_calendar_id` a
'primary' (il calendario vecchio non esiste sul nuovo account → 404). NB eventi ferie creati a mano
restano (non taggati) → possono comparire in doppio col nostro.
