# Data model

Tutti i tipi sono in [/types/index.ts](../types/index.ts) — **non ridefinirli inline**.
Lo schema iniziale è in [/supabase-schema.sql](../supabase-schema.sql), le migrazioni
successive in [/migrations/](../migrations/).

## Tabelle Postgres

| Tabella | File | Note |
|---------|------|------|
| `users` | schema | Lega a Supabase Auth via UUID condiviso. Vedi `team_id` legacy + tabella join `user_teams`. |
| `teams` | schema | `weekly_meeting_day` ('monday'…'sunday') usato nello scheduler. `color` hex. |
| `user_teams` | schema | Join many-to-many (un utente può stare in più team). |
| `shifts` | schema | `shift_type` ∈ {'office','smartwork'}. `leave_type` ∈ {sick,vacation,permission} **overlay** opzionale. `UNIQUE(user_id, shift_date)` **DEFERRABLE** (vedi gotcha). `locked` blocca lo scheduler. |
| `shift_swap_requests` | schema | Stati: `pending` → `accepted` \| `cancelled` \| `escalated` → `rejected`. |
| `shift_preferences` | schema | `'home'`/`'office'`/`'indifferent'`. `'indifferent'` = nessun record (default). Chiave su (`user_id`, `preference_date`). |
| `on_call_assignments` | schema (legacy) | Granularità settimanale. Mantenuta come fallback. |
| `on_call_daily_assignments` | migrations/2026-05-14-on-call-daily.sql | Granularità giornaliera. **Attuale.** |
| `settings` | schema | Coppie key/value. Chiavi speciali: `holiday:YYYY-MM-DD` (festività), `keros_username/password` (sensibili, cifrate AES-256-GCM). |
| `google_calendar_syncs` | schema | Storico, oggi sostituito dal feed ICS. |
| `audit_logs` | schema | Non ancora popolato attivamente — riservato. |

## Migrazioni applicate (post-schema)

- `2026-04-09-add-leave-type.sql` — aggiunge la colonna `leave_type` (overlay).
- `2026-05-14-on-call-daily.sql` — nuova tabella `on_call_daily_assignments`.
- `2026-05-18-schedule-style.sql` — colonna `schedule_style` ('stable'|'random') su `users`.
- `2026-05-18-swap-shift-function.sql` — funzione RPC `swap_shift_users` per swap atomico.

## Modello "shift + leave overlay" — IMPORTANTE

Storicamente esistevano due rappresentazioni di un'assenza:

1. **Legacy:** `shift_type` poteva essere `'vacation' | 'permission' | 'sick'`.
2. **Attuale:** `shift_type` è solo `'office' | 'smartwork'` + `leave_type` overlay.

Il codice **deve gestirle entrambe** perché possono coesistere finché vecchi
record non vengono migrati. Usa SEMPRE gli helper in `lib/utils.ts`:

- `isAbsenceShiftType(shiftType)` — solo string check (legacy)
- `isAbsenceShift({ shift_type, leave_type })` — riconosce overlay + legacy
- `isOfficePresence(shift)` — `office` E non in assenza
- `isSmartPresence(shift)` — `smartwork` E non in assenza

Le assenze **NON consumano** capienza ufficio né contano nello smart-day equity.

## Note utente importanti

- `seniority_date` (DATE) — usata per tiebreaking nello scheduling (vedi `getSeniorityDays`).
- `renounce_smart` (bool) — escluso dal pool di equità: va sempre in ufficio per primo.
- `on_call_available` (bool) — true = entra nella rotazione on-call.
- `schedule_style` ∈ {`stable`, `random`} — stable = tendenzialmente stesso giorno smart ogni settimana, random = distribuzione variata.
- `skill_roles` (text[]) — ruoli tecnici multipli (es. `['BACKEND', 'QUALITY']`). Lista configurabile in `settings.user_skill_roles` (default `BACKEND,FRONTEND,QUALITY`). Migrazione: `2026-05-22-add-skill-roles.sql`.
- `team_ids: string[]` — campo VIRTUALE (popolato in [`usersAPI`](../lib/api/users.ts) dal join `user_teams`). `team_id` resta come legacy single-team.

## Tipi calcolati (non DB)

- `DayShifts`, `MonthCalendar`, `ShiftStats`, `OnCallYearStats` — solo lato applicazione.

## Vedi anche

- [algorithms.md](./algorithms.md) per come `seniority_date`, `renounce_smart`, `schedule_style` entrano nello scheduler.
- [gotchas.md](./gotchas.md) per il constraint UNIQUE deferrable e perché niente `ON CONFLICT` su `shifts`.
