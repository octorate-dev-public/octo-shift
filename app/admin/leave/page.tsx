'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { Shift, User } from '@/types';
import { formatDate, getInitials, getLeaveColor, getLeaveLabel, parseDateString } from '@/lib/utils';

type LeaveType = 'vacation' | 'permission';
type FilterType = 'all' | 'vacation' | 'permission';

export default function AdminLeavePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add absence form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formUserId, setFormUserId] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState<LeaveType>('vacation');
  const [addingShift, setAddingShift] = useState(false);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [shiftsData, usersData] = await Promise.all([
        api.get<Shift[]>(`/api/shifts?year=${year}&month=${month}`),
        api.get<User[]>('/api/users'),
      ]);
      setUsers(usersData);
      setAllShifts(shiftsData.filter((s) => s.leave_type === 'vacation' || s.leave_type === 'permission'));
      if (usersData.length > 0 && !formUserId) {
        setFormUserId(usersData[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month - 1 + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  const handleDelete = async (shift: Shift) => {
    if (!confirm('Eliminare questa assenza?')) return;
    try {
      await api.del(`/api/shifts?userId=${shift.user_id}&shiftDate=${shift.shift_date}`);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore durante l\'eliminazione';
      setError(message);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUserId || !formDate) return;
    try {
      setAddingShift(true);
      await api.post('/api/shifts', { userId: formUserId, shiftDate: formDate, shiftType: formType });
      setShowAddForm(false);
      setFormDate('');
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore durante l\'aggiunta';
      setError(message);
    } finally {
      setAddingShift(false);
    }
  };

  const getUserById = (id: string) => users.find((u) => u.id === id);

  const filteredShifts = allShifts
    .filter((s) => filter === 'all' || s.leave_type === filter)
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const formatShiftDate = (dateStr: string) => {
    const d = parseDateString(dateStr);
    return d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Assenze</h1>
            <p className="text-gray-600 mt-2">Gestisci ferie e permessi dei dipendenti</p>
          </div>
          <button
            onClick={() => setShowAddForm((v) => !v)}
            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition"
          >
            {showAddForm ? 'Annulla' : '+ Aggiungi Assenza'}
          </button>
        </div>

        {/* Month navigation */}
        <div className="flex items-center justify-between bg-white p-4 rounded-lg shadow">
          <button
            onClick={() => handleMonthChange(-1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            ← Mese Precedente
          </button>
          <span className="text-lg font-semibold text-gray-900">
            {new Date(year, month - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}
          </span>
          <button
            onClick={() => handleMonthChange(1)}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
          >
            Mese Successivo →
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Add absence form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuova Assenza</h2>
            <form onSubmit={handleAddShift} className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dipendente</label>
                <select
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  required
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                >
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                <input
                  type="date"
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  required
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
                disabled={addingShift}
                className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
              >
                {addingShift ? 'Aggiunta...' : 'Aggiungi'}
              </button>
            </form>
          </div>
        )}

        {/* Filter pills */}
        <div className="flex gap-2">
          {(['all', 'vacation', 'permission'] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'Tutte' : f === 'vacation' ? 'Ferie' : 'Permessi'}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredShifts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">Nessuna assenza registrata</p>
              <p className="text-sm mt-1">Non ci sono ferie o permessi per il periodo selezionato.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dipendente
                  </th>
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
                {filteredShifts.map((shift) => {
                  const user = getUserById(shift.user_id);
                  return (
                    <tr key={shift.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {user ? getInitials(user.full_name) : '?'}
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {user ? user.full_name : shift.user_id}
                          </span>
                        </div>
                      </td>
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
                            Modificabile
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
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
