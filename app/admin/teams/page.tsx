'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { Team } from '@/types';

const DAY_LABELS: Record<string, string> = {
  monday: 'Lunedì',
  tuesday: 'Martedì',
  wednesday: 'Mercoledì',
  thursday: 'Giovedì',
  friday: 'Venerdì',
  saturday: 'Sabato',
};

const DAY_OPTIONS = [
  { value: '', label: 'Nessuno' },
  { value: 'monday', label: 'Lunedì' },
  { value: 'tuesday', label: 'Martedì' },
  { value: 'wednesday', label: 'Mercoledì' },
  { value: 'thursday', label: 'Giovedì' },
  { value: 'friday', label: 'Venerdì' },
  { value: 'saturday', label: 'Sabato' },
];

interface TeamFormState {
  name: string;
  description: string;
  weeklyMeetingDay: string;
}

const emptyForm = (): TeamFormState => ({
  name: '',
  description: '',
  weeklyMeetingDay: '',
});

export default function TeamsPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TeamFormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTeams();
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const data = await api.get<Team[]>('/api/teams');
      setTeams(data);
    } catch (e: any) {
      setError(e.message ?? 'Errore nel caricamento dei team');
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

  const openEditForm = (team: Team) => {
    setEditingId(team.id);
    setForm({
      name: team.name,
      description: team.description ?? '',
      weeklyMeetingDay: team.weekly_meeting_day ?? '',
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
    if (!form.name.trim()) {
      setError('Il nome del team è obbligatorio');
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        weeklyMeetingDay: form.weeklyMeetingDay || undefined,
      };

      if (editingId) {
        await api.patch('/api/teams', { id: editingId, ...payload });
      } else {
        await api.post('/api/teams', payload);
      }

      await loadTeams();
      cancelForm();
    } catch (e: any) {
      setError(e.message ?? 'Errore durante il salvataggio');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (team: Team) => {
    if (!window.confirm(`Eliminare il team "${team.name}"? L'operazione non può essere annullata.`)) return;
    try {
      await api.del(`/api/teams?id=${team.id}`);
      setTeams((prev) => prev.filter((t) => t.id !== team.id));
    } catch (e: any) {
      alert(`Errore durante l'eliminazione: ${e.message}`);
    }
  };

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Team</h1>
            <p className="text-gray-600 mt-1">Crea e gestisci i team aziendali</p>
          </div>
          {!showForm && (
            <button onClick={openNewForm} className="btn-primary">
              + Nuovo Team
            </button>
          )}
        </div>

        {/* Inline form */}
        {showForm && (
          <div className="bg-white rounded-xl shadow-md border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">
              {editingId ? 'Modifica Team' : 'Nuovo Team'}
            </h2>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {error}
              </div>
            )}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="es. Backend, Frontend, Design..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrizione
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={2}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Descrizione opzionale del team..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Giorno Riunione Settimanale
                </label>
                <select
                  value={form.weeklyMeetingDay}
                  onChange={(e) => setForm({ ...form, weeklyMeetingDay: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {DAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="submit"
                  disabled={saving}
                  className="btn-primary disabled:opacity-50"
                >
                  {saving ? 'Salvataggio...' : editingId ? 'Salva Modifiche' : 'Crea Team'}
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

        {/* Teams list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">Nessun team trovato</p>
            <p className="text-sm mt-1">Crea il primo team con il pulsante qui sopra</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {teams.map((team) => (
              <div
                key={team.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {team.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-900 text-sm">{team.name}</h3>
                      {team.weekly_meeting_day && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Riunione: {DAY_LABELS[team.weekly_meeting_day] ?? team.weekly_meeting_day}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {team.description && (
                  <p className="text-sm text-gray-600 line-clamp-2">{team.description}</p>
                )}

                <div className="flex gap-2 pt-1 mt-auto">
                  <button
                    onClick={() => openEditForm(team)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    Modifica
                  </button>
                  <button
                    onClick={() => handleDelete(team)}
                    className="flex-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
                  >
                    Elimina
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
