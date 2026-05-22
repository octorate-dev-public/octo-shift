'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { Shift } from '@/types';
import {
  getLeaveColor,
  getLeaveLabel,
  parseDateString,
  computePermissionHours,
  formatPermissionNote,
  groupVacationBlocks,
} from '@/lib/utils';

type LeaveType = 'vacation' | 'permission';

interface DeleteConfirm {
  shift: Shift;
  block: Shift[];
}

export default function UserLeavePage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('Utente');
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add form
  const [showAddForm, setShowAddForm] = useState(false);
  const [formType, setFormType] = useState<LeaveType>('vacation');

  // Ferie multigiorno
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');

  // Permesso con orario
  const [formPermDate, setFormPermDate] = useState('');
  const [formTimeStart, setFormTimeStart] = useState('09:00');
  const [formTimeEnd, setFormTimeEnd] = useState('12:00');

  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Eliminazione
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirm | null>(null);

  // Suggerisci periodo
  const [suggestDays, setSuggestDays] = useState(1);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Array<{
    startDate: string; endDate: string; workingDays: number; peakAbsences: number; note: string;
  }>>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);

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
    if (userId) loadData(userId);
  }, [userId]);

  const loadData = async (uid: string) => {
    try {
      setLoading(true);
      setError(null);
      const currentYear = new Date().getFullYear();
      const data = await api.get<Shift[]>(
        `/api/shifts?userId=${uid}&start=${currentYear}-01-01&end=${currentYear}-12-31`,
      );
      const leaveShifts = data
        .filter((s) => s.leave_type === 'vacation' || s.leave_type === 'permission')
        .sort((a, b) => b.shift_date.localeCompare(a.shift_date));
      setShifts(leaveShifts);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore nel caricamento');
    } finally {
      setLoading(false);
    }
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

  // ── Submit form ────────────────────────────────────────────────
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;
    try {
      setSubmitting(true);
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
          userId,
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
          userId,
          shiftDate: formPermDate,
          action: 'setLeave',
          leaveType: 'permission',
          leaveNote: permissionNote,
        });
      }

      setShowAddForm(false);
      resetForm();
      await loadData(userId);
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Errore durante la richiesta');
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormStartDate('');
    setFormEndDate('');
    setFormPermDate('');
    setFormTimeStart('09:00');
    setFormTimeEnd('12:00');
    setAddError(null);
    setSuggestions([]);
    setSuggestError(null);
  };

  const handleSuggest = async () => {
    if (!userId) return;
    try {
      setSuggesting(true);
      setSuggestError(null);
      setSuggestions([]);
      const today = new Date().toISOString().split('T')[0];
      const result = await api.post<{ suggestions: typeof suggestions }>('/api/vacation-suggest', {
        userId,
        days: suggestDays,
        today,
      });
      if (result.suggestions.length === 0) {
        setSuggestError('Nessun periodo libero trovato nei prossimi 31 giorni.');
      } else {
        setSuggestions(result.suggestions);
      }
    } catch (err: unknown) {
      setSuggestError(err instanceof Error ? err.message : 'Errore nel suggerimento');
    } finally {
      setSuggesting(false);
    }
  };

  // ── Delete helpers ─────────────────────────────────────────────
  const handleDeleteClick = (shift: Shift) => {
    if (shift.leave_type === 'permission') {
      // Permesso: conferma semplice diretta
      setDeleteConfirm({ shift, block: [shift] });
      return;
    }
    // Ferie: trova il blocco
    const allBlocks = groupVacationBlocks(shifts);
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
      if (userId) await loadData(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione");
    }
  };

  const handleDeleteBlock = async (block: Shift[]) => {
    setDeleteConfirm(null);
    if (block.length === 0 || !userId) return;
    const sorted = [...block].sort((a, b) => a.shift_date.localeCompare(b.shift_date));
    try {
      await api.patch('/api/shifts', {
        userId: sorted[0].user_id,
        action: 'clearLeaveRange',
        startDate: sorted[0].shift_date,
        endDate: sorted[sorted.length - 1].shift_date,
      });
      await loadData(userId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Errore durante l'eliminazione del blocco");
    }
  };

  // ── Formatting ─────────────────────────────────────────────────
  const formatShiftDate = (dateStr: string) =>
    parseDateString(dateStr).toLocaleDateString('it-IT', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Le Mie Assenze</h1>
            <p className="text-gray-600 mt-2">Ferie e permessi per l&apos;anno {currentYear}</p>
          </div>
          <button
            onClick={() => {
              setShowAddForm((v) => !v);
              if (showAddForm) resetForm();
              setDeleteConfirm(null);
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

        {/* Summary */}
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
            <form onSubmit={handleAddShift} className="space-y-4">
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

              {/* Campi per FERIE multigiorno */}
              {formType === 'vacation' && (
                <div className="space-y-4">
                  {/* Suggerisci periodo */}
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
                    <p className="text-sm font-semibold text-blue-800">✨ Trova il periodo migliore</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="text-sm text-blue-700 whitespace-nowrap">
                        Ho bisogno di
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={suggestDays}
                        onChange={(e) => {
                          setSuggestDays(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)));
                          setSuggestions([]);
                          setSuggestError(null);
                        }}
                        className="w-16 px-2 py-1.5 border border-blue-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-blue-400 focus:border-transparent outline-none bg-white"
                      />
                      <label className="text-sm text-blue-700 whitespace-nowrap">
                        {suggestDays === 1 ? 'giorno lavorativo' : 'giorni lavorativi'}
                      </label>
                      <button
                        type="button"
                        onClick={handleSuggest}
                        disabled={suggesting}
                        className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                      >
                        {suggesting ? 'Cerco...' : 'Suggerisci'}
                      </button>
                    </div>
                    {suggestError && (
                      <p className="text-xs text-red-600">{suggestError}</p>
                    )}
                    {suggestions.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-xs text-blue-600 font-medium">
                          Clicca su un periodo per selezionarlo:
                        </p>
                        <div className="flex flex-col gap-2">
                          {suggestions.map((s) => (
                            <button
                              key={s.startDate}
                              type="button"
                              onClick={() => {
                                setFormStartDate(s.startDate);
                                setFormEndDate(s.endDate);
                              }}
                              className={`text-left text-sm px-3 py-2 rounded-lg border transition font-medium ${
                                formStartDate === s.startDate && formEndDate === s.endDate
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : s.peakAbsences === 0
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                  : s.peakAbsences <= 1
                                  ? 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50'
                                  : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                              }`}
                            >
                              {s.peakAbsences === 0 ? '🟢' : s.peakAbsences <= 1 ? '🟡' : '🟠'}{' '}
                              {s.note}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Date manuali */}
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
                        max={`${currentYear}-12-31`}
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
                        max={`${currentYear}-12-31`}
                        className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent outline-none"
                      />
                    </div>
                    {formStartDate && formEndDate && formEndDate >= formStartDate && (
                      <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-lg px-3 py-2">
                        ✈️ Verrà inserita una ferie per ogni giorno lavorativo (lun–ven) nel
                        periodo selezionato.
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Campi per PERMESSO con orario */}
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
                        max={`${currentYear}-12-31`}
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
                  {/* Preview calcolo ore */}
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

              <div className="flex items-center gap-3">
                <button
                  type="submit"
                  disabled={submitting}
                  className="bg-blue-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                  {submitting ? 'Invio...' : 'Invia Richiesta'}
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

        {/* List */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Storico ({shifts.length})</h2>
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
                {shifts.map((shift) => (
                  <tr
                    key={shift.id}
                    className={`hover:bg-gray-50 ${
                      deleteConfirm?.shift.id === shift.id ? 'bg-orange-50' : ''
                    }`}
                  >
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
                    <td className="px-6 py-4 text-sm text-gray-500">
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
                          Attivo
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Layout>
  );
}
