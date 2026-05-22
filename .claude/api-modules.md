# Moduli API

## Pattern

```
app/api/<resource>/route.ts   ← thin: parsing + dispatch
        │
        └─→ lib/api/<resource>.ts   ← business logic
                │
                └─→ lib/supabase.ts
```

Tutte le route esportano `GET/POST/PATCH/DELETE` wrappate da
[`withHandler(module, method, fn)`](../lib/api-handler.ts):

```ts
export const POST = withHandler('api/shifts', 'POST', async (req) => {
  const body = await parseBody(req);
  // ...
  return jsonOk(data, 201);
});
```

`withHandler` aggiunge automaticamente: logging strutturato in/out, timing,
cattura errori → `AppError` → JSON `{ error, code }` con HTTP status corretto.
Lancia errori con `throw toAppError(err, 'msg user-friendly')` — mai `try/catch` muto.

## Corrispondenza endpoint ⇄ modulo

| Endpoint | Route handler | Modulo logica |
|----------|---------------|---------------|
| `/api/shifts` | [route.ts](../app/api/shifts/route.ts) | [shiftsAPI](../lib/api/shifts.ts) |
| `/api/users` | [route.ts](../app/api/users/route.ts) | [usersAPI](../lib/api/users.ts) |
| `/api/teams` | [route.ts](../app/api/teams/route.ts) | [teamsAPI](../lib/api/teams.ts) |
| `/api/on-call` | [route.ts](../app/api/on-call/route.ts) | [onCallAPI](../lib/api/on-call.ts) |
| `/api/scheduling` | [route.ts](../app/api/scheduling/route.ts) | [schedulingAPI](../lib/api/scheduling.ts) |
| `/api/swap-requests` | [route.ts](../app/api/swap-requests/route.ts) | [swapRequestsAPI](../lib/api/swap-requests.ts) |
| `/api/preferences` | [route.ts](../app/api/preferences/route.ts) | [preferencesAPI](../lib/api/preferences.ts) |
| `/api/settings` | [route.ts](../app/api/settings/route.ts) | [settingsAPI](../lib/api/settings.ts) |
| `/api/keros` | [route.ts](../app/api/keros/route.ts) | [`lib/keros.ts`](../lib/keros.ts) |
| `/api/ics` | [route.ts](../app/api/ics/route.ts) | inline (genera feed iCalendar) |
| `/api/health` | [route.ts](../app/api/health/route.ts) | inline (ping Supabase) |
| `/api/admin/sync-auth-users` | [route.ts](../app/api/admin/sync-auth-users/route.ts) | one-shot — usa service role key |

## Forma comune di un modulo `lib/api/<dom>.ts`

```ts
const log = createLogger('domAPI');
export const domAPI = {
  async getX(...): Promise<...> {
    return log.withTiming('getX', { meta }, async () => {
      const { data, error } = await supabase.from('table')...;
      if (error) throw toAppError(error, 'Messaggio italiano user-friendly');
      return data || [];
    });
  },
  async createX(...): Promise<...> { /* idem */ },
  // ...
};
```

Vincoli da rispettare per restare DRY:

1. **Mai un nuovo `createClient(...)`**. Usa il singleton in [`lib/supabase.ts`](../lib/supabase.ts). Lato server con service role usa `getServerSupabaseClient()`.
2. **Mai `console.log` diretto**. Usa `createLogger('moduleName')`.
3. **Sempre `toAppError(err, fallback)`** per propagare gli errori — il mapping di codici Postgres è già fatto (`23505` → duplicato, `PGRST116` → not found, …).
4. **Sempre `log.withTiming`** intorno alle operazioni DB — è il modo in cui Vercel Logs sa quanto ci hai messo.
5. **Mai chiamate fetch dirette dal browser a Supabase business tables.** Tutto passa per `/api/*` via [`lib/fetcher.ts`](../lib/fetcher.ts).

## Endpoint con sotto-azioni (action dispatch)

Alcune route usano `action` nel body per evitare di proliferare endpoint:

- `POST /api/scheduling` con `{ action: 'generate'|'rebalance'|'validate', year, month }`
- `PATCH /api/shifts` con `{ action: 'lock'|'unlock'|'setLeave', ... }`

Se aggiungi una nuova action, **aggiorna anche [pages.md](./pages.md)** se la
pagina che la chiama cambia comportamento.

## Sicurezza

- **Chiavi sensibili** (`keros_username`, `keros_password`) non vengono mai
  esposte in chiaro da `/api/settings`. Vedi `SENSITIVE_KEYS` in `route.ts` e
  cifratura AES-256-GCM in [`lib/crypto.ts`](../lib/crypto.ts).
- `SUPABASE_SERVICE_ROLE_KEY` solo lato server (`getServerSupabaseClient`).
  Non finisce mai in variabili `NEXT_PUBLIC_*`.
