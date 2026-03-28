/**
 * Helper for Next.js API route handlers.
 * Wraps each handler with:
 *  - structured logging (visible in Vercel Runtime Logs)
 *  - error catching → consistent JSON error responses
 *  - request timing
 */

import { NextRequest, NextResponse } from 'next/server';
import { createLogger, AppError, toAppError } from './logger';

const log = createLogger('api-handler');

type HandlerFn = (
  req: NextRequest,
  ctx: { params: Record<string, string> },
) => Promise<NextResponse | Response>;

/**
 * Wrap a route handler so every request is logged and errors are caught.
 *
 * Usage in a route.ts:
 * ```ts
 * export const GET = withHandler('shifts', 'GET', async (req) => { ... });
 * ```
 */
export function withHandler(
  module: string,
  method: string,
  handler: HandlerFn,
): HandlerFn {
  const hLog = createLogger(module);

  return async (req, ctx) => {
    const start = performance.now();
    const url = req.nextUrl.pathname + req.nextUrl.search;

    hLog.info(`${method} ${url}`, 'Request received', {
      method,
      url,
      userAgent: req.headers.get('user-agent') ?? undefined,
    });

    try {
      const res = await handler(req, ctx);
      const durationMs = Math.round(performance.now() - start);

      hLog.info(`${method} ${url}`, `Completed ${res.status}`, {
        status: res.status,
        durationMs,
      });

      return res;
    } catch (err: unknown) {
      const durationMs = Math.round(performance.now() - start);
      const appErr = err instanceof AppError ? err : toAppError(err);

      hLog.error(`${method} ${url}`, appErr.message, appErr, {
        durationMs,
        code: appErr.code,
        httpStatus: appErr.httpStatus,
      });

      return NextResponse.json(
        {
          error: appErr.message,
          code: appErr.code,
        },
        { status: appErr.httpStatus },
      );
    }
  };
}

/**
 * Convenience: return JSON with status 200.
 */
export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Convenience: return 204 No Content.
 */
export function noContent() {
  return new NextResponse(null, { status: 204 });
}

/**
 * Parse JSON body safely; throws AppError on invalid JSON.
 */
export async function parseBody<T = any>(req: NextRequest): Promise<T> {
  try {
    return await req.json();
  } catch {
    throw new AppError('Body JSON non valido', { code: 'INVALID_JSON', httpStatus: 400 });
  }
}

/**
 * Read a search-param or throw 400.
 */
export function requireParam(req: NextRequest, name: string): string {
  const val = req.nextUrl.searchParams.get(name);
  if (!val) {
    throw new AppError(`Parametro "${name}" obbligatorio`, {
      code: 'MISSING_PARAM',
      httpStatus: 400,
    });
  }
  return val;
}
