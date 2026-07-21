# Algoritmi chiave

## 1. Generazione schedule mensile

File: [`lib/api/scheduling.ts`](../lib/api/scheduling.ts) → `generateMonthlySchedule(year, month)`.

### Input

- `users` attivi (con `seniority_date`, `renounce_smart`, `schedule_style`, `team_ids`).
- `settings`: `max_office_capacity`, `work_days`, `holiday:*`.
- `shifts` esistenti (per preservare i `locked` e le righe `leave_type`).
- `shift_preferences` del mese.
- `teams.weekly_meeting_day` per ciascun team.

### Output

`Shift[]` salvati in DB via `shiftsAPI.bulkUpsertShifts`.

### Gerarchia dei pesi (dal più al meno importante)

| Step | Costante | Peso indicativo | Descrizione |
|------|----------|----------------|-------------|
| 1. Equità smart-equivalente | `EQUITY_WEIGHT = 2` | ±2 per ogni giorno sopra/sotto la media | **Smart-equivalente = smart reali + ferie/permessi/malattia** (`smartEquiv`). Le FERIE contano come smart: chi ha molte ferie è sopra media → priorità UFFICIO quando presente (non accumula altro smart, e un rientro da ferie va in ufficio). Bilancia i giorni fuori-ufficio totali tra tutti. **Primario.** |
| 2. Riunione team | `MEETING_BONUS = 10` | quasi-garantisce ufficio | Se oggi è il `weekly_meeting_day` del team dell'utente. |
| 3. Seniority | `SENIORITY_BONUS = 2` | lineare 0…+2 dal junior al senior | Più senior = priorità ufficio leggermente maggiore. |
| 4. Preferenza giorno | `PREF_OFFICE_SCORE = 3`, `PREF_INDIFF_SCORE = 1`, home=0 | Secondaria. Una preferenza home viene "corretta" dopo ~2 giorni smart sopra il target. |
| 5. Stile schedule | `STABLE_WEEKDAY_BONUS = 0.8` oppure `RANDOM_JITTER = 0.5` | Fine-tune. NON deve mai battere meeting/seniority. |
| 6. Random settimanale | `WEEKLY_MIX_JITTER = 0.6` (±0.3) | Seeded su `utente+mese+settimana` (`seededUnit`): stabile entro la settimana, varia tra settimane → ogni tanto composizioni ufficio diverse. Tiebreaker. |
| 7. Mix anzianità | `SENIORITY_MIX = 0.35` | A parità, alterna per settimana il micro-nudge verso l'ufficio tra metà senior e metà junior (`idx < regularCount/2`) → mescola anziani e giovani. Tiebreaker. |

Il punteggio finale per ogni utente in un giorno è la somma. Si ordina decrescente.
Assegnazione ufficio in due passaggi, con **budget ufficio SETTIMANALE** (non mensile):
- Obiettivo smart/settimana = `round(min_smart_days / settimane_del_mese)` (≥1). Le ferie della settimana contano verso l'obiettivo: `neededSmart = max(0, obiettivo - ferie_settimana)`; cap ufficio settimanale = `presenza_settimana - neededSmart`. Quindi chi ha ferie in una settimana passa i giorni presenti in ufficio (non accumula smart oltre le ferie). `userOfficeUsedWeek` si azzera a ogni nuova settimana (`weekOf(ds) = ceil(giorno/7)`, monotono → nessun reset a metà settimana per festivi).
- **Pass 1** — ufficio ai migliori per score **con budget settimanale residuo**, fino a `max_office_capacity`. Chi ha raggiunto il tetto ufficio della settimana va in smart anche se c'è posto → smart distribuito su OGNI settimana, niente cluster.
- **Pass 2** — se l'ufficio è sotto il floor `minOfficePerDay = min(max, max(1, ceil(max/3)))`, promuove a ufficio i regular in smart preferendo chi ha meno ufficio quella settimana (sfora il budget), fino al floor. Garantisce ≥1 in ufficio se c'è un assegnabile.

Quindi capienza giornaliera ufficio ∈ `[⌈max/3⌉, max]` (≥1 se possibile), e lo smart è spalmato per settimana ~`min_smart_days/settimane` (chiave settings `min_smart_days`, default 8).

### Regole hard

1. I `locked` non si toccano mai (vengono solo "letti" per contabilizzarli nella capienza).
2. Le assenze (`leave_type` non null oppure legacy `shift_type ∈ {sick,vacation,permission}`) sono **escluse** dal pool di equità. Base sotto l'overlay: le assenze **non-locked** ricevono base `smartwork` (mai `office`), così una revoca del permesso non può mai sfondare la capienza ufficio. **Eccezione**: un `locked` con base `office` consuma capienza **anche** con overlay ferie/permesso (revocabile → posto prenotato).
3. `renounce_smart = true`: assegnati per primi, sempre ufficio se c'è capienza. Esclusi dalla media di equità.
4. Giorni non lavorativi (`work_days`/`holiday:*`): solo i `locked` sopravvivono, tutto il resto viene cancellato.
5. La media dello smart-equivalente (target equità) si calcola SOLO sui regular (non-renouncing) presenti. Si tracciano `userSmartDays` (smart reali) e `userFerieDays` (ferie/permessi/malattia); `smartEquiv = smart + ferie`.

### Tracking pattern weekday per `stable`

Si tiene `userOfficeWeekdays: Map<userId, Set<dayOfWeek>>` e `userSmartWeekdays`
durante l'iterazione. Nelle settimane successive del mese, un utente `stable` che
lunedì scorso era in ufficio prende `+STABLE_WEEKDAY_BONUS` questo lunedì.

### Funzioni accessorie

- `rebalanceSchedule(y, m)`: sposta i meno senior da ufficio→smart finché ogni
  giorno rispetta `max_office_capacity`.
- `validateSchedule(y, m)`: restituisce `string[]` con le violazioni (capienza superata).

## 2. Rotazione on-call annuale

File: [`lib/api/on-call.ts`](../lib/api/on-call.ts) → `generateAnnualOnCall(year, userIds)`.

Tabella target: `on_call_daily_assignments`.

### Regole

- Blocchi di 7 giorni allineati al **primo lunedì** (incluso → primo blocco può iniziare prima del 1 gennaio).
- Round-robin sugli `userIds` (chi è `on_call_available = true`).
- Se l'utente in turno ha **ferie ≥ 4 giorni** nella settimana (`leave_type = 'vacation'`), si salta al successivo.
- Massimo 7 giorni consecutivi per blocco (garantito dalla struttura).
- Cancella e ricrea l'intero anno (DELETE → INSERT a batch di 100).

### Operazioni adiacenti

- `reassignDay(date, newUserId)` — riassegna un singolo giorno (upsert).
- `swapDayRanges(u1, dates1, u2, dates2)` — scambia due intervalli (upsert massivo).

### Fallback

`getOnCallForDate(date)` prova prima `on_call_daily_assignments`. Se vuoto, ricade
sulla vecchia `on_call_assignments` settimanale.

## 3. Swap atomico di due turni

File: [`lib/api/swap-requests.ts`](../lib/api/swap-requests.ts) → `acceptSwapRequest`.

Problema: `UNIQUE(user_id, shift_date)` su `shifts`. Se due turni cadono **nello
stesso giorno**, lo swap "naive" (UPDATE A poi UPDATE B) violerebbe il vincolo.

Soluzione:

1. Il constraint è stato reso **DEFERRABLE INITIALLY DEFERRED** (vedi migration `2026-05-18-swap-shift-function.sql`).
2. La funzione RPC `swap_shift_users(p_requester_shift_id, p_responder_shift_id)` esegue una **single UPDATE con CASE**.
3. Il client chiama `supabase.rpc('swap_shift_users', { ... })` dentro `acceptSwapRequest`.

**Conseguenza:** dopo questa modifica, nessun `upsert/.../onConflict` su `shifts` è
più permesso (Postgres non accetta constraint deferrable come arbitri di
`ON CONFLICT`). Vedi i commenti dettagliati in `shiftsAPI.upsertShift` /
`bulkUpsertShifts` e [gotchas.md](./gotchas.md).

## 4. Stati delle richieste di swap

```
pending ─┬─→ accepted   (responder accetta → swap eseguito)
         ├─→ cancelled  (requester annulla)
         └─→ escalated  (responder rifiuta → admin decide)
                  └─→ rejected (admin rifiuta definitivamente)
```

## 5. Import KEROS

File: [`lib/keros.ts`](../lib/keros.ts) + [`/app/api/keros/route.ts`](../app/api/keros/route.ts).

Flusso scraping (KEROS non ha API):

1. `GET /servlet/hlogin` → estrai `GXState` (anti-forgery).
2. `POST /servlet/hlogin` → login, ottieni cookie sessione.
3. `GET /servlet/hgestrautorresp` → nuovo `GXState`.
4. `POST /servlet/hgestrautorresp?0,,,,0` → query autorizzazioni.
5. Parse HTML → righe griglia.

Credenziali con priorità: `settings.keros_username/password` (cifrate via AES-256-GCM,
chiave in `ENCRYPTION_KEY`) → variabili d'ambiente `KEROS_USERNAME/PASSWORD`.

Match utente: `matchUserByKerosName` confronta `nominativo` ("COGNOME NOME") con `users.full_name`.

## 6. Feed ICS

File: [/app/api/ics/route.ts](../app/api/ics/route.ts).

- Senza auth: l'UID utente è il token (`/api/ics?uid=<userId>`).
- Eventi: UFFICIO 09:00–09:05 con location, SMART tutto-il-giorno, REPERIBILITÀ 18:00→09:00 del giorno dopo (blocchi consecutivi unificati).
- VTIMEZONE inline per Europe/Rome.

## 7. Calcolo ore permesso

`computePermissionHours(start, end)` in [`lib/utils.ts`](../lib/utils.ts) sottrae
la pausa pranzo 13:00–14:00 dal range. `formatPermissionNote` genera la stringa
"dalle 09:00 alle 12:00 (3h)" salvata in `shifts.leave_note`.
