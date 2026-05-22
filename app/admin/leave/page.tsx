'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import Layout from '@/components/Layout';
import ImportLeavePanel from '@/components/ImportLeavePanel';
import { api } from '@/lib/fetcher';
import { Shift, User, Team } from '@/types';
import {
  getInitials,
  getLeaveColor,
  getLeaveLabel,
  parseDateString,
  computePermissionHours,
  formatPermissionNote,
  groupVacationBlocks,
} from '@/lib/utils';
import type { AiLeaveSuggestion } from '@/app/api/ai-leave/route';

type LeaveType = 'vacation' | 'permission';
type FilterType = 'all' | 'vacation' | 'permission';

interface DeleteConfirm {
  shift: Shift;
  block: Shift[];
}

export default function AdminLeavePage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1); // 1-based

  const [allShifts, setAllShifts] = useState<Shift[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── AI Assistant ferie ────────────────────────────────────────────────────
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<AiLeaveSuggestion[]>([]);

  // Aggiungi assenza manualmente
  const [showAddForm, setShowAddForm] = useState(false);
  const [formUserId, setFormUserId] = useState('');
  const [formType, setFormType] = useState<LeaveType>('vacation');

  // Ferie multigiorno
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Permesso con orario
  const [formPermDate, setFormPermDate] = useState('');
  const [formTimeStart, setFormTimeStart] = useState('09:00');
  const [formTimeEnd, setFormTimeEnd] = useState('12:00');

  const [addingShift, setAddingShift] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Eliminazione
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

  // Importazione Excel
  const [showImportPanel, setShowImportPanel] = useState(false);

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [shiftsData, usersData, teamsData] = await Promise.all([
        api.get<Shift[]>(`/api/shifts?year=${year}&month=${month}`),
        api.get<User[]>('/api/users'),
        api.get<Team[]>('/api/teams'),
      ]);
      setUsers(usersData);
      setTeams(teamsData);
      setAllShifts(
        shiftsData.filter((s) => s.leave_type === 'vacation' || s.leave_type === 'permission'),
      );
      if (usersData.length > 0 && !formUserId) setFormUserId(usersData[0].id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
  };

  const handleMonthChange = (delta: number) => {
    const d = new Date(year, month - 1 + delta);
    setYear(d.getFullYear());
    setMonth(d.getMonth() + 1);
  };

  // ── Calcolo ore permesso (live) ────────────────────────────────
  const permissionHours = useMemo(
    () => (formTimeStart && formTimeEnd ? computePermissionHours(formTimeStart, formTimeEnd) : 0),
    [formTimeStart, formTimeEnd],
  );

  const permissionNote = useMemo(
    () => (formTimeStart && formTimeEnd ? formatPermissionNote(formTimeStart, formTimeEnd) : ''),
    [formTimeStart, formTimeEnd],
  );

  const resetForm = () => {
    setFormStartDate('');
    setFormEndDate('');
    setFormPermDate('');
    setFormTimeStart('09:00');
    setFormTimeEnd('12:00');
    setAddError(null);
  };

  // ── Submit form ────────────────────────────────────────────────
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUserId) return;
    try {
      setAddingShift(true);
      setAddError(null);

      if (formType === 'vacation') {
        if (!formStartDate || !formEndDate) {
          setAddError('Seleziona entrambe le date.');
          return;
        }
        if (formEndDate < formStartDate) {
          setAddError('La data fine non può precedere la data inizio.');
          return;
        }
        await api.patch('/api/shifts', {
          userId: formUserId,
          action: 'setLeaveRange',
          startDate: formStartDate,
          endDate: formEndDate,
          leaveType: 'vacation',
        });
      } else {
        if (!formPermDate) {
          setAddError('Seleziona la data del permesso.');
          return;
        }
        if (permissionHours <= 0) {
          setAddError("L'orario inserito non è valido (ore ≤ 0).");
          return;
        }
        await api.patch('/api/shifts', {
          userId: formUserId,
          shiftDate: formPermDate,
          action: 'setLeave',
          leaveType: 'permission',
          leaveNote: permissionNote,
        });
      }

      setShowAddForm(false);
      resetForm();
      await loadData();
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : "Errore durante l'aggiunta");
    } finally {
      setAddingShift(false);
    }
  };

  // ── Delete helpers ─────────────────────────────────────────────
  const handleDeleteClick = (shift: Shift) => {
    if (shift.leave_type === 'permission') {
      setDeleteConfirm({ shift, block: [shift] });
      return;
    }
    const userShifts = allShifts.filter((s) => s.user_id === shift.user_id);
    const allBlocks = groupVacationBlocks(userShifts);
    const block = allBlocks.find((b) => b.some((s) => s.id === shift.id)) ?? [shift];
    setDeleteConfirm({ shift, block });
  };

  const handleDeleteSingle = async (shift: Shift) => {
    setDeleteConfirm(null);
    try {
      await api.patch('/api/shifts', {
        userId: shift.user_id,
        shiftDate: shift.shift_date,
        action: 'setLeave',
        leaveType: null,
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    }
  };

  const handleDeleteBlock = async (block: Shift[]) => {
    setDeleteConfirm(null);
    if (block.length === 0) return;
    const sorted = [...block].sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    try {
      await api.patch('/api/shifts', {
        userId: sorted[0].user_id,
        action: 'clearLeaveRange',
        startDate: sorted[0].shift_date,
        endDate: sorted[sorted.length - 1].shift_date,
      });
      await loadData();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione del blocco");
    }
  };

  const getUserById = (id: string) => users.find((u) => u.id === id);

  // ── AI: carica anno intero e analizza ─────────────────────────────────────
  const handleAiAnalyze = useCallback(async () => {
    try {
      setAiLoading(true);
      setAiError(null);
      setAiSuggestions([]);

      // 1. Carica tutte le assenze dell'anno (non solo il mese corrente)
      const [yearLeaves, settingsData] = await Promise.all([
        api.get<Shift[]>(`/api/shifts?year=${year}&leaveOnly=true`),
        api.get<Record<string, string>>('/api/settings'),
      ]);

      const vacationAllowance = settingsData.vacation_allowance_days
        ? parseInt(settingsData.vacation_allowance_days, 10) || 26
        : 26;

      const todayStr = new Date().toISOString().split('T')[0];

      // 2. Costruisci dati utenti arricchiti
      const aiUsers = users.filter((u) => u.is_active).map((u) => {
        const seniorityMs = new Date().getTime() - new Date(u.seniority_date).getTime();
        const seniorityYears = Math.floor(seniorityMs / (1000 * 60 * 60 * 24 * 365));
        return {
          id: u.id,
          name: u.full_name,
          role: u.role,
          skillRoles: u.skill_roles ?? [],
          teamNames: (u.team_ids ?? []).map((tid) => teams.find((t) => t.id === tid)?.name ?? tid),
          seniorityDate: u.seniority_date,
          seniorityYears,
          isActive: u.is_active,
        };
      });

      // 3. Costruisci entries ferie
      const aiLeaves = yearLeaves.map((s) => {
        const u = users.find((u2) => u2.id === s.user_id);
        return {
          userId: s.user_id,
          userName: u?.full_name ?? s.user_id,
          date: s.shift_date,
          type: (s.leave_type ?? 'vacation') as 'vacation' | 'permission' | 'sick',
          note: s.leave_note ?? undefined,
        };
      });

      // 4. Calcola statistiche per utente
      const userStats = aiUsers.map((u) => {
        const uLeaves = aiLeaves.filter((l) => l.userId === u.id);
        const vacLeaves = uLeaves.filter((l) => l.type === 'vacation').sort((a, b) => a.date.localeCompare(b.date));
        const permLeaves = uLeaves.filter((l) => l.type === 'permission');
        const sickLeaves = uLeaves.filter((l) => l.type === 'sick');

        // Blocchi consecutivi di ferie
        let blocks = 0;
        let longestBlock = 0;
        let currentRun = 0;
        let prevDate: Date | null = null;
        for (const l of vacLeaves) {
          const d = new Date(l.date);
          if (prevDate) {
            const diff = (d.getTime() - prevDate.getTime()) / 86400000;
            if (diff <= 3) { // tolera fine settimana
              currentRun++;
            } else {
              longestBlock = Math.max(longestBlock, currentRun);
              currentRun = 1;
              blocks++;
            }
          } else {
            currentRun = 1;
            blocks = 1;
          }
          prevDate = d;
        }
        if (currentRun > 0) longestBlock = Math.max(longestBlock, currentRun);

        // Distribuzione mensile ferie
        const monthDistribution = Array(12).fill(0);
        for (const l of vacLeaves) {
          const m = parseInt(l.date.split('-')[1], 10) - 1;
          monthDistribution[m]++;
        }

        return {
          userId: u.id,
          userName: u.name,
          skillRoles: u.skillRoles,
          teamNames: u.teamNames,
          seniorityYears: u.seniorityYears,
          vacationDays: vacLeaves.length,
          permissionDays: permLeaves.length,
          sickDays: sickLeaves.length,
          vacationBlocks: blocks,
          longestBlock,
          monthDistribution,
          lastVacationDate: vacLeaves.length > 0 ? vacLeaves[vacLeaves.length - 1].date : null,
          firstVacationDate: vacLeaves.length > 0 ? vacLeaves[0].date : null,
        };
      });

      // 5. Chiama AI
      const result = await api.post<{ suggestions: AiLeaveSuggestion[] }>('/api/ai-leave', {
        year,
        today: todayStr,
        vacationAllowanceDays: vacationAllowance,
        users: aiUsers,
        leaves: aiLeaves,
        userStats,
        userPrompt: aiPrompt,
      });

      setAiSuggestions(result.suggestions ?? []);
      if ((result.suggestions ?? []).length === 0) {
        setAiError("L'AI non ha trovato anomalie o suggerimenti per questo anno.");
      }
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : "Errore durante l'analisi AI");
    } finally {
      setAiLoading(false);
    }
  }, [year, users, teams, aiPrompt]);

  const filteredShifts = allShifts
    .filter((s) => filter === 'all' || s.leave_type === filter)
    .sort((a, b) => a.shift_date.localeCompare(b.shift_date));

  const formatShiftDate = (dateStr: string) =>
    parseDateString(dateStr).toLocaleDateString('it-IT', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

  const currentYear = new Date().getFullYear();

  return (
    <Layout userRole="admin" userName="Admin">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Gestione Assenze</h1>
            <p className="text-gray-600 mt-2">Gestisci ferie e permessi dei dipendenti</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => { setAiOpen(true); setAiSuggestions([]); setAiError(null); }}
              className="bg-violet-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-violet-700 transition flex items-center gap-1.5"
            >
              🤖 AI Analisi Ferie
            </button>
            <button
              onClick={() => {
                setShowImportPanel((v) => !v);
                if (showAddForm) { setShowAddForm(false); resetForm(); }
              }}
              className="bg-emerald-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-emerald-700 transition"
            >
              {showImportPanel ? 'Chiudi importazione' : '📥 Importa da Excel'}
            </button>
            <button
              onClick={() => {
                setShowAddForm((v) => !v);
                if (showAddForm) resetForm();
                setDeleteConfirm(null);
                if (showImportPanel) setShowImportPanel(false);
              }}
              className="bg-blue-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-blue-700 transition"
            >
              {showAddForm ? 'Annulla' : '+ Aggiungi Assenza'}
            </button>
          </div>
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
            {new Date(year, month - 1).toLocaleDateString('it-IT', {
              month: 'long',
              year: 'numeric',
            })}
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

        {/* Pannello importazione Excel */}
        {showImportPanel && (
          <ImportLeavePanel
            users={users}
            onImportDone={loadData}
            onClose={() => setShowImportPanel(false)}
          />
        )}

        {/* Add form */}
        {showAddForm && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuova Assenza</h2>
            <form onSubmit={handleAddShift} className="space-y-4">
              {/* Dipendente */}
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

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                <div className="flex gap-3">
                  {(['vacation', 'permission'] as LeaveType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setFormType(t)}
                      className={`px-4 py-2 rounded-lg border text-sm font-medium transition ${
                        formType === t
                          ? t === 'vacation'
                            ? 'bg-yellow-100 border-yellow-400 text-yellow-800'
                            : 'bg-purple-100 border-purple-400 text-purple-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {t === 'vacation' ? '✈️ Ferie' : '📋 Permesso'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Campi FERIE multigiorno */}
              {formType === 'vacation' && (
                <div className="flex flex-wrap gap-4 items-end">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Dal giorno
                    </label>
                    <input
                      type="date"
                      value={formStartDate}
                      onChange={(e) => {
                        setFormStartDate(e.target.value);
                        if (!formEndDate || e.target.value > formEndDate)
                          setFormEndDate(e.target.value);
                      }}
                      required
                      min={`${currentYear}-01-01`}
                      max={`${currentYear + 1}-12-31`}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Al giorno
                    </label>
                    <input
                      type="date"
                      value={formEndDate}
                      onChange={(e) => setFormEndDate(e.target.value)}
                      required
                      min={formStartDate || `${currentYear}-01-01`}
                      max={`${currentYear + 1}-12-31`}
                      className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                    />
                  </div>
                  {formStartDate && formEndDate && formEndDate >= formStartDate && (
                    <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                      ✈️ Verranno inserite ferie per ogni giorno lavorativo (lun–ven) nel periodo.
                    </p>
                  )}
                </div>
              )}

              {/* Campi PERMESSO con orario */}
              {formType === 'permission' && (
                <div className="space-y-3">
                  <div className="flex flex-wrap gap-4 items-end">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Data</label>
                      <input
                        type="date"
                        value={formPermDate}
                        onChange={(e) => setFormPermDate(e.target.value)}
                        required
                        min={`${currentYear}-01-01`}
                        max={`${currentYear + 1}-12-31`}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Dalle ore
                      </label>
                      <input
                        type="time"
                        value={formTimeStart}
                        onChange={(e) => setFormTimeStart(e.target.value)}
                        required
                        step={900}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Alle ore
                      </label>
                      <input
                        type="time"
                        value={formTimeEnd}
                        onChange={(e) => setFormTimeEnd(e.target.value)}
                        required
                        step={900}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
                      />
                    </div>
                  </div>
                  {permissionHours > 0 && (
                    <div className="flex items-center gap-2 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                      <span className="font-medium">📋 {permissionNote}</span>
                      <span className="text-purple-400 text-xs">(pausa 13–14 esclusa)</span>
                    </div>
                  )}
                  {permissionHours <= 0 && formTimeStart && formTimeEnd && (
                    <p className="text-sm text-red-600">
                      L&apos;orario non è valido: l&apos;ora fine deve essere dopo l&apos;ora inizio.
                    </p>
                  )}
                </div>
              )}

              <div>
                <button
                  type="submit"
                  disabled={addingShift}
                  className="bg-blue-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {addingShift ? 'Aggiunta...' : 'Aggiungi'}
                </button>
              </div>
            </form>
            {addError && (
              <p className="mt-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {addError}
              </p>
            )}
          </div>
        )}

        {/* Conferma eliminazione */}
        {deleteConfirm && (
          <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="text-sm text-orange-900">
              {deleteConfirm.block.length > 1 ? (
                <>
                  Questo giorno fa parte di un blocco ferie di{' '}
                  <strong>{deleteConfirm.block.length} giorni</strong> (
                  {parseDateString(
                    [...deleteConfirm.block].sort((a, b) =>
                      a.shift_date.localeCompare(b.shift_date),
                    )[0].shift_date,
                  ).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                  {' – '}
                  {parseDateString(
                    [...deleteConfirm.block].sort((a, b) =>
                      b.shift_date.localeCompare(a.shift_date),
                    )[0].shift_date,
                  ).toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })}
                  ).
                </>
              ) : (
                <>Confermi l&apos;eliminazione di questa assenza?</>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {deleteConfirm.block.length > 1 && (
                <button
                  onClick={() => handleDeleteBlock(deleteConfirm.block)}
                  className="text-xs bg-red-600 hover:bg-red-700 text-white font-medium px-3 py-1.5 rounded-lg transition"
                >
                  Elimina blocco ({deleteConfirm.block.length} gg)
                </button>
              )}
              <button
                onClick={() => handleDeleteSingle(deleteConfirm.shift)}
                className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition"
              >
                {deleteConfirm.block.length > 1 ? 'Solo questo giorno' : 'Elimina'}
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition"
              >
                Annulla
              </button>
            </div>
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
              <p className="text-sm mt-1">
                Non ci sono ferie o permessi per il periodo selezionato.
              </p>
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
                    Dettaglio
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
                    <tr
                      key={shift.id}
                      className={`hover:bg-gray-50 ${
                        deleteConfirm?.shift.id === shift.id ? 'bg-orange-50' : ''
                      }`}
                    >
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
                            shift.leave_type
                              ? getLeaveColor(shift.leave_type)
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {shift.leave_type ? getLeaveLabel(shift.leave_type) : '—'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm">
                        {shift.leave_note ? (
                          <span className="text-purple-700 text-xs font-medium">
                            {shift.leave_note}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
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
                          onClick={() => handleDeleteClick(shift)}
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

      {/* ─── Pannello AI Analisi Ferie ────────────────────────────────────── */}
      {aiOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setAiOpen(false)} />
          <div className="w-full max-w-lg bg-white shadow-2xl flex flex-col overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-violet-600 to-purple-600">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  🤖 AI Analisi Ferie
                </h2>
                <p className="text-violet-200 text-xs mt-0.5">
                  Anomalie, equità, copertura e previsioni per il {year}
                </p>
              </div>
              <button onClick={() => setAiOpen(false)} className="text-white/70 hover:text-white text-xl leading-none transition">✕</button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

              {/* Prompt opzionale */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Istruzioni aggiuntive <span className="text-gray-400 font-normal">(opzionale)</span>
                </label>
                <textarea
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Es. «Considera che il nostro contratto prevede 22gg di ferie» oppure «Evidenzia chi non ha ancora pianificato ferie estive»…"
                  rows={3}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm text-gray-700 resize-none focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent placeholder:text-gray-300"
                />
              </div>

              {/* Bottone analisi */}
              <button
                onClick={handleAiAnalyze}
                disabled={aiLoading}
                className="w-full bg-violet-600 hover:bg-violet-700 text-white font-semibold py-3 rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analisi in corso… (può richiedere qualche secondo)
                  </>
                ) : (
                  <>✨ Analizza {year}</>
                )}
              </button>

              {/* Errore */}
              {aiError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm flex gap-2 items-start">
                  <span className="flex-shrink-0 mt-0.5">⚠️</span>
                  <span>{aiError}</span>
                </div>
              )}

              {/* Suggerimenti */}
              {aiSuggestions.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {aiSuggestions.length} osservazion{aiSuggestions.length === 1 ? 'e' : 'i'}
                  </p>
                  {aiSuggestions.map((s) => {
                    const severityStyle: Record<string, string> = {
                      high:   'border-l-red-500 bg-red-50',
                      medium: 'border-l-amber-400 bg-amber-50',
                      low:    'border-l-blue-400 bg-blue-50',
                      info:   'border-l-gray-300 bg-gray-50',
                    };
                    const severityBadge: Record<string, string> = {
                      high:   'bg-red-100 text-red-700',
                      medium: 'bg-amber-100 text-amber-700',
                      low:    'bg-blue-100 text-blue-700',
                      info:   'bg-gray-100 text-gray-500',
                    };
                    const categoryIcon: Record<string, string> = {
                      overflow: '📈',
                      equity:   '⚖️',
                      coverage: '🛡️',
                      pattern:  '🔍',
                      anomaly:  '⚠️',
                      info:     'ℹ️',
                    };
                    const severityLabel: Record<string, string> = {
                      high: 'Priorità alta', medium: 'Media', low: 'Bassa', info: 'Info',
                    };

                    return (
                      <div
                        key={s.id}
                        className={`rounded-xl border border-l-4 p-4 space-y-2 ${severityStyle[s.severity] ?? 'border-l-gray-300 bg-gray-50'}`}
                      >
                        <div className="flex items-start gap-2 flex-wrap">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityBadge[s.severity] ?? 'bg-gray-100 text-gray-500'}`}>
                            {severityLabel[s.severity] ?? s.severity}
                          </span>
                          <span className="text-xs bg-white/70 text-gray-600 px-2 py-0.5 rounded-full border border-gray-200">
                            {categoryIcon[s.category] ?? '•'} {s.category}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-gray-800">{s.title}</p>
                        <p className="text-sm text-gray-600 leading-relaxed">{s.description}</p>
                        {s.affectedUsers.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {s.affectedUsers.map((name) => (
                              <span key={name} className="text-xs bg-white text-gray-700 border border-gray-200 rounded-full px-2 py-0.5 font-medium">
                                👤 {name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Stato iniziale */}
              {!aiLoading && aiSuggestions.length === 0 && !aiError && (
                <div className="text-center py-10 text-gray-400">
                  <div className="text-5xl mb-3">🤖</div>
                  <p className="text-sm">
                    Premi <strong className="text-violet-600">Analizza {year}</strong> per avviare l&apos;analisi AI delle ferie.
                  </p>
                  <p className="text-xs mt-2 text-gray-300">
                    Vengono analizzati tutti i dipendenti con ruolo, team, seniority e distribuzione mensile per l&apos;intero anno.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-gray-100 bg-gray-50">
              <p className="text-xs text-gray-400 text-center">
                Analisi generata da Claude (Anthropic) · Solo advisory — nessuna modifica automatica
              </p>
            </div>
          </div>
        </div>
      )}

    </Layout>
  );
}
