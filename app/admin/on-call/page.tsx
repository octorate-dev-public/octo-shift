'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { OnCallAssignment, User } from '@/types';
import { formatDate, getInitials, parseDateString } from '@/lib/utils';

interface OnCallRow extends OnCallAssignment {
  editingUserId?: string;
  isEditing?: boolean;
}

export default function AdminOnCallPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const [assignments, setAssignments] = useState<OnCallRow[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add week form
  const [showAddForm, setShowAddForm] = useState(false);
  const [newWeekStart, setNewWeekStart] = useState('');
  const [newUserId, setNewUserId] = useState('');
  const [addingWeek, setAddingWeek] = useState(false);

  useEffect(() => {
    loadData();
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersData, assignmentsData] = await Promise.all([
        api.get<User[]>('/api/users?sortBy=seniority'),
        api.get<OnCallAssignment[]>(`/api/on-call?year=${year}&month=${month}`),
      ]);
      setUsers(usersData);
      setAssignments(assignmentsData.map((a) => ({ ...a, isEditing: false, editingUserId: a.user_id })));
      if (usersData.length > 0 && !newUserId) {
        setNewUserId(usersData[0].id);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento dei dati';
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

  const handleGenerate = async () => {
    if (users.length === 0) return;
    try {
      setGenerating(true);
      setError(null);
      await api.post('/api/on-call', {
        action: 'generate',
        year,
        month,
        userIds: users.map((u) => u.id),
      });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nella generazione della rotazione';
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  const handleStartEdit = (id: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isEditing: true } : a)),
    );
  };

  const handleCancelEdit = (id: string) => {
    setAssignments((prev) =>
      prev.map((a) => (a.id === id ? { ...a, isEditing: false, editingUserId: a.user_id } : a)),
    );
  };

  const handleChangeUser = async (id: string, userId: string) => {
    try {
      await api.patch('/api/on-call', { id, userId });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel cambio utente';
      setError(message);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Eliminare questa assegnazione di reperibilità?')) return;
    try {
      await api.del(`/api/on-call?id=${id}`);
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nell\'eliminazione';
      setError(message);
    }
  };

  const handleAddWeek = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWeekStart || !newUserId) return;
    try {
      setAddingWeek(true);
      await api.post('/api/on-call', { userId: newUserId, weekStartDate: newWeekStart });
      setShowAddForm(false);
      setNewWeekStart('');
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nell\'aggiunta della settimana';
      setError(message);
    } finally {
      setAddingWeek(false);
    }
  };

  const getUserById = (id: string) => users.find((u) => u.id === id);

  const formatWeekRange = (start: string, end: string) => {
    const s = parseDateString(start);
    const e = parseDateString(end);
    return `${s.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })} – ${e.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Reperibilità</h1>
            <p className="text-gray-600 mt-2">Assegna e gestisci i turni di reperibilità settimanali</p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating || users.length === 0}
            className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generazione...' : 'Genera Rotazione'}
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

        {/* Assignments table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              Assegnazioni ({assignments.length})
            </h2>
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-1.5 px-3 rounded-lg transition"
            >
              {showAddForm ? 'Annulla' : '+ Aggiungi Settimana'}
            </button>
          </div>

          {/* Add form */}
          {showAddForm && (
            <form onSubmit={handleAddWeek} className="px-6 py-4 bg-gray-50 border-b border-gray-200">
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data inizio settimana
                  </label>
                  <input
                    type="date"
                    value={newWeekStart}
                    onChange={(e) => setNewWeekStart(e.target.value)}
                    required
                    className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Dipendente
                  </label>
                  <select
                    value={newUserId}
                    onChange={(e) => setNewUserId(e.target.value)}
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
                <button
                  type="submit"
                  disabled={addingWeek}
                  className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {addingWeek ? 'Aggiunta...' : 'Aggiungi'}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : assignments.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">Nessuna reperibilità assegnata</p>
              <p className="text-sm mt-1">
                Usa il pulsante &quot;Genera Rotazione&quot; per creare le assegnazioni automaticamente.
              </p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Settimana
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Reperibile
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Azioni
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.map((row) => {
                  const user = getUserById(row.user_id);
                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {formatWeekRange(row.week_start_date, row.week_end_date)}
                      </td>
                      <td className="px-6 py-4">
                        {row.isEditing ? (
                          <div className="flex items-center gap-2">
                            <select
                              value={row.editingUserId ?? row.user_id}
                              onChange={(e) =>
                                setAssignments((prev) =>
                                  prev.map((a) =>
                                    a.id === row.id ? { ...a, editingUserId: e.target.value } : a,
                                  ),
                                )
                              }
                              className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white"
                            >
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() =>
                                handleChangeUser(row.id, row.editingUserId ?? row.user_id)
                              }
                              className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 transition"
                            >
                              Salva
                            </button>
                            <button
                              onClick={() => handleCancelEdit(row.id)}
                              className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded hover:bg-gray-300 transition"
                            >
                              Annulla
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {user ? getInitials(user.full_name) : '?'}
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              {user ? user.full_name : row.user_id}
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        {!row.isEditing && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleStartEdit(row.id)}
                              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition"
                            >
                              Cambia
                            </button>
                            <button
                              onClick={() => handleDelete(row.id)}
                              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition"
                            >
                              Elimina
                            </button>
                          </div>
                        )}
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
