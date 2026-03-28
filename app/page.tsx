'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
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
        // Get user role
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();

        if (!userError && userData?.role === 'admin') {
          router.push('/admin');
        } else {
          router.push('/calendar');
        }
      }
    } catch (err) {
      console.error('Login error:', err);
      setError('Errore durante il login. Riprova.');
    } finally {
      setLoading(false);
    }
  };

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

          {/* Form */}
          <form onSubmit={handleLogin} className="p-8 space-y-6">
            {/* Email */}
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

            {/* Password */}
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

            {/* Error */}
            {error && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold py-3 rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="loading"></span>
                  Accesso in corso...
                </span>
              ) : (
                '🔓 Accedi'
              )}
            </button>
          </form>

          {/* Footer */}
          <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 text-center">
            <p className="text-sm text-gray-600">
              Contatta l'amministratore per le credenziali di accesso
            </p>
          </div>
        </div>

        {/* Demo info */}
        <div className="mt-8 text-center text-white">
          <p className="text-sm opacity-75">
            Versione 1.0.0 - © 2026 SmartWork
          </p>
        </div>
      </div>

      {/* Public on-call link */}
      <div className="fixed bottom-6 right-6 bg-white rounded-lg shadow-lg p-4">
        <p className="text-sm text-gray-600 mb-2">Visualizza reperibilità:</p>
        <a
          href="/public-on-call"
          className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
        >
          📞 Chi è reperibile oggi
        </a>
      </div>
    </div>
  );
}
