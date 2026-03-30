'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

type LoginMode = 'password' | 'magic-link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<LoginMode>('password');
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  // Check if user is already logged in
  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await redirectByRole(session.user.id);
        }
      } catch {
        // No session, stay on login
      } finally {
        setCheckingSession(false);
      }
    };
    checkSession();

    // Listen for auth state changes (e.g. magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          await redirectByRole(session.user.id);
        }
      },
    );

    return () => subscription.unsubscribe();
  }, []);

  const redirectByRole = async (userId: string) => {
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('id', userId)
      .single();

    if (!userError && userData?.role === 'admin') {
      router.push('/admin');
    } else {
      router.push('/calendar');
    }
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError('Email o password non validi');
        return;
      }

      if (data.user) {
        await redirectByRole(data.user.id);
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Errore durante il login. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMagicLinkSent(false);
    setLoading(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error: magicError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });

      if (magicError) {
        setError('Errore nell\'invio del magic link. Verifica l\'email e riprova.');
        return;
      }

      setMagicLinkSent(true);
    } catch (err) {
      console.error('Magic link error:', err);
      setError('Errore durante l\'invio. Riprova.');
    } finally {
      setLoading(false);
    }
  };

  // Show loading while checking session
  if (checkingSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      {/* Background pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute top-0 left-0 text-6xl">📅</div>
        <div className="absolute top-20 right-10 text-5xl">👥</div>
        <div className="absolute bottom-20 left-10 text-5xl">🏢</div>
        <div className="absolute bottom-10 right-20 text-6xl">📞</div>
      </div>

      <div className="relative w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 pt-8 pb-6 text-center">
            <div className="inline-block bg-white bg-opacity-20 rounded-lg p-3 mb-4">
              <div className="text-4xl">📅</div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              SmartWork Scheduler
            </h1>
            <p className="text-blue-100">
              Gestione smartworking e scheduling
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => { setMode('password'); setError(null); setMagicLinkSent(false); }}
              className={`flex-1 py-3 text-sm font-medium transition ${
                mode === 'password'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Email e Password
            </button>
            <button
              type="button"
              onClick={() => { setMode('magic-link'); setError(null); setMagicLinkSent(false); }}
              className={`flex-1 py-3 text-sm font-medium transition ${
                mode === 'magic-link'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Magic Link
            </button>
          </div>

          {/* Form */}
          {mode === 'password' ? (
            <form onSubmit={handlePasswordLogin} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="tuo@email.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                  required
                />
              </div>

              {error && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Accesso in corso...
                  </span>
                ) : (
                  'Accedi'
                )}
              </button>
            </form>
          ) : (
            <form onSubmit={handleMagicLink} className="p-8 space-y-6">
              {magicLinkSent ? (
                <div className="text-center space-y-4">
                  <div className="text-5xl">📧</div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Controlla la tua email
                  </h2>
                  <p className="text-sm text-gray-600">
                    Abbiamo inviato un link di accesso a <strong>{email}</strong>.
                    Clicca il link nell&apos;email per accedere.
                  </p>
                  <button
                    type="button"
                    onClick={() => setMagicLinkSent(false)}
                    className="text-sm text-blue-600 hover:text-blue-800 underline"
                  >
                    Invia di nuovo
                  </button>
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tuo@email.com"
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      required
                    />
                  </div>

                  <p className="text-sm text-gray-500">
                    Riceverai un link via email per accedere senza password.
                  </p>

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Invio in corso...
                      </span>
                    ) : (
                      'Invia Magic Link'
                    )}
                  </button>
                </>
              )}
            </form>
          )}

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              Contatta l&apos;amministratore per le credenziali di accesso
            </p>
          </div>
        </div>

        {/* Version */}
        <div className="mt-8 text-center text-white">
          <p className="text-sm opacity-75">
            Versione 1.0.0 - &copy; 2026 SmartWork
          </p>
        </div>
      </div>

      {/* Public on-call link */}
      <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4">
        <p className="text-sm text-gray-600 mb-2">Visualizza reperibilit&agrave;:</p>
        <a
          href="/public-on-call"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          📞 Chi &egrave; reperibile oggi
        </a>
      </div>
    </div>
  );
}
