'use client';

import React, { useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { User } from '@/types';
import { api } from '@/lib/fetcher';
import { parseDateString } from '@/lib/utils';

// ── Costanti per il rilevamento automatico delle colonne ───────────────────
const NAME_KEYWORDS = [
  'cliente', 'nome', 'dipendente', 'nominativo', 'cognome', 'name',
  'employee', 'collaboratore', 'utente', 'guest', 'ospite',
];
const START_KEYWORDS = [
  'arrivo', 'inizio', 'dal', 'start', 'check-in', 'checkin',
  'from', 'data_inizio', 'datainizio', 'data inizio', 'entrata',
];
const END_KEYWORDS = [
  'partenza', 'fine', 'checkout', 'check-out', 'departure',
  'to', 'data_fine', 'uscita', 'al ', ' al', 'data fine',
];

// ── Utility: date ──────────────────────────────────────────────────────────

function isDateValue(val: unknown): boolean {
  if (val instanceof Date) return true;
  if (typeof val === 'string') {
    const s = val.trim();
    return (
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s) ||
      /^\d{4}-\d{2}-\d{2}$/.test(s) ||
      /^\d{1,2}-\d{1,2}-\d{4}$/.test(s)
    );
  }
  return false;
}

function cellToDateStr(val: unknown): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().slice(0, 10);
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

function subtractOneDay(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—';
  try {
    return parseDateString(dateStr).toLocaleDateString('it-IT', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

// ── Utility: name matching ─────────────────────────────────────────────────

function normalizeName(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, ' ');
}

function matchUser(rawName: string, users: User[]): User | null {
  if (!rawName) return null;
  const norm = normalizeName(rawName);

  // 1. Corrispondenza esatta
  const exact = users.find((u) => normalizeName(u.full_name) === norm);
  if (exact) return exact;

  // 2. Ordine inverso (es. "Rossi Mario" → "Mario Rossi")
  const parts = norm.split(' ');
  if (parts.length >= 2) {
    const rev = [...parts].reverse().join(' ');
    const revMatch = users.find((u) => normalizeName(u.full_name) === rev);
    if (revMatch) return revMatch;
  }

  // 3. Contenimento (il file contiene o è contenuto nel full_name)
  const partial = users.find((u) => {
    const un = normalizeName(u.full_name);
    return un.includes(norm) || norm.includes(un);
  });
  if (partial) return partial;

  // 4. Tutti i token (>2 char) del file presenti nel full_name
  const tokens = norm.split(' ').filter((t) => t.length > 2);
  if (tokens.length > 0) {
    return (
      users.find((u) => {
        const un = normalizeName(u.full_name);
        return tokens.every((t) => un.includes(t));
      }) ?? null
    );
  }
  return null;
}

// ── Utility: scoring colonne ───────────────────────────────────────────────

function scoreColumn(
  header: string,
  samples: unknown[],
  users: User[],
  role: 'name' | 'start' | 'end',
): number {
  let score = 0;
  const h = header.toLowerCase();
  const nonEmpty = samples.filter((v) => v !== null && v !== undefined && v !== '');

  if (role === 'name') {
    if (NAME_KEYWORDS.some((k) => h.includes(k))) score += 15;
    const matched = nonEmpty.filter(
      (v) => typeof v === 'string' && matchUser(v, users) !== null,
    ).length;
    score += matched * 4;
    // Penalizza se sembra una colonna di date
    if (nonEmpty.length > 0 && nonEmpty.every((v) => isDateValue(v))) score -= 10;
  }

  if (role === 'start') {
    if (START_KEYWORDS.some((k) => h.includes(k))) score += 15;
    score += nonEmpty.filter((v) => isDateValue(v)).length * 3;
  }

  if (role === 'end') {
    if (END_KEYWORDS.some((k) => h.includes(k))) score += 15;
    score += nonEmpty.filter((v) => isDateValue(v)).length * 3;
  }

  return score;
}

function autoDetect(
  headers: string[],
  rows: unknown[][],
  users: User[],
): { nameCol: number; startCol: number; endCol: number; endIsCheckout: boolean } {
  const sampleRows = rows.slice(0, 15);
  const getS = (i: number) =>
    sampleRows.map((r) => r[i]).filter((v) => v !== null && v !== undefined && v !== '');

  const scored = headers.map((h, i) => ({
    i,
    name: scoreColumn(h, getS(i), users, 'name'),
    start: scoreColumn(h, getS(i), users, 'start'),
    end: scoreColumn(h, getS(i), users, 'end'),
  }));

  const nameIdx = [...scored].sort((a, b) => b.name - a.name)[0]?.i ?? -1;
  const startIdx =
    [...scored].filter((s) => s.i !== nameIdx).sort((a, b) => b.start - a.start)[0]?.i ?? -1;
  const endIdx =
    [...scored]
      .filter((s) => s.i !== nameIdx && s.i !== startIdx)
      .sort((a, b) => b.end - a.end)[0]?.i ?? -1;

  const endHeader = endIdx >= 0 ? headers[endIdx].toLowerCase() : '';
  const endIsCheckout = END_KEYWORDS.some((k) => endHeader.includes(k.trim()));

  return { nameCol: nameIdx, startCol: startIdx, endCol: endIdx, endIsCheckout };
}

// ── Types interni ──────────────────────────────────────────────────────────

type ImportStep = 'upload' | 'map' | 'preview' | 'done';

interface ParsedSheet {
  headers: string[];
  rows: unknown[][];
}

interface ColumnMapping {
  nameCol: number;
  startDateCol: number;
  endDateCol: number;
  endIsCheckout: boolean;
}

interface PreviewRow {
  rawName: string;
  startDate: string;
  endDate: string;
  matchedUserId: string;
}

interface ImportResult {
  rawName: string;
  userName: string;
  startDate: string;
  endDate: string;
  ok: boolean;
  error?: string;
}

// ── Componente ─────────────────────────────────────────────────────────────

interface Props {
  users: User[];
  onImportDone: () => Promise<void>;
  onClose: () => void;
}

export default function ImportLeavePanel({ users, onImportDone, onClose }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({
    nameCol: -1,
    startDateCol: -1,
    endDateCol: -1,
    endIsCheckout: false,
  });
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [results, setResults] = useState<ImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // ── Step 1: Lettura file ─────────────────────────────────────────────────
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
        const allRows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
          header: 1,
          raw: true,
        }) as unknown[][];

        if (allRows.length < 2) {
          setError('Il file non contiene abbastanza righe.');
          return;
        }

        const headers = (allRows[0] as unknown[]).map((h) => String(h ?? '').trim());
        const dataRows = allRows
          .slice(1)
          .filter((r) => r.some((v) => v !== null && v !== undefined && v !== ''));

        const parsed: ParsedSheet = { headers, rows: dataRows };
        setSheet(parsed);

        const det = autoDetect(headers, dataRows, users);
        setMapping({
          nameCol: det.nameCol,
          startDateCol: det.startCol,
          endDateCol: det.endCol,
          endIsCheckout: det.endIsCheckout,
        });
        setStep('map');
      } catch {
        setError('Errore nella lettura del file. Assicurati che sia un .xlsx valido.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // ── Step 2 → 3: Costruzione righe di anteprima ──────────────────────────
  const handleGoToPreview = () => {
    if (!sheet) return;
    if (mapping.nameCol < 0 || mapping.startDateCol < 0 || mapping.endDateCol < 0) {
      setError('Seleziona tutte e tre le colonne prima di procedere.');
      return;
    }
    setError(null);

    const rows: PreviewRow[] = [];
    for (const row of sheet.rows) {
      const rawName = String(row[mapping.nameCol] ?? '').trim();
      if (!rawName) continue;

      const startDate = cellToDateStr(row[mapping.startDateCol]);
      const rawEnd = cellToDateStr(row[mapping.endDateCol]);
      if (!startDate || !rawEnd) continue;

      const endDate = mapping.endIsCheckout ? subtractOneDay(rawEnd) : rawEnd;
      if (!endDate || endDate < startDate) continue;

      const matched = matchUser(rawName, users);
      rows.push({ rawName, startDate, endDate, matchedUserId: matched?.id ?? '' });
    }

    if (rows.length === 0) {
      setError(
        'Nessuna riga valida con le colonne selezionate. Verifica la mappatura o il formato delle date.',
      );
      return;
    }

    setPreviewRows(rows);
    setStep('preview');
  };

  // ── Step 3 → 4: Importazione ────────────────────────────────────────────
  const handleImport = async () => {
    setImporting(true);
    setError(null);
    const out: ImportResult[] = [];

    for (const row of previewRows) {
      const user = users.find((u) => u.id === row.matchedUserId);
      if (!row.matchedUserId || !user) {
        out.push({
          rawName: row.rawName,
          userName: '—',
          startDate: row.startDate,
          endDate: row.endDate,
          ok: false,
          error: 'Dipendente non abbinato, saltato',
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
        out.push({
          rawName: row.rawName,
          userName: user.full_name,
          startDate: row.startDate,
          endDate: row.endDate,
          ok: true,
        });
      } catch (err: unknown) {
        out.push({
          rawName: row.rawName,
          userName: user.full_name,
          startDate: row.startDate,
          endDate: row.endDate,
          ok: false,
          error: err instanceof Error ? err.message : 'Errore sconosciuto',
        });
      }
    }

    setResults(out);
    setImporting(false);
    setStep('done');
    await onImportDone();
  };

  // ── Helper per il dropdown colonne ──────────────────────────────────────
  const ColSelect = ({
    label,
    subLabel,
    value,
    onChange,
  }: {
    label: string;
    subLabel: string;
    value: number;
    onChange: (v: number) => void;
  }) => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-0.5">{label}</label>
      <p className="text-xs text-gray-400 mb-1.5">{subLabel}</p>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 ${
          value < 0 ? 'border-yellow-400 bg-yellow-50' : 'border-gray-300'
        }`}
      >
        <option value={-1}>— non selezionata —</option>
        {sheet?.headers.map((h, i) => (
          <option key={i} value={i}>
            {h || `Colonna ${i + 1}`}
          </option>
        ))}
      </select>
    </div>
  );

  // ── Indicatore step ──────────────────────────────────────────────────────
  const STEPS: { key: ImportStep; label: string }[] = [
    { key: 'upload', label: '1 · Carica' },
    { key: 'map', label: '2 · Mappa' },
    { key: 'preview', label: '3 · Anteprima' },
    { key: 'done', label: '4 · Fine' },
  ];
  const stepIdx = STEPS.findIndex((s) => s.key === step);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">Importa Ferie da Excel</h2>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl font-bold leading-none"
          aria-label="Chiudi"
        >
          ×
        </button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-1 text-xs select-none">
        {STEPS.map(({ key, label }, i) => (
          <React.Fragment key={key}>
            <span
              className={`px-2.5 py-1 rounded-full font-medium transition-colors ${
                step === key
                  ? 'bg-emerald-600 text-white'
                  : i < stepIdx
                  ? 'bg-emerald-100 text-emerald-700'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && <span className="text-gray-300 mx-0.5">›</span>}
          </React.Fragment>
        ))}
      </div>

      {/* Errore globale */}
      {error && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {/* ─────────────────── STEP 1: Upload ─────────────────────────────── */}
      {step === 'upload' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            Carica qualsiasi file <strong>.xlsx</strong> — rileverò automaticamente le colonne
            con i nomi, le date di inizio e fine.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFile}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-emerald-300 hover:border-emerald-500 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium py-10 w-full rounded-xl transition text-center"
          >
            <span className="block text-3xl mb-2">📂</span>
            Clicca per scegliere il file .xlsx
          </button>
        </div>
      )}

      {/* ─────────────────── STEP 2: Mappatura colonne ───────────────────── */}
      {step === 'map' && sheet && (
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            File con <strong>{sheet.headers.length}</strong> colonne e{' '}
            <strong>{sheet.rows.length}</strong> righe. Ho pre-selezionato le colonne più
            probabili — verifica e correggi se necessario.
          </p>

          {/* Selettori colonne */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <ColSelect
              label="👤 Dipendente"
              subLabel="Colonna con il nome del dipendente"
              value={mapping.nameCol}
              onChange={(v) => setMapping((p) => ({ ...p, nameCol: v }))}
            />
            <ColSelect
              label="📅 Data Inizio"
              subLabel="Primo giorno di assenza"
              value={mapping.startDateCol}
              onChange={(v) => setMapping((p) => ({ ...p, startDateCol: v }))}
            />
            <ColSelect
              label="📅 Data Fine"
              subLabel="Ultimo giorno (o check-out)"
              value={mapping.endDateCol}
              onChange={(v) => setMapping((p) => ({ ...p, endDateCol: v }))}
            />
          </div>

          {/* Toggle checkout */}
          {mapping.endDateCol >= 0 && (
            <label className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer select-none w-fit">
              <input
                type="checkbox"
                checked={mapping.endIsCheckout}
                onChange={(e) =>
                  setMapping((p) => ({ ...p, endIsCheckout: e.target.checked }))
                }
                className="w-4 h-4 rounded accent-emerald-600"
              />
              <span>
                La data fine è il giorno di{' '}
                <strong>check-out</strong>{' '}
                <span className="text-gray-400 text-xs">(verrà tolto 1 giorno)</span>
              </span>
            </label>
          )}

          {/* Mini-preview */}
          {mapping.nameCol >= 0 && mapping.startDateCol >= 0 && mapping.endDateCol >= 0 && (
            <div>
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                Anteprima prime 5 righe
              </p>
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">
                        Dipendente (raw)
                      </th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">
                        Data Inizio
                      </th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">
                        Data Fine{mapping.endIsCheckout ? ' (−1 gg)' : ''}
                      </th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Match</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sheet.rows.slice(0, 5).map((row, i) => {
                      const rawName = String(row[mapping.nameCol] ?? '').trim();
                      const rawEnd = cellToDateStr(row[mapping.endDateCol]);
                      const dispEnd = mapping.endIsCheckout ? subtractOneDay(rawEnd) : rawEnd;
                      const matched = matchUser(rawName, users);
                      return (
                        <tr key={i}>
                          <td className="px-3 py-1.5 text-gray-700">{rawName || '—'}</td>
                          <td className="px-3 py-1.5 text-gray-600">
                            {fmtDate(cellToDateStr(row[mapping.startDateCol]))}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600">{fmtDate(dispEnd)}</td>
                          <td className="px-3 py-1.5">
                            {rawName ? (
                              matched ? (
                                <span className="text-emerald-700 font-medium">
                                  ✓ {matched.full_name}
                                </span>
                              ) : (
                                <span className="text-yellow-600">⚠ non trovato</span>
                              )
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleGoToPreview}
              disabled={
                mapping.nameCol < 0 || mapping.startDateCol < 0 || mapping.endDateCol < 0
              }
              className="bg-emerald-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-40"
            >
              Avanti →
            </button>
            <button
              onClick={() => {
                setStep('upload');
                setSheet(null);
                setError(null);
              }}
              className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition"
            >
              ← Ricarica file
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────── STEP 3: Anteprima completa ──────────────────── */}
      {step === 'preview' && (
        <div className="space-y-4">
          {/* Sommario */}
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-gray-100 text-gray-700 px-3 py-1 rounded-full">
              {previewRows.length} righe totali
            </span>
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">
              ✓ {previewRows.filter((r) => r.matchedUserId).length} abbinate
            </span>
            {previewRows.some((r) => !r.matchedUserId) && (
              <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full">
                ⚠ {previewRows.filter((r) => !r.matchedUserId).length} da abbinare
              </span>
            )}
          </div>

          {/* Tabella */}
          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nome nel file
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Dipendente
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Inizio
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    Fine
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {previewRows.map((row, idx) => (
                  <tr key={idx} className={row.matchedUserId ? '' : 'bg-yellow-50'}>
                    <td className="px-4 py-2 text-gray-400 text-xs">{row.rawName}</td>
                    <td className="px-4 py-2">
                      <select
                        value={row.matchedUserId}
                        onChange={(e) => {
                          const updated = previewRows.map((r, i) =>
                            i === idx ? { ...r, matchedUserId: e.target.value } : r,
                          );
                          setPreviewRows(updated);
                        }}
                        className={`w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-emerald-500 ${
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
                    <td className="px-4 py-2 text-gray-600 text-xs whitespace-nowrap">
                      {fmtDate(row.startDate)}
                    </td>
                    <td className="px-4 py-2 text-gray-600 text-xs whitespace-nowrap">
                      {fmtDate(row.endDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {previewRows.some((r) => !r.matchedUserId) && (
            <p className="text-xs text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2">
              ⚠️ Le righe evidenziate in giallo non hanno un dipendente abbinato e verranno
              saltate. Seleziona manualmente il dipendente corretto o lascialo vuoto per
              escluderle.
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              onClick={handleImport}
              disabled={importing || previewRows.every((r) => !r.matchedUserId)}
              className="bg-emerald-600 text-white font-medium py-2 px-5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
            >
              {importing
                ? 'Importazione in corso…'
                : `Importa ${previewRows.filter((r) => r.matchedUserId).length} righe`}
            </button>
            <button
              onClick={() => {
                setStep('map');
                setError(null);
              }}
              className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition"
            >
              ← Torna alla mappatura
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────── STEP 4: Risultati ───────────────────────────── */}
      {step === 'done' && results && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 text-sm">
            <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-medium">
              ✓ {results.filter((r) => r.ok).length} importate
            </span>
            {results.some((r) => !r.ok) && (
              <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full font-medium">
                ✗ {results.filter((r) => !r.ok).length} saltate / fallite
              </span>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border border-gray-200 max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 sticky top-0">
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
                {results.map((r, i) => (
                  <tr key={i} className={r.ok ? '' : 'bg-red-50'}>
                    <td className="px-4 py-2 text-gray-700 text-sm">{r.userName}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs whitespace-nowrap">
                      {fmtDate(r.startDate)} – {fmtDate(r.endDate)}
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
              setStep('upload');
              setResults(null);
              setPreviewRows([]);
              setSheet(null);
              setError(null);
            }}
            className="bg-gray-100 text-gray-700 font-medium py-2 px-4 rounded-lg hover:bg-gray-200 transition"
          >
            Nuova importazione
          </button>
        </div>
      )}
    </div>
  );
}
