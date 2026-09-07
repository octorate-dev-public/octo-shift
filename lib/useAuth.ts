'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/types';

interface AuthState {
  userId: string | null;
  userName: string;
  userRole: UserRole;
  userEmail: string | null;
  /** true = c'è una sessione ma nessun dipendente collegato (né per id né per email) */
  accountUnlinked: boolean;
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
    userEmail: null,
    accountUnlinked: false,
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

        const sessionEmail = session.user.email ?? null;

        // 1. Match per id (caso normale: users.id === auth uid)
        let { data: userData } = await supabase
          .from('users')
          .select('id, role, full_name')
          .eq('id', session.user.id)
          .maybeSingle();

        // 2. Fallback per EMAIL (case-insensitive): copre il caso in cui la riga
        //    dipendente ha un id diverso dall'account di login (es. login via magic
        //    link che ha creato un uid nuovo, o utenti importati). Ritorna l'id
        //    dell'app → turni/preferenze (chiavati su users.id) tornano visibili.
        if (!userData && sessionEmail) {
          const { data: byEmail } = await supabase
            .from('users')
            .select('id, role, full_name')
            .ilike('email', sessionEmail)
            .limit(1)
            .maybeSingle();
          if (byEmail) userData = byEmail;
        }

        if (!cancelled) {
          if (userData) {
            setAuth({
              userId: userData.id, // id dell'app (non necessariamente l'auth uid)
              userName: userData.full_name ?? sessionEmail ?? 'Utente',
              userRole: (userData.role as UserRole) ?? 'user',
              userEmail: sessionEmail,
              accountUnlinked: false,
              loading: false,
              error: null,
            });
          } else {
            // Sessione valida ma nessun dipendente collegato (né id né email)
            setAuth({
              userId: null,
              userName: sessionEmail ?? 'Utente',
              userRole: 'user',
              userEmail: sessionEmail,
              accountUnlinked: true,
              loading: false,
              error: `L'account ${sessionEmail ?? 'di login'} non è collegato a nessun dipendente. `
                + `Accedi con la tua email di lavoro, oppure chiedi a un amministratore di allineare `
                + `l'email in "Gestione dipendenti".`,
            });
          }
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
              userEmail: null,
              accountUnlinked: false,
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
