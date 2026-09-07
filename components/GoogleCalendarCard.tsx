'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/fetcher';

interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  email: string | null;
  expiresAt: string | null;
  expired: boolean | null;
  calendarId: string;
  titleTemplate: string;
}

interface CalItem { id: string; summary: string; primary?: boolean; accessRole?: string; writable: boolean }

export default function GoogleCalendarCard() {
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [calendars, setCalendars] = useState<CalItem[]>([]);
  const [titleTemplate, setTitleTemplate] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const s = await api.get<GoogleStatus>('/api/google?action=status');
      setStatus(s);
      setTitleTemplate(s.titleTemplate);
      if (s.connected) {
        try { setCalendars(await api.get<CalItem[]>('/api/google?action=calendars')); }
        catch { /* token può essere scaduto/revocato: lo status mostra comunque */ }
      }
    } catch (e) {
      setMsg({ kind: 'err', text: e instanceof Error ? e.message : 'Errore stato Google' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  const flash = (kind: 'ok' | 'err', text: string) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 6000); };

  const runSync = useCallback(async (auto = false) => {
    setBusy('sync');
    try {
      const r = await api.post<{ created: number; updated: number; deleted: number; unchanged: number; total: number }>('/api/google', { action: 'sync' });
      flash('ok', `${auto ? 'Sync automatica dopo il collegamento — ' : ''}Ferie: ${r.created} creati, ${r.updated} aggiornati, ${r.deleted} eliminati, ${r.unchanged} invariati (${r.total} blocchi).`);
    } catch (e) { flash('err', e instanceof Error ? e.message : 'Errore sync'); }
    finally { setBusy(null); }
  }, []);

  // Banner dal redirect OAuth (?google=connected|error&msg=...)
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const g = p.get('google');
    if (g === 'connected') {
      setMsg({ kind: 'ok', text: 'Account Google collegato. Avvio sincronizzazione ferie…' });
      // Sync automatica appena connesso → gli eventi futuri vengono creati subito.
      runSync(true);
    }
    else if (g === 'error') setMsg({ kind: 'err', text: `Errore Google: ${p.get('msg') || 'sconosciuto'}` });
    if (g) {
      p.delete('google'); p.delete('msg');
      const qs = p.toString();
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, [runSync]);

  const handleDisconnect = async () => {
    if (!window.confirm('Scollegare l\'account Google? Gli eventi già creati restano sul calendario.')) return;
    setBusy('disconnect');
    try { await api.post('/api/google', { action: 'disconnect' }); await loadStatus(); flash('ok', 'Account scollegato.'); }
    catch (e) { flash('err', e instanceof Error ? e.message : 'Errore'); }
    finally { setBusy(null); }
  };

  const handleSetCalendar = async (calendarId: string) => {
    setBusy('calendar');
    try { await api.post('/api/google', { action: 'setCalendar', calendarId }); await loadStatus(); flash('ok', 'Calendario aggiornato.'); }
    catch (e) { flash('err', e instanceof Error ? e.message : 'Errore'); }
    finally { setBusy(null); }
  };

  const handleSaveTitle = async () => {
    setBusy('title');
    try { await api.post('/api/google', { action: 'setTitle', titleTemplate }); await loadStatus(); flash('ok', 'Template titolo salvato.'); }
    catch (e) { flash('err', e instanceof Error ? e.message : 'Errore'); }
    finally { setBusy(null); }
  };

  const handleSync = () => runSync(false);

  const handlePurge = async () => {
    if (!window.confirm('Eliminare TUTTI gli eventi creati da questa app (ferie) dal calendario? Gli eventi di altri NON vengono toccati. Operazione non reversibile.')) return;
    setBusy('purge');
    try {
      const r = await api.post<{ deleted: number }>('/api/google', { action: 'purge' });
      flash('ok', `Puliti ${r.deleted} eventi creati dall'app.`);
    } catch (e) { flash('err', e instanceof Error ? e.message : 'Errore pulizia'); }
    finally { setBusy(null); }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Google Calendar — Ferie</h2>
        <p className="text-sm text-gray-500 mt-1">
          Sincronizza le <strong>ferie</strong> come eventi all-day su un calendario Google. Vengono
          creati/aggiornati/eliminati solo gli eventi generati da questa app (taggati internamente);
          gli eventi di altri non vengono mai toccati.
        </p>
      </div>

      {msg && (
        <p className={`text-sm rounded-lg px-3 py-2 border ${msg.kind === 'ok' ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-red-700 bg-red-50 border-red-200'}`}>
          {msg.text}
        </p>
      )}

      {loading ? (
        <div className="py-6 text-center text-gray-400 text-sm">Caricamento…</div>
      ) : !status?.configured ? (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          ⚠️ OAuth non configurato: imposta <code>GOOGLE_CLIENT_ID</code> e <code>GOOGLE_CLIENT_SECRET</code> sul server,
          e aggiungi <code>{`{origine}/api/google/callback`}</code> tra i Redirect URI su Google Cloud.
        </p>
      ) : (
        <>
          {/* Stato collegamento */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="min-w-0">
              {status.connected ? (
                <>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Collegato
                  </p>
                  <p className="text-xs text-gray-500 truncate">{status.email ?? 'account sconosciuto'}</p>
                  <p className={`text-xs ${status.expired ? 'text-red-600' : 'text-gray-400'}`}>
                    Token {status.expired ? 'scaduto (verrà rinnovato al prossimo uso)' : 'valido'}
                    {status.expiresAt ? ` · scad. ${new Date(status.expiresAt).toLocaleString('it-IT')}` : ''}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-gray-300" /> Non collegato
                </p>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <a href="/api/google/auth" className="btn-secondary text-sm">
                {status.connected ? 'Cambia account' : 'Collega'}
              </a>
              {status.connected && (
                <button onClick={handleDisconnect} disabled={busy === 'disconnect'} className="btn-secondary text-sm disabled:opacity-50">
                  Scollega
                </button>
              )}
            </div>
          </div>

          {status.connected && (
            <>
              {/* Calendario destinazione */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Calendario destinazione</label>
                <select
                  value={status.calendarId}
                  onChange={(e) => handleSetCalendar(e.target.value)}
                  disabled={busy === 'calendar' || calendars.length === 0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {calendars.length === 0 && <option value={status.calendarId}>{status.calendarId}</option>}
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id} disabled={!c.writable}>
                      {c.summary}
                      {c.primary ? ' (principale)' : ''}
                      {!c.writable ? ' — sola lettura, non usabile' : (c.accessRole === 'writer' ? ' (condiviso)' : '')}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  Include i calendari condivisi con l&apos;account. Quelli in sola lettura non sono selezionabili
                  (serve permesso di scrittura per creare gli eventi).
                </p>
              </div>

              {/* Template titolo */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titolo evento ferie</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={titleTemplate}
                    onChange={(e) => setTitleTemplate(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="{name} (Developer) - Ferie"
                  />
                  <button onClick={handleSaveTitle} disabled={busy === 'title'} className="btn-secondary text-sm disabled:opacity-50">Salva</button>
                </div>
                <p className="text-xs text-gray-400 mt-1"><code>{'{name}'}</code> = nome del dipendente.</p>
              </div>

              {/* Sync + Pulizia */}
              <div className="flex gap-2">
                <button onClick={handleSync} disabled={busy === 'sync'} className="flex-1 btn-primary disabled:opacity-50">
                  {busy === 'sync' ? '⏳ Sincronizzazione…' : '🔄 Sincronizza ferie ora'}
                </button>
                <button
                  onClick={handlePurge}
                  disabled={busy === 'purge'}
                  className="btn-secondary text-sm text-red-600 border-red-200 hover:bg-red-50 disabled:opacity-50"
                  title="Elimina tutti gli eventi creati da questa app"
                >
                  {busy === 'purge' ? '⏳ Pulizia…' : '🗑️ Pulisci eventi'}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                La sync parte in automatico appena colleghi l&apos;account. Copre le ferie da 60 giorni fa a 12 mesi
                avanti; ferie multi-giorno raggruppate in un unico evento (i giorni lavorativi in mezzo restano separati).
                &ldquo;Pulisci eventi&rdquo; cancella solo gli eventi creati da questa app.
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
