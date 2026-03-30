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
  error: string | null;
}

/**
 * Hook per gestire autenticazione e sessione.
 *
 * - Controlla se l'utente ha una sessione attiva.
 * - Se non loggato, redirige a `/`.
 * - Fornisce userId, userName, userRole, error.
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
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    const loadSession = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          console.error('useAuth getSession error:', sessionError);
          if (!cancelled) {
            setAuth((prev) => ({
              ...prev,
              loading: false,
              error: `Errore sessione: ${sessionError.message}`,
            }));
          }
          if (requireAuth) router.push('/');
          return;
        }

        if (!session?.user) {
          if (requireAuth) router.push('/');
          if (!cancelled) setAuth((prev) => ({ ...prev, loading: false }));
          return;
        }

        // Fetch role and name from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role, full_name')
          .eq('id', session.user.id)
          .single();

        if (userError) {
          console.error('useAuth user fetch error:', userError);
        }

        if (!cancelled) {
          setAuth({
            userId: session.user.id,
            userName: userData?.full_name ?? session.user.email ?? 'Utente',
            userRole: (userData?.role as UserRole) ?? 'user',
            loading: false,
            error: userError
              ? `Utente autenticato ma errore nel recupero profilo: ${userError.message}`
              : null,
          });
        }
      } catch (err) {
        console.error('useAuth unexpected error:', err);
        const message = err instanceof Error ? err.message : 'Errore sconosciuto';
        if (!cancelled) {
          setAuth((prev) => ({
            ...prev,
            loading: false,
            error: `Errore di autenticazione: ${message}`,
          }));
        }
        if (requireAuth) router.push('/');
      }
    };

    loadSession();

    // Listen for auth changes (sign-out, token refresh, etc.)
    let subscription: { unsubscribe: () => void } | null = null;
    try {
      const { data } = supabase.auth.onAuthStateChange(async (event) => {
        if (event === 'SIGNED_OUT') {
          if (!cancelled) {
            setAuth({
              userId: null,
              userName: 'Utente',
              userRole: 'user',
              loading: false,
              error: null,
            });
            router.push('/');
          }
        }
      });
      subscription = data.subscription;
    } catch (err) {
      console.error('useAuth onAuthStateChange error:', err);
    }

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, [requireAuth, router]);

  const logout = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Logout error:', err);
    }
    router.push('/');
  }, [router]);

  return { ...auth, logout };
}
