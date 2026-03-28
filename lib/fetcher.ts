/**
 * Client-side fetcher that calls our own API routes (which run server-side on Vercel).
 * This ensures all Supabase calls + logging happen on the server → visible in Vercel Logs.
 */

export class FetchError extends Error {
  public status: number;
  public code: string;

  constructor(message: string, status: number, code = 'FETCH_ERROR') {
    super(message);
    this.name = 'FetchError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = path.startsWith('/') ? path : `/${path}`;

  const opts: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  };

  if (body && method !== 'GET') {
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(url, opts);

  if (!res.ok) {
    let errBody: any = {};
    try {
      errBody = await res.json();
    } catch {
      /* empty body */
    }
    throw new FetchError(
      errBody.error ?? `HTTP ${res.status}`,
      res.status,
      errBody.code ?? 'API_ERROR',
    );
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
};
