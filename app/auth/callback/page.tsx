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
    let done = false;

    const resolveAndGo = async (u: { id: string; email?: string | null }) => {
      if (done) return;
      done = true;
      try {
        let userData: { role?: string } | null = null;
        const byId = await supabase.from('users').select('role').eq('id', u.id).maybeSingle();
        userData = byId.data;
        if (!userData && u.email) {
          const byEmail = await supabase.from('users').select('role').ilike('email', u.email).limit(1).maybeSingle();
          userData = byEmail.data;
        }
        // Se non collegato, useAuth sulla pagina di destinazione rimanda a /?error=unlinked
        router.replace(userData?.role === 'admin' ? '/admin' : '/calendar');
      } catch {
        router.replace('/calendar');
      }
    };

    // Caso 1: sessione già presente all'arrivo (l'evento SIGNED_IN potrebbe non scattare)
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) resolveAndGo(session.user);
    });

    // Caso 2: la sessione arriva ora (scambio del code del magic link)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) resolveAndGo(session.user);
    });

    // Rete di sicurezza: non restare bloccati su "Accesso in corso…"
    const safety = setTimeout(() => { if (!done) router.replace('/'); }, 8000);

    return () => { clearTimeout(safety); subscription.unsubscribe(); };
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
