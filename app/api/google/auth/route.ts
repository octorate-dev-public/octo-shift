import { NextRequest, NextResponse } from 'next/server';
import { buildAuthUrl } from '@/lib/google';
import { randomBytes } from 'crypto';

export const dynamic = 'force-dynamic';

/** GET /api/google/auth → redirect al consenso Google (offline, prompt=consent). */
export function GET(req: NextRequest) {
  try {
    const redirectUri = `${req.nextUrl.origin}/api/google/callback`;
    const state = randomBytes(16).toString('hex');
    const url = buildAuthUrl(redirectUri, state);
    const res = NextResponse.redirect(url);
    // CSRF: salva lo state in cookie httpOnly, verificato nel callback
    res.cookies.set('g_oauth_state', state, { httpOnly: true, sameSite: 'lax', maxAge: 600, path: '/' });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Errore avvio OAuth';
    return NextResponse.redirect(`${req.nextUrl.origin}/admin/settings?google=error&msg=${encodeURIComponent(msg)}`);
  }
}
