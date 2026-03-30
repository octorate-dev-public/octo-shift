'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { ShiftWithUser, User } from '@/types';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/lib/useAuth';

export default function AdminDashboard() {
  const { userName, userRole, loading: authLoading, logout } = useAuth();
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
        const today = formatDate(new Date());

        const [users, todayShifts, settingsData, onCallData] = await Promise.all([
          api.get<User[]>('/api/users'),
          api.get<ShiftWithUser[]>(`/api/shifts?date=${today}`),
          api.get<Record<string, string>>('/api/settings'),
          api.get<any[]>(`/api/on-call?date=${today}`),
        ]);

        const officeCount = todayShifts.filter((s) => s.shift_type === 'office').length;
        const maxCapacity = settingsData.max_office_capacity
          ? parseInt(settingsData.max_office_capacity)
          : 30;

        setStats({
          totalUsers: users.length,
          totalShifts: todayShifts.length,
          officeToday: officeCount,
          onCallToday: onCallData.length,
          maxCapacity,
        });
      } catch (err: any) {
        console.error('Dashboard load error:', err);
        setError(err.message || 'Errore nel caricamento dei dati');
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  if (loading || authLoading) {
    return (
      <Layout userRole={userRole} userName={userName} onLogout={logout}>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole={userRole} userName={userName} onLogout={logout}>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Admin</h1>
          <p className="text-gray-600 mt-2">Benvenuto nel pannello di amministrazione</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Totale Dipendenti</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalUsers}</p>
              </div>
              <div className="text-4xl">👥</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">In Ufficio Oggi</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.officeToday}/{stats.maxCapacity}
                </p>
              </div>
              <div className="text-4xl">🏢</div>
            </div>
            {stats.officeToday > stats.maxCapacity && (
              <div className="mt-3 px-3 py-1 bg-red-100 text-red-800 text-xs rounded-full w-fit">
                Capienza superata
              </div>
            )}
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Turni Assegnati</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.totalShifts}</p>
              </div>
              <div className="text-4xl">📋</div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-600 text-sm font-medium">Reperibilità Oggi</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.onCallToday}</p>
              </div>
              <div className="text-4xl">📞</div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Azioni Rapide</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <a href="/admin/schedule" className="btn-primary text-center">📅 Crea Schedule Mensile</a>
            <a href="/admin/users" className="btn-primary text-center">👥 Aggiungi Dipendente</a>
            <a href="/admin/settings" className="btn-primary text-center">⚙️ Impostazioni</a>
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
