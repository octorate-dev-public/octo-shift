'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { User, Shift } from '@/types';
import { getInitials, getShiftColor, getShiftLabel, parseDateString } from '@/lib/utils';
import { useAuth } from '@/lib/useAuth';
import { format, startOfMonth, endOfMonth, addMonths } from 'date-fns';

interface SwapRequestDetail {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'escalated';
  created_at: string;
  requester_id: string;
  responder_id: string;
  requester: { id: string; full_name: string; email: string } | null;
  responder: { id: string; full_name: string; email: string } | null;
  requester_shift: { shift_date: string; shift_type: string } | null;
  responder_shift: { shift_date: string; shift_type: string } | null;
}

type Tab = 'received' | 'sent';

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'In attesa', className: 'bg-yellow-100 text-yellow-800' },
  accepted: { label: 'Accettata', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rifiutata', className: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Annullata', className: 'bg-gray-100 text-gray-600' },
  escalated: { label: 'Escalata all\'admin', className: 'bg-orange-100 text-orange-800' },
};

export default function UserSwapsPage() {
  const { userId, userName, userRole, logout } = useAuth();
  const [requests, setRequests] = useState<SwapRequestDetail[]>([]);
  const [tab, setTab] = useState<Tab>('received');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // --- New request form state ---
  const [showNewForm, setShowNewForm] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [myShifts, setMyShifts] = useState<Shift[]>([]);
  const [theirShifts, setTheirShifts] = useState<Shift[]>([]);
  const [selectedResponderId, setSelectedResponderId] = useState('');
  const [selectedMyShiftId, setSelectedMyShiftId] = useState('');
  const [selectedTheirShiftId, setSelectedTheirShiftId] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (userId) {
      loadData(userId);
    }
  }, [userId]);

  const loadData = async (uid: string) => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.get<SwapRequestDetail[]>(`/api/swap-requests?userId=${uid}`);
      setRequests(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento delle richieste';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'accept' | 'reject' | 'cancel') => {
    try {
      setProcessingId(id);
      await api.patch('/api/swap-requests', { id, action });
      if (userId) await loadData(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Errore durante l'operazione";
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (dateStr: string) => {
    const d = parseDateString(dateStr);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  // --- New request form logic ---
  const openNewForm = useCallback(async () => {
    setShowNewForm(true);
    setFormError(null);
    setSelectedResponderId('');
    setSelectedMyShiftId('');
    setSelectedTheirShiftId('');
    setTheirShifts([]);

    try {
      // Load all active users and my shifts for the next 2 months
      const now = new Date();
      const start = format(startOfMonth(now), 'yyyy-MM-dd');
      const end = format(endOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');

      const [usersData, shiftsData] = await Promise.all([
        api.get<User[]>('/api/users'),
        userId
          ? api.get<Shift[]>(`/api/shifts?userId=${userId}&start=${start}&end=${end}`)
          : Promise.resolve([]),
      ]);

      setAllUsers(usersData.filter((u) => u.id !== userId && u.is_active));
      setMyShifts(shiftsData.filter((s) => !s.locked));
    } catch {
      setFormError('Errore nel caricamento dei dati');
    }
  }, [userId]);

  const onResponderChange = useCallback(
    async (responderId: string) => {
      setSelectedResponderId(responderId);
      setSelectedTheirShiftId('');
      setTheirShifts([]);

      if (!responderId) return;

      try {
        const now = new Date();
        const start = format(startOfMonth(now), 'yyyy-MM-dd');
        const end = format(endOfMonth(addMonths(now, 1)), 'yyyy-MM-dd');

        const data = await api.get<Shift[]>(
          `/api/shifts?userId=${responderId}&start=${start}&end=${end}`,
        );
        setTheirShifts(data.filter((s) => !s.locked));
      } catch {
        setFormError('Errore nel caricamento dei turni del collega');
      }
    },
    [],
  );

  const submitNewRequest = useCallback(async () => {
    if (!userId || !selectedResponderId || !selectedMyShiftId || !selectedTheirShiftId) {
      setFormError('Compila tutti i campi');
      return;
    }

    try {
      setFormLoading(true);
      setFormError(null);
      await api.post('/api/swap-requests', {
        requesterId: userId,
        responderId: selectedResponderId,
        requesterShiftId: selectedMyShiftId,
        responderShiftId: selectedTheirShiftId,
      });
      setShowNewForm(false);
      await loadData(userId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nella creazione della richiesta';
      setFormError(message);
    } finally {
      setFormLoading(false);
    }
  }, [userId, selectedResponderId, selectedMyShiftId, selectedTheirShiftId]);

  // Tab filters
  const receivedRequests = requests.filter(
    (r) => r.responder_id === userId && r.status === 'pending',
  );
  const sentRequests = requests.filter((r) => r.requester_id === userId);

  const activeList = tab === 'received' ? receivedRequests : sentRequests;

  if (loading) {
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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Scambi Turno</h1>
            <p className="text-gray-600 mt-2">Gestisci le tue richieste di cambio turno</p>
          </div>
          <button
            onClick={openNewForm}
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm"
          >
            + Nuova richiesta
          </button>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* New request form */}
        {showNewForm && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4 border-2 border-blue-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Nuova richiesta di scambio</h2>
              <button
                onClick={() => setShowNewForm(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {formError && (
              <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">
                {formError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* My shift */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Il mio turno da scambiare
                </label>
                <select
                  value={selectedMyShiftId}
                  onChange={(e) => setSelectedMyShiftId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleziona un turno...</option>
                  {myShifts.map((s) => (
                    <option key={s.id} value={s.id}>
                      {formatDate(s.shift_date)} — {getShiftLabel(s.shift_type)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Colleague */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Collega con cui scambiare
                </label>
                <select
                  value={selectedResponderId}
                  onChange={(e) => onResponderChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Seleziona un collega...</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Their shift */}
              {selectedResponderId && (
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Turno del collega che vuoi
                  </label>
                  {theirShifts.length === 0 ? (
                    <p className="text-sm text-gray-400 italic">
                      Nessun turno disponibile per questo collega
                    </p>
                  ) : (
                    <select
                      value={selectedTheirShiftId}
                      onChange={(e) => setSelectedTheirShiftId(e.target.value)}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Seleziona un turno...</option>
                      {theirShifts.map((s) => (
                        <option key={s.id} value={s.id}>
                          {formatDate(s.shift_date)} — {getShiftLabel(s.shift_type)}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowNewForm(false)}
                className="text-sm text-gray-600 hover:text-gray-800 px-4 py-2 rounded-lg transition"
              >
                Annulla
              </button>
              <button
                onClick={submitNewRequest}
                disabled={
                  formLoading || !selectedMyShiftId || !selectedResponderId || !selectedTheirShiftId
                }
                className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {formLoading ? 'Invio...' : 'Invia richiesta'}
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          <button
            onClick={() => setTab('received')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              tab === 'received'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Ricevute
            {receivedRequests.length > 0 && (
              <span className="ml-2 bg-yellow-100 text-yellow-800 text-xs font-medium px-1.5 py-0.5 rounded-full">
                {receivedRequests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab('sent')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition -mb-px ${
              tab === 'sent'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            Inviate
          </button>
        </div>

        {/* List */}
        <div className="space-y-4">
          {activeList.length === 0 ? (
            <div className="bg-white rounded-lg shadow text-center py-16 text-gray-500">
              <p className="text-lg font-medium">
                {tab === 'received'
                  ? 'Nessuna richiesta ricevuta in attesa'
                  : 'Nessuna richiesta inviata'}
              </p>
            </div>
          ) : (
            activeList.map((req) => {
              const isProcessing = processingId === req.id;
              const otherPerson = tab === 'received' ? req.requester : req.responder;
              const myShift = tab === 'received' ? req.responder_shift : req.requester_shift;
              const theirShift = tab === 'received' ? req.requester_shift : req.responder_shift;
              const statusInfo = STATUS_LABELS[req.status] ?? STATUS_LABELS.pending;

              return (
                <div key={req.id} className="bg-white rounded-lg shadow p-6">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    {/* Left: people and shifts */}
                    <div className="flex flex-wrap items-center gap-6">
                      {/* Other person */}
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                          {otherPerson ? getInitials(otherPerson.full_name) : '?'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            {otherPerson?.full_name ?? 'Sconosciuto'}
                          </p>
                          <p className="text-xs text-gray-500">{otherPerson?.email ?? ''}</p>
                        </div>
                      </div>

                      {/* Shifts */}
                      <div className="flex items-center gap-3 text-sm text-gray-600">
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Il mio turno</p>
                          {myShift ? (
                            <>
                              <p className="font-medium">{formatDate(myShift.shift_date)}</p>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getShiftColor(myShift.shift_type)}`}
                              >
                                {getShiftLabel(myShift.shift_type)}
                              </span>
                            </>
                          ) : (
                            <p className="text-gray-400">N/D</p>
                          )}
                        </div>
                        <span className="text-gray-400 text-lg">&harr;</span>
                        <div className="text-center">
                          <p className="text-xs text-gray-400 mb-0.5">Turno loro</p>
                          {theirShift ? (
                            <>
                              <p className="font-medium">{formatDate(theirShift.shift_date)}</p>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getShiftColor(theirShift.shift_type)}`}
                              >
                                {getShiftLabel(theirShift.shift_type)}
                              </span>
                            </>
                          ) : (
                            <p className="text-gray-400">N/D</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right: status + date + actions */}
                    <div className="flex flex-col items-end gap-2">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusInfo.className}`}
                      >
                        {statusInfo.label}
                      </span>
                      <p className="text-xs text-gray-400">
                        {new Date(req.created_at).toLocaleDateString('it-IT', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {req.status === 'pending' && (
                        <div className="flex gap-2">
                          {tab === 'received' && (
                            <>
                              <button
                                onClick={() => handleAction(req.id, 'accept')}
                                disabled={isProcessing}
                                className="text-xs bg-green-100 hover:bg-green-200 text-green-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Accetta'}
                              </button>
                              <button
                                onClick={() => handleAction(req.id, 'reject')}
                                disabled={isProcessing}
                                className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                              >
                                {isProcessing ? '...' : 'Rifiuta'}
                              </button>
                            </>
                          )}
                          {tab === 'sent' && (
                            <button
                              onClick={() => handleAction(req.id, 'cancel')}
                              disabled={isProcessing}
                              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50"
                            >
                              {isProcessing ? '...' : 'Annulla'}
                            </button>
                          )}
                        </div>
                      )}
                      {req.status === 'escalated' && tab === 'sent' && (
                        <p className="text-xs text-orange-600 italic">In revisione dall&apos;admin</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
