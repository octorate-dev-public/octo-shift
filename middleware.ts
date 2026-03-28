import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js Edge Middleware — runs on every matched request BEFORE the handler.
 * Logs are visible in Vercel's "Runtime Logs" → Function → Middleware.
 */
export function middleware(request: NextRequest) {
  const start = Date.now();
  const { pathname, search } = request.nextUrl;
  const method = request.method;

  // Build a structured log line (JSON for Vercel log drains)
  const entry = {
    level: 'info',
    module: 'middleware',
    action: `${method} ${pathname}`,
    message: 'incoming request',
    timestamp: new Date().toISOString(),
    meta: {
      method,
      path: pathname,
      search: search || undefined,
      userAgent: request.headers.get('user-agent')?.slice(0, 120),
      referer: request.headers.get('referer') || undefined,
      ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || undefined,
    },
  };

  console.log(JSON.stringify(entry));

  // Continue to the handler
  const response = NextResponse.next();

  // Add timing header (useful for debugging)
  response.headers.set('x-middleware-timing', `${Date.now() - start}ms`);

  return response;
}

export const config = {
  // Run middleware on API routes + pages, skip static assets
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
