'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

interface AuthState {
  userId: string | null;
  userName: string;
  userRole: UserRole;
  loading: boolean;
}

/**
 * Hook per gestire autenticazione e sessione.
 *
 * - Controlla se l'utente ha una sessione attiva.
 * - Se non loggato, redirige a `/`.
 * - Fornisce userId, userName, userRole.
 * - Fornisce `logout()` per sign-out + redirect.
 *
 * @param options.requireAuth  se true (default), redirige al login se non autenticato
 */
export function useAuth(options?: { requireAuth?: boolean }) {
  const requireAuth = options?.requireAuth ?? true;
  const router = useRouter();

  const [auth, setAuth] = useState<AuthState>({
    userId: null,
    userName: 'Utente',
    userRole: 'user',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (!session?.user) {
          if (requireAuth) router.push('/');
          if (!cancelled) setAuth((prev) => ({ ...prev, loading: false }));
          return;
        }

        // Fetch role and name from users table
        const { data: userData } = await supabase
          .from('users')
          .select('role, full_name')
          .eq('id', session.user.id)
          .single();

        if (!cancelled) {
          setAuth({
            userId: session.user.id,
            userName: userData?.full_name ?? session.user.email ?? 'Utente',
            userRole: (userData?.role as UserRole) ?? 'user',
            loading: false,
          });
        }
      } catch {
        if (requireAuth) router.push('/');
        if (!cancelled) setAuth((prev) => ({ ...prev, loading: false }));
      }
    };

    loadSession();

    // Listen for auth changes (sign-out, token refresh, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event) => {
        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
            setAuth({ userId: null, userName: 'Utente', userRole: 'user', loading: false });
            router.push('/');
          }
        }
      },
    );

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [requireAuth, router]);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    router.push('/');
  }, [router]);

  return { ...auth, logout };
}
