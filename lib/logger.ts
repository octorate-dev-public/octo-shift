/**
 * Centralized logger for SmartWork Scheduler.
 *
 * On Vercel, console.log / console.error are captured automatically
 * and shown in the Log Drains / Runtime Logs panel.
 * This module adds structure so every log line is machine-parseable
 * (JSON) while staying human-readable in the browser console.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  module: string;
  action: string;
  message: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    code?: string;
    stack?: string;
  };
  timestamp: string;
}

const IS_SERVER = typeof window === 'undefined';
const IS_PROD = process.env.NODE_ENV === 'production';

function serialize(entry: LogEntry): string {
  // In production (Vercel) emit JSON for Log Drains / Datadog / etc.
  if (IS_PROD && IS_SERVER) {
    return JSON.stringify(entry);
  }
  // In development emit a human-friendly string
  const tag = `[${entry.level.toUpperCase()}][${entry.module}]`;
  const dur = entry.durationMs != null ? ` (${entry.durationMs}ms)` : '';
  const meta = entry.meta ? ` ${JSON.stringify(entry.meta)}` : '';
  const err = entry.error ? ` | ERR: ${entry.error.message}` : '';
  return `${tag} ${entry.action}: ${entry.message}${dur}${meta}${err}`;
}

function emit(entry: LogEntry) {
  const line = serialize(entry);
  switch (entry.level) {
    case 'error':
      console.error(line);
      break;
    case 'warn':
      console.warn(line);
      break;
    case 'debug':
      if (!IS_PROD) console.debug(line);
      break;
    default:
      console.log(line);
  }
}

/**
 * Create a scoped logger for a specific module (e.g. "shiftsAPI").
 *
 * Usage:
 * ```ts
 * const log = createLogger('shiftsAPI');
 * log.info('getMonthShifts', 'Loaded 42 shifts', { year: 2026, month: 4 });
 * log.error('upsertShift', 'Insert failed', err, { userId: '...' });
 * ```
 */
export function createLogger(module: string) {
  const base = (
    level: LogLevel,
    action: string,
    message: string,
    errorOrMeta?: Error | Record<string, unknown>,
    meta?: Record<string, unknown>,
  ) => {
    const entry: LogEntry = {
      level,
      module,
      action,
      message,
      timestamp: new Date().toISOString(),
    };

    if (errorOrMeta instanceof Error) {
      entry.error = {
        name: errorOrMeta.name,
        message: errorOrMeta.message,
        code: (errorOrMeta as any).code,
        stack: IS_PROD ? undefined : errorOrMeta.stack,
      };
      if (meta) entry.meta = meta;
    } else if (errorOrMeta) {
      entry.meta = errorOrMeta;
    }

    emit(entry);
  };

  return {
    debug: (action: string, message: string, meta?: Record<string, unknown>) =>
      base('debug', action, message, meta),
    info: (action: string, message: string, meta?: Record<string, unknown>) =>
      base('info', action, message, meta),
    warn: (action: string, message: string, meta?: Record<string, unknown>) =>
      base('warn', action, message, meta),
    error: (action: string, message: string, err?: Error, meta?: Record<string, unknown>) =>
      base('error', action, message, err, meta),

    /**
     * Wrap an async function with automatic timing + error logging.
     *
     * ```ts
     * const shifts = await log.withTiming('getMonthShifts', { year }, async () => {
     *   return await supabase.from('shifts')...
     * });
     * ```
     */
    withTiming: async <T>(
      action: string,
      meta: Record<string, unknown>,
      fn: () => Promise<T>,
    ): Promise<T> => {
      const start = performance.now();
      try {
        const result = await fn();
        const durationMs = Math.round(performance.now() - start);
        const entry: LogEntry = {
          level: 'info',
          module,
          action,
          message: 'OK',
          durationMs,
          meta,
          timestamp: new Date().toISOString(),
        };
        emit(entry);
        return result;
      } catch (err) {
        const durationMs = Math.round(performance.now() - start);
        const e = err instanceof Error ? err : new Error(String(err));
        const entry: LogEntry = {
          level: 'error',
          module,
          action,
          message: 'FAILED',
          durationMs,
          meta,
          error: {
            name: e.name,
            message: e.message,
            code: (e as any).code,
            stack: IS_PROD ? undefined : e.stack,
          },
          timestamp: new Date().toISOString(),
        };
        emit(entry);
        throw err;
      }
    },
  };
}

/**
 * Wrap a Supabase error so we always get a proper Error object
 * and don't leak internal details in production.
 */
export class AppError extends Error {
  public readonly code: string;
  public readonly httpStatus: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    opts: { code?: string; httpStatus?: number; cause?: unknown; context?: Record<string, unknown> } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = opts.code ?? 'UNKNOWN';
    this.httpStatus = opts.httpStatus ?? 500;
    this.context = opts.context;
    if (opts.cause) (this as any).cause = opts.cause;
  }
}

/**
 * Convert a raw Supabase/Postgres error into an AppError.
 */
export function toAppError(
  raw: unknown,
  fallbackMessage = 'Operazione fallita',
): AppError {
  if (raw instanceof AppError) return raw;

  const err = raw as any;
  const pgCode: string | undefined = err?.code;
  const pgMessage: string | undefined = err?.message;
  const pgDetails: string | undefined = err?.details;

  // Map common Postgres error codes to user-friendly messages
  const friendlyMap: Record<string, string> = {
    '23505': 'Record già esistente (duplicato)',
    '23503': 'Riferimento a record inesistente',
    '42P01': 'Tabella non trovata — lo schema potrebbe non essere stato applicato',
    PGRST116: 'Record non trovato',
  };

  const friendly = pgCode ? friendlyMap[pgCode] : undefined;

  return new AppError(friendly ?? pgMessage ?? fallbackMessage, {
    code: pgCode ?? 'DB_ERROR',
    httpStatus: pgCode === 'PGRST116' ? 404 : 500,
    cause: raw,
    context: pgDetails ? { details: pgDetails } : undefined,
  });
}
