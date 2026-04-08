'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

/**
 * /auth/callback (client-side)
 *
 * Supabase redirects here after magic link click.
 * The client SDK detects the code in the URL, retrieves the PKCE
 * code_verifier from localStorage, exchanges the code for a session,
 * and fires onAuthStateChange('SIGNED_IN').
 */
export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          const { data: userData } = await supabase
            .from('users')
            .select('role')
            .eq('id', session.user.id)
            .single();

          router.replace(userData?.role === 'admin' ? '/admin' : '/calendar');
        }
      },
    );

    return () => subscription.unsubscribe();
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-white text-sm mt-4 opacity-75">Accesso in corso…</p>
      </div>
    </div>
  );
}
