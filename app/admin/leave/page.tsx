'use client';

import React, { useEffect, useState, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import Layout from '@/components/Layout';
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

// ── Import Excel ───────────────────────────────────────────────────────────────
interface ImportRow {
  /** Nome originale dal file */
  clienteName: string;
  /** Data inizio ferie yyyy-MM-dd (Arrivo) */
  startDate: string;
  /** Data fine ferie yyyy-MM-dd (Partenza - 1 giorno) */
  endDate: string;
  /** ID utente abbinato (modificabile dall'utente) */
  matchedUserId: string;
}

/** Converte "dd/MM/yyyy" in "yyyy-MM-dd". Restituisce '' se il formato è errato. */
function parseItalianDate(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';
  const parts = raw.trim().split('/');
  if (parts.length !== 3) return '';
  const [d, m, y] = parts;
  if (!d || !m || !y || y.length !== 4) return '';
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** Sottrae un giorno a una stringa "yyyy-MM-dd". */
function subtractOneDay(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Normalizza un nome per il confronto (lowercase, trim, spazi singoli). */
function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

/** Prova a trovare un utente per nome, cercando in entrambi gli ordini (nome cognome / cognome nome). */
function matchUser(clienteName: string, users: User[]): User | null {
  if (!clienteName) return null;
  const norm = normalizeName(clienteName);
  // 1. Corrispondenza esatta normalizzata
  const exact = users.find((u) => normalizeName(u.full_name) === norm);
  if (exact) return exact;
  // 2. Ordine invertito (es. "Petrucci Matteo" vs "Matteo Petrucci")
  const parts = norm.split(' ');
  if (parts.length >= 2) {
    const reversed = [...parts].reverse().join(' ');
    const rev = users.find((u) => normalizeName(u.full_name) === reversed);
    if (rev) return rev;
  }
  // 3. Il nome del file è contenuto nel full_name o viceversa
  const partial = users.find((u) => {
    const un = normalizeName(u.full_name);
    return un.includes(norm) || norm.includes(un);
  });
  if (partial) return partial;
  // 4. Tutti i token del file sono nel full_name
  const tokenMatch = users.find((u) => {
    const tokens = norm.split(' ');
    const un = normalizeName(u.full_name);
    return tokens.every((t) => un.includes(t));
  });
  return tokenMatch ?? null;
}

interface DeleteConfirm {
  shift: Shift;
  block: Shift[];
}

interface ImportResult {
  clienteName: string;
  startDate: string;
  endDate: string;
  userName: string;
  ok: boolean;
  error?: string;
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

  // Add form
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

  // ── Import Excel ────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showImportPanel, setShowImportPanel] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState<ImportResult[] | null>(null);

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
    // Ferie: trova il blocco per quell'utente
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

  // ── Import Excel handlers ────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportError(null);
    setImportResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 }) as string[][];

        if (rows.length < 2) {
          setImportError('Il file non contiene righe di dati.');
          return;
        }

        // Individua le colonne dalla riga di intestazione (row 0)
        const header = rows[0].map((h) => (h ?? '').toString().toLowerCase().trim());
        const colCliente = header.indexOf('cliente');
        const colArrivo = header.indexOf('arrivo');
        const colPartenza = header.indexOf('partenza');

        if (colCliente === -1 || colArrivo === -1 || colPartenza === -1) {
          setImportError(
            'Colonne obbligatorie non trovate. Il file deve avere le intestazioni: Cliente, Arrivo, Partenza.',
          );
          return;
        }

        const parsed: ImportRow[] = [];
        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          const clienteName = (row[colCliente] ?? '').toString().trim();
          const arrivoRaw = (row[colArrivo] ?? '').toString().trim();
          const partenzaRaw = (row[colPartenza] ?? '').toString().trim();
          if (!clienteName || !arrivoRaw || !partenzaRaw) continue;

          const startDate = parseItalianDate(arrivoRaw);
          const endDateRaw = parseItalianDate(partenzaRaw);
          if (!startDate || !endDateRaw) continue;
          // Partenza è il giorno di check-out → ultimo giorno di ferie = Partenza - 1
          const endDate = subtractOneDay(endDateRaw);
          if (endDate < startDate) continue;

          const matched = matchUser(clienteName, users);
          parsed.push({
            clienteName,
            startDate,
            endDate,
            matchedUserId: matched?.id ?? '',
          });
        }

        if (parsed.length === 0) {
          setImportError('Nessuna riga valida trovata nel file.');
          return;
        }

        setImportRows(parsed);
      } catch {
        setImportError('Errore nella lettura del file. Assicurati che sia un .xlsx valido.');
      }
    };
    reader.readAsArrayBuffer(file);
    // Reset input so the same file can be ricaricato
    e.target.value = '';
  };

  const handleImportConfirm = async () => {
    const rowsToImport = importRows.filter((r) => r.matchedUserId);
    if (rowsToImport.length === 0) {
      setImportError('Nessuna riga ha un utente abbinato. Associa almeno un dipendente prima di importare.');
      return;
    }
    setImporting(true);
    setImportError(null);

    const results: ImportResult[] = [];
    for (const row of importRows) {
      const user = users.find((u) => u.id === row.matchedUserId);
      if (!row.matchedUserId || !user) {
        results.push({
          clienteName: row.clienteName,
          startDate: row.startDate,
          endDate: row.endDate,
          userName: '—',
          ok: false,
          error: 'Dipendente non abbinato (saltato)',
        });
        continue;
      }
      try {
        await api.patch('/api/shifts', {
          userId: row.matchedUserId,
          action: 'setLeaveRange',
          startDate: row.startDate,
          endDate: row.endDate,
          leaveType: 'vacation',
        });
        results.push({
          clienteName: row.clienteName,
          startDate: row.startDate,
          endDate: row.endDate,
          userName: user.full_name,
          ok: true,
        });
      } catch (err: unknown) {
        results.push({
          clienteName: row.clienteName,
          startDate: row.startDate,
          endDate: row.endDate,
          userName: user.full_name,
          ok: false,
          error: err instanceof Error ? err.message : 'Errore sconosciuto',
        });
      }
    }

    setImportResults(results);
    setImportRows([]);
    setImporting(false);
    await loadData();
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
                setImportRows([]);
                setImportResults(null);
                setImportError(null);
                if (showAddForm) { setShowAddForm(false); resetForm(); }
              }}
              className="bg-emerald-600 text-white font-medium py-2 px-4 rounded-lg hover:bg-emerald-700 transition"
            >
              {showImportPanel ? 'Chiudi Importazione' : '📥 Importa da Excel'}
            </button>
            <button
              onClick={() => {
                setShowAddForm((v) => !v);
                if (showAddForm) resetForm();
                setDeleteConfirm(null);
                if (showImportPanel) { setShowImportPanel(false); setImportRows([]); setImportResults(null); }
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

        {/* ── Pannello Importazione Excel ── */}
        {showImportPanel && (
          <div className="bg-white rounded-lg shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Importa Ferie da Excel</h2>
            <p className="text-sm text-gray-500">
              Carica un file <strong>.xlsx</strong> con le colonne <code>Cliente</code>,{' '}
              <code>Arrivo</code> e <code>Partenza</code> (formato data <code>dd/MM/yyyy</code>).
              Le ferie verranno inserite per ogni giorno lavorativo (lun–ven) nel periodo.
            </p>

            {/* File input */}
            {importRows.length === 0 && !importResults && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 text-emerald-700 font-medium py-6 px-8 rounded-lg w-full transition text-center"
                >
                  📂 Clicca per scegliere il file .xlsx
                </button>
              </div>
            )}

            {importError && (
              <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {importError}
              </p>
            )}

            {/* Anteprima righe */}
            {importRows.length > 0 && !importResults && (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Trovate <strong>{importRows.length}</strong> righe. Verifica l&apos;abbinamento
                  dei dipendenti prima di confermare.
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Nome nel file
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Dipendente abbinato
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Inizio
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Fine
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importRows.map((row, idx) => (
                        <tr key={idx} className={row.matchedUserId ? '' : 'bg-yellow-50'}>
                          <td className="px-4 py-2 text-gray-700">{row.clienteName}</td>
                          <td className="px-4 py-2">
                            <select
                              value={row.matchedUserId}
                              onChange={(e) => {
                                const updated = importRows.map((r, i) =>
                                  i === idx ? { ...r, matchedUserId: e.target.value } : r,
                                );
                                setImportRows(updated);
                              }}
                              className={`w-full px-2 py-1 border rounded text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${
                                row.matchedUserId
                                  ? 'border-gray-300'
                                  : 'border-yellow-400 bg-yellow-50'
                              }`}
                            >
                              <option value="">— non abbinato —</option>
                              {users.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.full_name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {parseDateString(row.startDate).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-2 text-gray-700">
                            {parseDateString(row.endDate).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {importRows.some((r) => !r.matchedUserId) && (
                  <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
                    ⚠️ Le righe evidenziate non hanno un dipendente abbinato e verranno saltate.
                    Seleziona manualmente il dipendente corretto.
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={handleImportConfirm}
                    disabled={importing || importRows.every((r) => !r.matchedUserId)}
                    className="bg-emerald-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                  >
                    {importing
                      ? 'Importazione in corso…'
                      : `Importa ${importRows.filter((r) => r.matchedUserId).length} righe`}
                  </button>
                  <button
                    onClick={() => {
                      setImportRows([]);
                      setImportError(null);
                    }}
                    className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition"
                  >
                    Annulla
                  </button>
                </div>
              </div>
            )}

            {/* Risultati importazione */}
            {importResults && (
              <div className="space-y-3">
                <p className="text-sm font-medium text-gray-700">
                  Importazione completata —{' '}
                  <span className="text-emerald-700">
                    {importResults.filter((r) => r.ok).length} riuscite
                  </span>
                  {importResults.some((r) => !r.ok) && (
                    <>
                      ,{' '}
                      <span className="text-red-700">
                        {importResults.filter((r) => !r.ok).length} fallite/saltate
                      </span>
                    </>
                  )}
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Dipendente
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Periodo
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Esito
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {importResults.map((r, i) => (
                        <tr key={i} className={r.ok ? '' : 'bg-red-50'}>
                          <td className="px-4 py-2 text-gray-700">{r.userName}</td>
                          <td className="px-4 py-2 text-gray-600 text-xs">
                            {parseDateString(r.startDate).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                            })}{' '}
                            –{' '}
                            {parseDateString(r.endDate).toLocaleDateString('it-IT', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="px-4 py-2">
                            {r.ok ? (
                              <span className="text-xs text-emerald-700 font-medium">✓ OK</span>
                            ) : (
                              <span className="text-xs text-red-700">{r.error}</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button
                  onClick={() => {
                    setImportResults(null);
                    setImportRows([]);
                    setImportError(null);
                  }}
                  className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition"
                >
                  Nuova importazione
                </button>
              </div>
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
