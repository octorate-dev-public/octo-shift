'use client';

import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { User } from '@/types';
import { api } from '@/lib/fetcher';
import { parseDateString } from '@/lib/utils';
import { labelToShift, ParsedCell } from '@/lib/shiftMatrixExcel';

// ── Date helpers ─────────────────────────────────────────────────────────────
function cellToDateStr(val: unknown): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number') {
    // seriale Excel → data (base 1899-12-30)
    const dt = new Date(Math.round((val - 25569) * 86400 * 1000));
    if (!isNaN(dt.getTime())) {
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
    }
  }
  if (typeof val === 'string') {
    const s = val.trim();
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m2 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  }
  return '';
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return parseDateString(dateStr).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
}

// ── Name matching (allineato a ImportLeavePanel) ─────────────────────────────
function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}
function matchUser(rawName: string, users: User[]): User | null {
  if (!rawName) return null;
  const norm = normalizeName(rawName);
  const exact = users.find((u) => normalizeName(u.full_name) === norm);
  if (exact) return exact;
  const parts = norm.split(' ');
  if (parts.length >= 2) {
    const rev = [...parts].reverse().join(' ');
    const revMatch = users.find((u) => normalizeName(u.full_name) === rev);
    if (revMatch) return revMatch;
  }
  const partial = users.find((u) => {
    const un = normalizeName(u.full_name);
    return un.includes(norm) || norm.includes(un);
  });
  if (partial) return partial;
  const tokens = norm.split(' ').filter((t) => t.length > 2);
  if (tokens.length > 0) {
    return users.find((u) => {
      const un = normalizeName(u.full_name);
      return tokens.every((t) => un.includes(t));
    }) ?? null;
  }
  return null;
}

// ── Types ────────────────────────────────────────────────────────────────────
type Step = 'upload' | 'preview' | 'done';

interface ParsedSheet {
  dateCol: number;
  /** colonne persona: header grezzo + indice colonna */
  userCols: { col: number; header: string }[];
  /** righe: dateStr + valori grezzi per colonna */
  rows: { dateStr: string; values: unknown[] }[];
}

interface ImportResult {
  saved: number;
  skipped: number;
  unmatchedCols: string[];
}

interface Props {
  users: User[];
  currentUserId?: string | null;
  onImportDone: () => Promise<void>;
  onClose: () => void;
}

export default function ShiftMatrixImportPanel({ users, currentUserId, onImportDone, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fromDate, setFromDate] = useState<string>('');
  // colonna header → userId scelto ('' = non abbinato/skip)
  const [colUser, setColUser] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  // ── Step 1: parse file ──────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true }) as unknown[][];
        if (allRows.length < 2) {
          setError('Il file non contiene abbastanza righe.');
          return;
        }
        const headers = (allRows[0] as unknown[]).map((h) => String(h ?? '').trim());
        const bodyRows = allRows.slice(1).filter((r) => r.some((v) => v !== null && v !== undefined && v !== ''));

        // Colonna data = quella con più celle interpretabili come date
        let dateCol = 0;
        let bestDates = -1;
        headers.forEach((_, i) => {
          const cnt = bodyRows.filter((r) => cellToDateStr(r[i])).length;
          if (cnt > bestDates) {
            bestDates = cnt;
            dateCol = i;
          }
        });

        const userCols = headers
          .map((h, i) => ({ col: i, header: h }))
          .filter((c) => c.col !== dateCol && c.header !== '');

        const rows = bodyRows
          .map((r) => ({ dateStr: cellToDateStr(r[dateCol]), values: r }))
          .filter((r) => r.dateStr);

        if (rows.length === 0) {
          setError('Nessuna riga con una data valida trovata. Verifica il formato (DD/MM/YYYY).');
          return;
        }

        // Auto-abbinamento colonne → utenti
        const initColUser: Record<number, string> = {};
        userCols.forEach((c) => {
          initColUser[c.col] = matchUser(c.header, users)?.id ?? '';
        });

        const sortedDates = rows.map((r) => r.dateStr).sort();
        setSheet({ dateCol, userCols, rows });
        setColUser(initColUser);
        setFromDate(sortedDates[0]);
        setStep('preview');
      } catch {
        setError('Errore nella lettura del file. Assicurati che sia un .xlsx valido.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── Righe filtrate dal giorno scelto ─────────────────────────────────────
  const visibleRows = useMemo(
    () => (sheet ? sheet.rows.filter((r) => r.dateStr >= fromDate).sort((a, b) => a.dateStr.localeCompare(b.dateStr)) : []),
    [sheet, fromDate],
  );

  const matchedCols = sheet ? sheet.userCols.filter((c) => colUser[c.col]) : [];
  const unmatchedCols = sheet ? sheet.userCols.filter((c) => !colUser[c.col]) : [];

  // Conteggio celle non vuote che verranno scritte
  const cellsToWrite = useMemo(() => {
    let n = 0;
    for (const r of visibleRows) {
      for (const c of matchedCols) {
        if (labelToShift(r.values[c.col])) n++;
      }
    }
    return n;
  }, [visibleRows, matchedCols]);

  // ── Import ────────────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (!sheet) return;
    setImporting(true);
    setError(null);
    try {
      const bulk: Array<{
        user_id: string;
        shift_date: string;
        shift_type: string;
        leave_type: string | null;
        locked: boolean;
        locked_by: string | null;
      }> = [];
      let skipped = 0;

      for (const r of visibleRows) {
        for (const c of matchedCols) {
          const parsed: ParsedCell | null = labelToShift(r.values[c.col]);
          if (!parsed) continue; // cella vuota → invariata
          bulk.push({
            user_id: colUser[c.col],
            shift_date: r.dateStr,
            shift_type: parsed.shift_type,
            leave_type: parsed.leave_type,
            locked: true,
            locked_by: currentUserId ?? null,
          });
        }
      }
      // celle di colonne non abbinate = saltate (informativo)
      for (const r of visibleRows) {
        for (const c of unmatchedCols) {
          if (labelToShift(r.values[c.col])) skipped++;
        }
      }

      if (bulk.length === 0) {
        setError('Nessuna cella da importare. Controlla abbinamenti colonne e giorno di partenza.');
        setImporting(false);
        return;
      }

      await api.post('/api/shifts', { bulk });
      setResult({ saved: bulk.length, skipped, unmatchedCols: unmatchedCols.map((c) => c.header) });
      setStep('done');
      await onImportDone();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Errore durante l\'importazione.');
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep('upload');
    setSheet(null);
    setColUser({});
    setFromDate('');
    setResult(null);
    setError(null);
  };

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: '1 · Carica' },
    { key: 'preview', label: '2 · Anteprima' },
    { key: 'done', label: '3 · Fine' },
  ];
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Importa Turni da Excel</h2>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none" aria-label="Chiudi">
          ×
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-xs select-none">
        {STEPS.map(({ key, label }, i) => (
          <React.Fragment key={key}>
            <span
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                step === key ? 'bg-blue-600 text-white' : i < stepIdx ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-300 mx-0.5">›</span>}
          </React.Fragment>
        ))}
      </div>

      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* ── STEP 1: upload ── */}
      {step === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Carica un file <strong>.xlsx</strong> a matrice: prima colonna con le <strong>date</strong>, una colonna per
            dipendente. Celle con <em>Ufficio / Smart / Ferie / Perm. / Malattia</em>. I turni importati verranno
            <strong> bloccati</strong>.
          </p>
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-blue-300 hover:border-blue-500 bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium py-10 w-full rounded-xl transition text-center"
          >
            <span className="block text-3xl mb-2">📂</span>
            Clicca per scegliere il file .xlsx
          </button>
        </div>
      )}

      {/* ── STEP 2: preview ── */}
      {step === 'preview' && sheet && (
        <div className="space-y-4">
          {/* From-day + summary */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Importa dal giorno</label>
              <input
                type="date"
                value={fromDate}
                min={sheet.rows.map((r) => r.dateStr).sort()[0]}
                max={sheet.rows.map((r) => r.dateStr).sort().slice(-1)[0]}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-sm pb-1">
              <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full">{visibleRows.length} giorni</span>
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full">✓ {matchedCols.length} colonne abbinate</span>
              <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">{cellsToWrite} celle da scrivere</span>
              {unmatchedCols.length > 0 && (
                <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">⚠ {unmatchedCols.length} colonne non abbinate</span>
              )}
            </div>
          </div>

          {/* Risoluzione colonne non abbinate */}
          {unmatchedCols.length > 0 && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 p-4 space-y-2">
              <p className="text-sm font-medium text-yellow-800">
                Colonne non riconosciute — abbina o lascia vuoto per saltarle (persone non più esistenti)
              </p>
              {unmatchedCols.map((c) => (
                <div key={c.col} className="flex items-center gap-3">
                  <span className="text-sm text-yellow-900 font-mono bg-yellow-100 border border-yellow-200 rounded px-2 py-0.5 shrink-0 max-w-[180px] truncate" title={c.header}>
                    {c.header || `Colonna ${c.col + 1}`}
                  </span>
                  <span className="text-yellow-400 text-xs">→</span>
                  <select
                    value={colUser[c.col] || ''}
                    onChange={(e) => setColUser((p) => ({ ...p, [c.col]: e.target.value }))}
                    className="flex-1 px-2 py-1.5 border border-yellow-400 rounded-lg text-sm outline-none focus:ring-2 focus:ring-yellow-500 bg-white"
                  >
                    <option value="">— salta (non importare) —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Anteprima matrice */}
          <div className="overflow-auto rounded-lg border border-gray-200 max-h-96">
            <table className="text-xs border-collapse">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium border-r border-gray-200 sticky left-0 bg-gray-50">Data</th>
                  {matchedCols.map((c) => {
                    const u = users.find((x) => x.id === colUser[c.col]);
                    return (
                      <th key={c.col} className="px-2 py-2 text-center text-gray-600 font-medium whitespace-nowrap" title={c.header}>
                        {u?.full_name ?? c.header}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleRows.map((r) => (
                  <tr key={r.dateStr}>
                    <td className="px-3 py-1 text-gray-700 border-r border-gray-200 whitespace-nowrap sticky left-0 bg-white">
                      {fmtDate(r.dateStr)}
                    </td>
                    {matchedCols.map((c) => {
                      const parsed = labelToShift(r.values[c.col]);
                      const raw = String(r.values[c.col] ?? '').trim();
                      return (
                        <td key={c.col} className={`px-2 py-1 text-center ${parsed ? 'text-gray-700' : 'text-gray-300'}`}>
                          {parsed ? raw : '·'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleImport}
              disabled={importing || cellsToWrite === 0}
              className="bg-blue-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {importing ? 'Importazione in corso…' : `Importa ${cellsToWrite} celle (bloccate)`}
            </button>
            <button onClick={reset} className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition">
              ← Ricarica file
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 3: done ── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium">✓ {result.saved} celle importate</span>
            {result.skipped > 0 && (
              <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-medium">
                {result.skipped} saltate (colonne non abbinate: {result.unmatchedCols.join(', ') || '—'})
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            I turni importati sono <strong>bloccati</strong>: la rigenerazione non li modificherà. Sbloccali dalla vista
            calendario se vuoi che tornino modificabili.
          </p>
          <button onClick={reset} className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition">
            Nuova importazione
          </button>
        </div>
      )}
    </div>
  );
}
