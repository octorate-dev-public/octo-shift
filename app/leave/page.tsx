'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { Shift } from '@/types';
import { formatDate, getLeaveColor, getLeaveLabel, parseDateString } from '@/lib/utils';

type LeaveType = 'vacation' | 'permission';

export default function UserLeavePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('Utente');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<LeaveType>('vacation');
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        setUserId(data.user.id);
        setUserName(data.user.email ?? 'Utente');
      }
    };
    init();
  }, []);

  useEffect(() => {
    if (userId) {
      loadData(userId);
    }
  }, [userId]);

  const loadData = async (uid: string) => {
    try {
      setLoading(true);
      setError(null);
      const currentYear = new Date().getFullYear();
      const start = `${currentYear}-01-01`;
      const end = `${currentYear}-12-31`;
      const data = await api.get<Shift[]>(
        `/api/shifts?userId=${uid}&start=${start}&end=${end}`,
      );
      const leaveShifts = data.filter(
        (s) => s.leave_type === 'vacation' || s.leave_type === 'permission',
      );
      leaveShifts.sort((a, b) => b.shift_date.localeCompare(a.shift_date));
      setShifts(leaveShifts);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !formDate) return;
    try {
      setSubmitting(true);
      setAddError(null);
      await api.post('/api/shifts', { userId, shiftDate: formDate, shiftType: formType });
      setShowAddForm(false);
      setFormDate('');
      setFormType('vacation');
      await loadData(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore durante la richiesta';
      setAddError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (shift: Shift) => {
    if (!confirm('Eliminare questa richiesta di assenza?')) return;
    try {
      await api.del(`/api/shifts?userId=${shift.user_id}&shiftDate=${shift.shift_date}`);
      if (userId) await loadData(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore durante l'eliminazione";
      setError(message);
    }
  };

  const formatShiftDate = (dateStr: string) => {
    const d = parseDateString(dateStr);
    return d.toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  const currentYear = new Date().getFullYear();
  const vacationCount = shifts.filter((s) => s.leave_type === 'vacation').length;
  const permissionCount = shifts.filter((s) => s.leave_type === 'permission').length;

  if (loading) {
    return (
      <Layout userRole="user" userName={userName}>
        <div className="flex items-center justify-center h-full">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout userRole="user" userName={userName}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Le Mie Assenze</h1>
            <p className="text-gray-600 mt-2">
              Ferie e permessi per l&apos;anno {currentYear}
            </p>
          </div>
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              setAddError(null);
            }}
            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            {showAddForm ? 'Annulla' : '+ Nuova Richiesta'}
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-lg shadow p-5">
            <p className="text-sm text-gray-500">Giorni di ferie</p>
            <p className="text-3xl font-bold text-yellow-600 mt-1">{vacationCount}</p>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <p className="text-sm text-gray-500">Permessi</p>
            <p className="text-3xl font-bold text-purple-600 mt-1">{permissionCount}</p>
          </div>
        </div>

        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuova Richiesta</h2>
            <form onSubmit={handleAddShift} className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
                  min={`${currentYear}-01-01`}
                  max={`${currentYear}-12-31`}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as LeaveType)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                >
                  <option value="vacation">Ferie</option>
                  <option value="permission">Permesso</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {submitting ? 'Invio...' : 'Invia Richiesta'}
              </button>
            </form>
            {addError && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {addError}
              </p>
            )}
          </div>
        )}

        {/* List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Storico ({shifts.length})
            </h2>
          </div>

          {shifts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">Nessuna assenza registrata</p>
              <p className="text-sm mt-1">
                Usa il pulsante &quot;Nuova Richiesta&quot; per aggiungere ferie o permessi.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stato
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {shifts.map((shift) => (
                  <tr key={shift.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatShiftDate(shift.shift_date)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          shift.leave_type ? getLeaveColor(shift.leave_type) : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {shift.leave_type ? getLeaveLabel(shift.leave_type) : '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {shift.locked ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                          Bloccato
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Attivo
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(shift)}
                        disabled={shift.locked}
                        className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Elimina
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
