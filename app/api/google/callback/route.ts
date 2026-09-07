import { NextRequest, NextResponse } from 'next/server';
import { exchangeCode, saveToken, loadToken, setCalendarId, resolveBaseUrl } from '@/lib/google';

export const dynamic = 'force-dynamic';

/** GET /api/google/callback → scambia il code, salva il token, torna alle impostazioni. */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const p = req.nextUrl.searchParams;
  const back = (status: string, msg?: string) =>
    NextResponse.redirect(`${origin}/admin/settings?google=${status}${msg ? `&msg=${encodeURIComponent(msg)}` : ''}`);

  const error = p.get('error');
  if (error) return back('error', error);

  const code = p.get('code');
  const state = p.get('state');
  const cookieState = req.cookies.get('g_oauth_state')?.value;

  if (!code) return back('error', 'Codice mancante');
  if (!state || !cookieState || state !== cookieState) return back('error', 'State non valido (riprova)');

  try {
    const redirectUri = `${resolveBaseUrl(origin)}/api/google/callback`;
    const prev = await loadToken();
    const token = await exchangeCode(code, redirectUri);
    await saveToken(token);
    // Account cambiato → il calendario salvato appartiene all'account vecchio:
    // reset a 'primary' per evitare 404 su sync (scenario "prove con altro account").
    if (prev?.email && token.email && prev.email !== token.email) {
      await setCalendarId('primary');
    }
    const res = back('connected');
    res.cookies.delete('g_oauth_state');
    return res;
  } catch (e) {
    return back('error', e instanceof Error ? e.message : 'Errore scambio token');
  }
}
