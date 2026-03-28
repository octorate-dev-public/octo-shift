'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { shiftsAPI } from '@/lib/api/shifts';
import { usersAPI } from '@/lib/api/users';
import { settingsAPI } from '@/lib/api/settings';
import { ShiftWithUser } from '@/types';

export default function AdminDashboard() {
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalShifts: 0,
    officeToday: 0,
    onCallToday: 0,
    maxCapacity: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];

        // Get users count
        const users = await usersAPI.getAllUsers();

        // Get today's shifts
        const todayShifts = await shiftsAPI.getShiftsForDate(today);
        const officeCount = todayShifts.filter(
          (s) => s.shift_type === 'office'
        ).length;

        // Get max capacity
        const maxCapacity = await settingsAPI.getMaxOfficeCapacity();

        setStats({
          totalUsers: users.length,
          totalShifts: todayShifts.length,
          officeToday: officeCount,
          onCallToday: 0, // TODO: Get actual on-call count
          maxCapacity,
        });

        setLoading(false);
      } catch (err) {
        console.error('Error loading stats:', err);
        setError('Errore nel caricamento dei dati');
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading) {
    return (
      <Layout userRole="admin" userName="Admin">
        <div className="flex items-center justify-center h-full">
          <div className="text-gray-500">Caricamento dati...</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        {/* Page title */}
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Admin</h1>
          <p className="text-gray-600 mt-2">
            Benvenuto nel pannello di amministrazione
          </p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Users */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Totale Dipendenti
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.totalUsers}
                </p>
              </div>
              <div className="text-4xl">👥</div>
            </div>
          </div>

          {/* Office Today */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  In Ufficio Oggi
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.officeToday}/{stats.maxCapacity}
                </p>
              </div>
              <div className="text-4xl">🏢</div>
            </div>
            {stats.officeToday > stats.maxCapacity && (
              <div className="mt-3 px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full w-fit">
                ⚠️ Capienza superata
              </div>
            )}
          </div>

          {/* Shifts Today */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Turni Assegnati
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.totalShifts}
                </p>
              </div>
              <div className="text-4xl">📋</div>
            </div>
          </div>

          {/* On Call */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">
                  Reperibilità Oggi
                </p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.onCallToday}
                </p>
              </div>
              <div className="text-4xl">📞</div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Azioni Rapide
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="btn-primary">
              📅 Crea Schedule Mensile
            </button>
            <button className="btn-primary">
              👥 Aggiungi Dipendente
            </button>
            <button className="btn-primary">
              ⚙️ Impostazioni
            </button>
          </div>
        </div>

        {/* Recent activities */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Attività Recenti
          </h2>
          <div className="text-center text-gray-500 py-8">
            Nessuna attività recente
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}
      </div>
    </Layout>
  );
}
