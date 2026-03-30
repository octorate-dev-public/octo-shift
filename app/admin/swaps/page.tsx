'use client';

import React, { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { api } from '@/lib/fetcher';
import { User } from '@/types';
import { getInitials, getShiftColor, getShiftLabel, parseDateString } from '@/lib/utils';
import { useAuth } from '@/lib/useAuth';

interface SwapRequestWithDetails {
  id: string;
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled' | 'escalated';
  created_at: string;
  requester: { id: string; full_name: string; email: string } | null;
  responder: { id: string; full_name: string; email: string } | null;
  requester_shift: { shift_date: string; shift_type: string } | null;
  responder_shift: { shift_date: string; shift_type: string } | null;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  pending: { label: 'In attesa', className: 'bg-yellow-100 text-yellow-800' },
  escalated: { label: 'Escalata', className: 'bg-orange-100 text-orange-800' },
};

export default function AdminSwapsPage() {
  const { userName, userRole, logout } = useAuth();
  const [requests, setRequests] = useState<SwapRequestWithDetails[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [requestsData, usersData] = await Promise.all([
        api.get<SwapRequestWithDetails[]>('/api/swap-requests?pending=true'),
        api.get<User[]>('/api/users'),
      ]);
      setRequests(requestsData);
      setUsers(usersData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore nel caricamento';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async (id: string, action: 'accept' | 'reject' | 'admin_reject') => {
    try {
      setProcessingId(id);
      await api.patch('/api/swap-requests', { id, action });
      await loadData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : `Errore durante l'operazione`;
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const getUserById = (id: string | null) => {
    if (!id) return null;
    return users.find((u) => u.id === id) ?? null;
  };

  const formatDate = (dateStr: string) => {
    const d = parseDateString(dateStr);
    return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
  };

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
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Richieste di Scambio</h1>
          <p className="text-gray-600 mt-2">Approva o rifiuta le richieste di cambio turno in attesa o escalate</p>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">
              In attesa di approvazione ({requests.length})
            </h2>
          </div>

          {requests.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-lg font-medium">Nessuna richiesta di scambio in attesa</p>
              <p className="text-sm mt-1">Non ci sono scambi turno da approvare al momento.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Richiedente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" />
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Destinatario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Turno richiedente
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Turno destinatario
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Richiesta il
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
                  {requests.map((req) => {
                    const requester = req.requester;
                    const responder = req.responder;
                    const isProcessing = processingId === req.id;
                    return (
                      <tr key={req.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4">
                          <UserCell
                            name={requester?.full_name ?? null}
                            fallbackId={null}
                            users={users}
                            userId={requester?.id ?? null}
                          />
                        </td>
                        <td className="px-4 py-4 text-gray-400 text-lg font-bold text-center">
                          ↔
                        </td>
                        <td className="px-6 py-4">
                          <UserCell
                            name={responder?.full_name ?? null}
                            fallbackId={null}
                            users={users}
                            userId={responder?.id ?? null}
                          />
                        </td>
                        <td className="px-6 py-4">
                          {req.requester_shift ? (
                            <div className="space-y-1">
                              <p className="text-sm text-gray-700">
                                {formatDate(req.requester_shift.shift_date)}
                              </p>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getShiftColor(req.requester_shift.shift_type)}`}
                              >
                                {getShiftLabel(req.requester_shift.shift_type)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">N/D</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          {req.responder_shift ? (
                            <div className="space-y-1">
                              <p className="text-sm text-gray-700">
                                {formatDate(req.responder_shift.shift_date)}
                              </p>
                              <span
                                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getShiftColor(req.responder_shift.shift_type)}`}
                              >
                                {getShiftLabel(req.responder_shift.shift_type)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-sm text-gray-400">N/D</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                          {new Date(req.created_at).toLocaleDateString('it-IT', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                        <td className="px-6 py-4">
                          {(() => {
                            const info = STATUS_LABELS[req.status] ?? STATUS_LABELS.pending;
                            return (
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${info.className}`}>
                                {info.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleAction(req.id, 'accept')}
                              disabled={isProcessing}
                              className="text-xs bg-green-100 hover:bg-green-200 text-green-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? '...' : req.status === 'escalated' ? 'Forza scambio' : 'Accetta'}
                            </button>
                            <button
                              onClick={() => handleAction(req.id, req.status === 'escalated' ? 'admin_reject' : 'reject')}
                              disabled={isProcessing}
                              className="text-xs bg-red-100 hover:bg-red-200 text-red-700 font-medium px-3 py-1.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isProcessing ? '...' : 'Rifiuta'}
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
      </div>
    </Layout>
  );
}

function UserCell({
  name,
  userId,
}: {
  name: string | null;
  fallbackId: string | null;
  users: User[];
  userId: string | null;
}) {
  const initials = name ? getInitials(name) : userId?.slice(0, 2).toUpperCase() ?? '?';
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">
        {initials}
      </div>
      <span className="text-sm font-medium text-gray-900">{name ?? userId ?? 'Sconosciuto'}</span>
    </div>
  );
}
