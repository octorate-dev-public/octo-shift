import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /auth/callback?code=...
 *
 * Supabase redirects here after the user clicks the magic link in their email.
 * We exchange the code for a session, then redirect to the appropriate page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const code = searchParams.get('code');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;

  if (!code) {
    // No code — redirect to login
    return NextResponse.redirect(`${appUrl}/`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    // Exchange failed — redirect to login with error
    return NextResponse.redirect(`${appUrl}/?error=auth_failed`);
  }

  // Determine user role for redirect
  const { data: userData } = await supabase
    .from('users')
    .select('role')
    .eq('id', data.session.user.id)
    .single();

  const destination = userData?.role === 'admin' ? '/admin' : '/calendar';

  // Build response with redirect
  const response = NextResponse.redirect(`${appUrl}${destination}`);

  return response;
}
