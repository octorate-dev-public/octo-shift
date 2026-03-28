'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { supabase } from '@/lib/supabase';
import { getInitials, getShiftColor, getShiftLabel, parseDateString } from '@/lib/utils';

interface SwapRequestDetail {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
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
};

export default function UserSwapsPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('Utente');
  const [requests, setRequests] = useState<SwapRequestDetail[]>([]);
  const [tab, setTab] = useState<Tab>('received');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

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

  // Tab: received = user is responder + status pending
  // Tab: sent = user is requester (all statuses)
  const receivedRequests = requests.filter(
    (r) => r.responder_id === userId && r.status === 'pending',
  );
  const sentRequests = requests.filter((r) => r.requester_id === userId);

  const activeList = tab === 'received' ? receivedRequests : sentRequests;

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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Scambi Turno</h1>
          <p className="text-gray-600 mt-2">Gestisci le tue richieste di cambio turno</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
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
                        <span className="text-gray-400 text-lg">↔</span>
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
