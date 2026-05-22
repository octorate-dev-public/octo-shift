'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { User, Team } from '@/types';
import { getInitials, getSeniorityDays } from '@/lib/utils';
import { supabase } from '@/lib/supabase';
import RulesPanel from '@/components/RulesPanel';
import type { RulesSection } from '@/components/RulesPanel';

const USERS_RULES: RulesSection[] = [
  {
    icon: '🔑',
    title: 'Ruoli e accessi',
    items: [
      'Admin: accesso completo a schedule, reperibilità, ferie, impostazioni e gestione dipendenti.',
      'User: visualizza il calendario mensile, esprime preferenze, richiede cambio turno.',
      'Il ruolo si modifica solo da questa pagina — comunicare la nuova password all\'utente dopo la creazione.',
    ],
  },
  {
    icon: '📅',
    title: 'Anzianità aziendale',
    items: [
      'La "Data anzianità" è il punto di partenza per calcolare quanti anni/mesi di servizio ha il dipendente.',
      'Nella generazione dello schedule, a parità di punteggio equità i dipendenti più anziani ottengono priorità ufficio.',
      'Viene mostrata in forma compatta (es. "3a 4m") nella tabella.',
    ],
  },
  {
    icon: '📞',
    title: 'Reperibilità',
    items: [
      '"Reperibilità attiva" include il dipendente nella rotazione round-robin on-call.',
      'Disattivandola il dipendente viene escluso dalla generazione futura, ma i turni già assegnati rimangono.',
      'Si può modificare in qualsiasi momento senza perdere la storico.',
    ],
  },
  {
    icon: '🏠',
    title: 'Stile di distribuzione smart',
    items: [
      '"Stabile": il sistema tende a mantenere lo stesso giorno ufficio/smart ogni settimana (coerenza visiva).',
      '"Random": la distribuzione varia settimana per settimana per massimizzare l\'equità a lungo termine.',
      'Lo stile pesa meno di equità, riunioni di team e anzianità — non le batte mai.',
    ],
  },
  {
    icon: '🚫',
    title: 'Rinuncia smart',
    items: [
      'Attivando "Rinuncia smart" il dipendente viene sempre assegnato all\'ufficio.',
      'Non viene incluso nel calcolo dell\'equità smartwork, quindi non influenza la media degli altri.',
      'Utile per ruoli che richiedono presenza fisica costante.',
    ],
  },
  {
    icon: '🏷️',
    title: 'Ruoli tecnici (skill)',
    items: [
      'I ruoli tecnici (BACKEND, FRONTEND, QUALITY…) sono multi-select e configurabili in Impostazioni.',
      'L\'AI Analisi Ferie li usa per raggruppare i dipendenti e valutare l\'equità e la copertura per specializzazione.',
      'Non influenzano la generazione dello schedule o della reperibilità.',
    ],
  },
];

interface UserFormState {
  fullName: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
  seniorityDate: string;
  teamIds: string[];
  onCallAvailable: boolean;
  scheduleStyle: 'stable' | 'random';
  skillRoles: string[];
}

const emptyForm = (): UserFormState => ({
  fullName: '',
  email: '',
  password: '',
  role: 'user',
  seniorityDate: '',
  teamIds: [],
  onCallAvailable: true,
  scheduleStyle: 'random',
  skillRoles: [],
});

function generateRandomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

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
  const [availableSkillRoles, setAvailableSkillRoles] = useState<string[]>(['BACKEND', 'FRONTEND', 'QUALITY']);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [resetStatus, setResetStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({});

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [usersData, teamsData, settingsData] = await Promise.all([
        api.get<User[]>('/api/users'),
        api.get<Team[]>('/api/teams'),
        api.get<Record<string, string>>('/api/settings'),
      ]);
      setUsers(usersData);
      setTeams(teamsData);
      if (settingsData.user_skill_roles) {
        const roles = settingsData.user_skill_roles
          .split(',')
          .map((r: string) => r.trim().toUpperCase())
          .filter(Boolean);
        if (roles.length > 0) setAvailableSkillRoles(roles);
      }
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
    setShowPassword(false);
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
      onCallAvailable: user.on_call_available ?? true,
      scheduleStyle: user.schedule_style ?? 'random',
      skillRoles: user.skill_roles ?? [],
    });
    setShowForm(true);
    setShowPassword(false);
    setError(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
    setError(null);
  };

  const handleGeneratePassword = () => {
    const pwd = generateRandomPassword();
    setForm((prev) => ({ ...prev, password: pwd }));
    setShowPassword(true);
  };

  const handleResetPassword = async (user: User) => {
    setResetStatus((prev) => ({ ...prev, [user.id]: 'sending' }));
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, {
        redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
      });
      if (error) throw error;
      setResetStatus((prev) => ({ ...prev, [user.id]: 'sent' }));
      setTimeout(() => setResetStatus((prev) => ({ ...prev, [user.id]: 'idle' })), 4000);
    } catch (e: any) {
      setResetStatus((prev) => ({ ...prev, [user.id]: 'error' }));
      alert(`Errore reset password: ${e.message}`);
    }
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
          onCallAvailable: form.onCallAvailable,
          scheduleStyle: form.scheduleStyle,
          skillRoles: form.skillRoles,
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

  const toggleTeam = (teamId: string) => {
    setForm((prev) => ({
      ...prev,
      teamIds: prev.teamIds.includes(teamId)
        ? prev.teamIds.filter((id) => id !== teamId)
        : [...prev.teamIds, teamId],
    }));
  };

  const toggleSkillRole = (role: string) => {
    setForm((prev) => ({
      ...prev,
      skillRoles: prev.skillRoles.includes(role)
        ? prev.skillRoles.filter((r) => r !== role)
        : [...prev.skillRoles, role],
    }));
  };

  const SKILL_ROLE_COLORS: Record<string, string> = {
    BACKEND:  'bg-blue-100 text-blue-800 border-blue-300',
    FRONTEND: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    QUALITY:  'bg-amber-100 text-amber-800 border-amber-300',
  };
  const skillRoleChipStyle = (role: string, selected?: boolean) => {
    const base = SKILL_ROLE_COLORS[role] ?? 'bg-indigo-100 text-indigo-800 border-indigo-300';
    return selected === undefined
      ? `${base} border`
      : selected
        ? `${base} border-2 font-semibold`
        : 'bg-gray-100 text-gray-500 border border-gray-200';
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

        {/* Pannello regole */}
        <RulesPanel label="Come funzionano i parametri dei dipendenti" sections={USERS_RULES} />

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
                  <div className="flex gap-2">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={form.password}
                      onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Almeno 8 caratteri"
                      required
                    />
                    <button
                      type="button"
                      onClick={handleGeneratePassword}
                      className="px-3 py-2 text-xs font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors whitespace-nowrap"
                      title="Genera password casuale"
                    >
                      Genera
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="px-2 py-2 text-gray-400 hover:text-gray-600 transition-colors"
                      title={showPassword ? 'Nascondi' : 'Mostra'}
                    >
                      {showPassword ? '🙈' : '👁️'}
                    </button>
                  </div>
                  {form.password && (
                    <p className="mt-1 text-xs text-gray-500 font-mono truncate">{form.password}</p>
                  )}
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

              {/* Teams (multi) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Team <span className="text-gray-400 font-normal">(seleziona uno o più)</span>
                </label>
                {teams.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Nessun team disponibile</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {teams.map((t) => {
                      const selected = form.teamIds.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTeam(t.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                            selected
                              ? 'border-transparent text-white'
                              : 'border-gray-300 text-gray-600 bg-white hover:border-gray-400'
                          }`}
                          style={selected ? { backgroundColor: t.color ?? '#6366f1' } : {}}
                        >
                          <span
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: selected ? 'white' : (t.color ?? '#6366f1') }}
                          />
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Ruoli Tecnici */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Ruoli Tecnici <span className="text-gray-400 font-normal">(seleziona uno o più)</span>
                </label>
                {availableSkillRoles.length === 0 ? (
                  <p className="text-sm text-gray-400 italic">Nessun ruolo configurato. Vai in Impostazioni.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableSkillRoles.map((role) => {
                      const selected = form.skillRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => toggleSkillRole(role)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${skillRoleChipStyle(role, selected)}`}
                        >
                          {selected ? '✓ ' : ''}{role}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Disponibilità reperibilità */}
              <div className="md:col-span-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.onCallAvailable}
                    onChange={(e) => setForm({ ...form, onCallAvailable: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-700">Disponibile alla reperibilità</span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Se disabilitato, il dipendente non sarà incluso nella rotazione automatica
                    </p>
                  </div>
                </label>
              </div>

              {/* Stile scheduling smart/ufficio */}
              <div className="md:col-span-2">
                <p className="text-sm font-medium text-gray-700 mb-2">Preferenza distribuzione Smart</p>
                <p className="text-xs text-gray-500 mb-3">
                  Indica se il dipendente preferisce che i giorni smart siano sempre gli stessi della settimana,
                  oppure variati. L&apos;equità rimane comunque il criterio primario dell&apos;algoritmo.
                </p>
                <div className="flex gap-2">
                  {([
                    { value: 'stable', label: '📌 Stabile', desc: 'Stessi giorni ogni settimana' },
                    { value: 'random', label: '🔀 Variato', desc: 'Distribuzione diversa ogni settimana' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm({ ...form, scheduleStyle: opt.value })}
                      className={`flex-1 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                        form.scheduleStyle === opt.value
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${form.scheduleStyle === opt.value ? 'text-blue-700' : 'text-gray-700'}`}>
                        {opt.label}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
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
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Dipendente</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ruolo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Team</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skill</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Anzianità</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Stato</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Azioni</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {users.map((user) => {
                      const rstStatus = resetStatus[user.id] ?? 'idle';
                      return (
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
                                <span className="text-[10px] text-gray-400 font-medium" title={user.schedule_style === 'stable' ? 'Distribuzione stabile: stessi giorni ogni settimana' : 'Distribuzione variata'}>
                                  {user.schedule_style === 'stable' ? '📌 Stabile' : '🔀 Variato'}
                                </span>
                                {user.on_call_available === false && (
                                  <span className="text-[10px] text-amber-600 font-medium">Non in rotazione</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                user.role === 'admin' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {user.role === 'admin' ? 'Amministratore' : 'Utente'}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {(user.team_ids ?? []).length === 0 ? (
                                <span className="text-sm text-gray-400">—</span>
                              ) : (
                                (user.team_ids ?? []).map((tid) => {
                                  const t = teams.find((x) => x.id === tid);
                                  return (
                                    <span
                                      key={tid}
                                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium text-white"
                                      style={{ backgroundColor: t?.color ?? '#6366f1' }}
                                    >
                                      {t?.name ?? tid.slice(0, 6)}
                                    </span>
                                  );
                                })
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-1">
                              {(user.skill_roles ?? []).length === 0 ? (
                                <span className="text-sm text-gray-400">—</span>
                              ) : (
                                (user.skill_roles ?? []).map((role) => (
                                  <span
                                    key={role}
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${skillRoleChipStyle(role)}`}
                                  >
                                    {role}
                                  </span>
                                ))
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatSeniority(user.seniority_date)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                user.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-700'
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
                                onClick={() => handleResetPassword(user)}
                                disabled={rstStatus === 'sending'}
                                className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-50 ${
                                  rstStatus === 'sent'
                                    ? 'text-green-700 bg-green-50 border-green-200'
                                    : rstStatus === 'error'
                                    ? 'text-red-700 bg-red-50 border-red-200'
                                    : 'text-amber-700 bg-amber-50 border-amber-200 hover:bg-amber-100'
                                }`}
                                title="Invia email di reset password all'utente"
                              >
                                {rstStatus === 'sending' ? '...' : rstStatus === 'sent' ? '✓ Inviata' : 'Reset pwd'}
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
                      );
                    })}
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
