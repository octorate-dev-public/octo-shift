'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Layout from '@/components/Layout';
import ImportLeavePanel from '@/components/ImportLeavePanel';
import { api } from '@/lib/fetcher';
import { Shift, User } from '@/types';
import {
  getInitials,
  getLeaveColor,
  getLeaveLabel,
  parseDateString,
  computePermissionHours,
  formatPermissionNote,
  groupVacationBlocks,
} from '@/lib/utils';

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
  const [filter, setFilter] = useState<FilterType>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const [shiftsData, usersData] = await Promise.all([
        api.get<Shift[]>(`/api/shifts?year=${year}&month=${month}`),
        api.get<User[]>('/api/users'),
      ]);
      setUsers(usersData);
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
          <div className="flex gap-2">
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
    </Layout>
  );
}
