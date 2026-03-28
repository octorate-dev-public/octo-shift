'use client';

import React, { useEffect, useState } from 'react';
import { User } from '@/types';
import { onCallAPI } from '@/lib/api/on-call';
import { getInitials } from '@/lib/utils';

export default function PublicOnCallPage() {
  const [onCallUsers, setOnCallUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const loadOnCallUsers = async () => {
      try {
        setLoading(true);
        const data = await onCallAPI.getOnCallForDate(today);
        setOnCallUsers(data);
      } catch (err) {
        console.error('Error loading on-call data:', err);
        setError('Errore nel caricamento dei dati di reperibilità');
      } finally {
        setLoading(false);
      }
    };

    loadOnCallUsers();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-gray-500 text-lg">Caricamento...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8 pt-8">
          <div className="text-5xl mb-4">📞</div>
          <h1 className="text-4xl font-bold text-gray-900">Chi è Reperibile?</h1>
          <p className="text-gray-600 text-lg mt-2">
            {new Date(today).toLocaleDateString('it-IT', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })}
          </p>
        </div>

        {/* On-call list */}
        <div className="space-y-4">
          {onCallUsers.length > 0 ? (
            onCallUsers.map((assignment, index) => (
              <div
                key={assignment.id}
                className="bg-white rounded-lg shadow-lg p-6 transform hover:scale-105 transition"
              >
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="flex-shrink-0 w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 text-white flex items-center justify-center font-bold text-xl">
                    {assignment.user
                      ? getInitials(assignment.user.full_name)
                      : '?'}
                  </div>

                  {/* Info */}
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-gray-900">
                      {assignment.user?.full_name || 'Sconosciuto'}
                    </h2>
                    <p className="text-gray-600 text-lg">
                      📧 {assignment.user?.email || 'N/A'}
                    </p>
                  </div>

                  {/* Badge */}
                  <div className="text-center">
                    <div className="inline-block bg-green-100 text-green-800 px-4 py-2 rounded-full font-semibold">
                      Reperibile
                    </div>
                  </div>
                </div>

                {/* Week info */}
                <div className="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
                  <p>
                    Settimana dal{' '}
                    {new Date(assignment.week_start_date).toLocaleDateString(
                      'it-IT'
                    )}{' '}
                    al{' '}
                    {new Date(assignment.week_end_date).toLocaleDateString(
                      'it-IT'
                    )}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="text-4xl mb-4">😴</div>
              <p className="text-gray-600 text-lg">
                Nessuno è reperibile oggi
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-gray-600 text-sm">
          <p>Questa pagina è pubblica e non richiede login</p>
          <p className="mt-2">
            Ultimo aggiornamento:{' '}
            {new Date().toLocaleTimeString('it-IT', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        </div>

        {error && (
          <div className="mt-6 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
