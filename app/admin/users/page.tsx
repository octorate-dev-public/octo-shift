'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { User, Team } from '@/types';
import { getInitials, getSeniorityDays } from '@/lib/utils';

interface UserFormState {
  fullName: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  seniorityDate: string;
  teamIds: string[];
}

const emptyForm = (): UserFormState => ({
  fullName: '',
  email: '',
  password: '',
  role: 'user',
  seniorityDate: '',
  teamIds: [],
});

function formatSeniority(seniorityDate: string): string {
  const days = getSeniorityDays(seniorityDate);
  if (days < 30) return `${days}g`;
  if (days < 365) return `${Math.floor(days / 30)}m`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return months > 0 ? `${years}a ${months}m` : `${years}a`;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, teamsData] = await Promise.all([
        api.get<User[]>('/api/users'),
        api.get<Team[]>('/api/teams'),
      ]);
      setUsers(usersData);
      setTeams(teamsData);
    } catch (e: any) {
      setError(e.message ?? 'Errore nel caricamento dei dati');
    } finally {
      setLoading(false);
    }
  };

  const openNewForm = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
    setError(null);
  };

  const openEditForm = (user: User) => {
    setEditingId(user.id);
    setForm({
      fullName: user.full_name,
      email: user.email,
      password: '',
      role: user.role,
      seniorityDate: user.seniority_date,
      teamIds: user.team_ids ?? [],
    });
    setShowForm(true);
    setError(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fullName.trim()) { setError('Il nome completo è obbligatorio'); return; }
    if (!form.email.trim()) { setError("L'email è obbligatoria"); return; }
    if (!editingId && !form.password) { setError('La password è obbligatoria'); return; }
    if (!form.seniorityDate) { setError("La data di anzianità è obbligatoria"); return; }

    try {
      setSaving(true);
      setError(null);

      if (editingId) {
        await api.patch('/api/users', {
          id: editingId,
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          role: form.role,
          seniorityDate: form.seniorityDate,
          teamIds: form.teamIds,
        });
      } else {
        await api.post('/api/users', {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          seniorityDate: form.seniorityDate,
          teamIds: form.teamIds,
        });
      }

      await loadData();
      cancelForm();
    } catch (e: any) {
      setError(e.message ?? 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (user: User) => {
    const action = user.is_active ? 'disattivare' : 'riattivare';
    if (!window.confirm(`Vuoi ${action} "${user.full_name}"?`)) return;
    try {
      if (user.is_active) {
        await api.del(`/api/users?id=${user.id}`);
      } else {
        await api.patch('/api/users', { id: user.id, isActive: true });
      }
      await loadData();
    } catch (e: any) {
      alert(`Errore: ${e.message}`);
    }
  };

  const getTeamName = (teamId: string | null): string => {
    if (!teamId) return '—';
    return teams.find((t) => t.id === teamId)?.name ?? '—';
  };

  const avatarColor = (role: string) =>
    role === 'admin' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600';

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Dipendenti</h1>
            <p className="text-gray-600 mt-1">Gestisci gli utenti e i loro accessi</p>
          </div>
          {!showForm && (
            <button onClick={openNewForm} className="btn-primary">
              + Nuovo Dipendente
            </button>
          )}
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">
              {editingId ? 'Modifica Dipendente' : 'Nuovo Dipendente'}
            </h2>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Nome */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Mario Rossi"
                  required
                />
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="mario.rossi@azienda.it"
                  required
                />
              </div>

              {/* Password (only on create) */}
              {!editingId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Almeno 8 caratteri"
                    required
                  />
                </div>
              )}

              {/* Ruolo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ruolo</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'user' })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">Utente</option>
                  <option value="admin">Amministratore</option>
                </select>
              </div>

              {/* Data Anzianità */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Data Anzianità <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={form.seniorityDate}
                  onChange={(e) => setForm({ ...form, seniorityDate: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {/* Team */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Team</label>
                <select
                  value={form.teamId}
                  onChange={(e) => setForm({ ...form, teamId: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Nessun team</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Buttons */}
              <div className="md:col-span-2 flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : editingId ? 'Salva Modifiche' : 'Crea Dipendente'}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annulla
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Users table */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {users.length === 0 ? (
              <div className="text-center py-20 text-gray-500">
                <p className="text-lg">Nessun dipendente trovato</p>
                <p className="text-sm mt-1">Aggiungi il primo dipendente con il pulsante qui sopra</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Dipendente
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Ruolo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Team
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Anzianità
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Stato
                      </th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Azioni
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {users.map((user) => (
                      <tr key={user.id} className={`hover:bg-gray-50 ${!user.is_active ? 'opacity-50' : ''}`}>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${avatarColor(user.role)}`}
                            >
                              {getInitials(user.full_name)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{user.full_name}</p>
                              <p className="text-xs text-gray-500">{user.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              user.role === 'admin'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {user.role === 'admin' ? 'Amministratore' : 'Utente'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {getTeamName(user.team_id)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                          {formatSeniority(user.seniority_date)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              user.is_active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {user.is_active ? 'Attivo' : 'Disattivo'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => openEditForm(user)}
                              className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                            >
                              Modifica
                            </button>
                            <button
                              onClick={() => handleDeactivate(user)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                                user.is_active
                                  ? 'text-red-600 bg-red-50 border-red-200 hover:bg-red-100'
                                  : 'text-green-700 bg-green-50 border-green-200 hover:bg-green-100'
                              }`}
                            >
                              {user.is_active ? 'Disattiva' : 'Riattiva'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
