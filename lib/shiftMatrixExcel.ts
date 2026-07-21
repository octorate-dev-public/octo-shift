import * as XLSX from 'xlsx';
import { ShiftWithUser, User, ShiftType, LeaveType } from '@/types';
import { isAbsenceShiftType } from './utils';

// ── Etichette celle (round-trip export/import) ──────────────────────────────
// La matrice usa le stesse etichette della vista "Matrice" dell'app.
export const CELL_UFFICIO = 'Ufficio';
export const CELL_SMART = 'Smart';
export const CELL_FERIE = 'Ferie';
export const CELL_PERM = 'Perm.';
export const CELL_MALATTIA = 'Malattia';

/** Turno → etichetta cella. L'assenza (ferie/permesso/malattia) ha precedenza. */
export function shiftToLabel(shift: {
  shift_type: string;
  leave_type?: string | null;
}): string {
  const leave = shift.leave_type ?? (isAbsenceShiftType(shift.shift_type) ? shift.shift_type : null);
  if (leave === 'vacation') return CELL_FERIE;
  if (leave === 'permission') return CELL_PERM;
  if (leave === 'sick') return CELL_MALATTIA;
  if (shift.shift_type === 'office') return CELL_UFFICIO;
  if (shift.shift_type === 'smartwork') return CELL_SMART;
  return '';
}

export interface ParsedCell {
  shift_type: ShiftType;
  leave_type: LeaveType | null;
}

/**
 * Etichetta cella → turno. Ritorna null per celle vuote (da ignorare).
 * Le assenze usano `smartwork` come base cosmetica (non consuma capienza ufficio),
 * coerente con la normalizzazione della generazione.
 */
export function labelToShift(raw: unknown): ParsedCell | null {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.$/, '');
  if (!s || s === '—' || s === '-') return null;

  if (s === 'ufficio' || s === 'office' || s === 'uff') return { shift_type: 'office', leave_type: null };
  if (s === 'smart' || s === 'smart working' || s === 'smartworking' || s === 'sw' || s === 'casa')
    return { shift_type: 'smartwork', leave_type: null };
  if (s === 'ferie' || s === 'vacation' || s === 'ferie/permessi') return { shift_type: 'smartwork', leave_type: 'vacation' };
  if (s === 'perm' || s === 'permesso' || s === 'permission') return { shift_type: 'smartwork', leave_type: 'permission' };
  if (s === 'malattia' || s === 'sick' || s === 'mal') return { shift_type: 'smartwork', leave_type: 'sick' };

  return null; // etichetta sconosciuta → ignora
}

// ── Export: matrice → workbook ──────────────────────────────────────────────

/** Formatta una data ISO (YYYY-MM-DD) in DD/MM/YYYY, ri-importabile. */
function toDMY(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Costruisce il file .xlsx della matrice turni per il mese e ne avvia il download.
 * Layout: riga 1 = ["Data", ...nomi utenti]; una riga per data di turno.
 */
export function exportShiftMatrix(
  users: User[],
  shifts: ShiftWithUser[],
  year: number,
  month: number, // 1-based
): void {
  // Solo utenti attivi passati dal chiamante, ordinati per nome
  const sortedUsers = [...users].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const allowed = new Set(sortedUsers.map((u) => u.id));

  // Mappa `userId:date` → etichetta
  const cellMap = new Map<string, string>();
  const dateSet = new Set<string>();
  shifts.forEach((s) => {
    if (!allowed.has(s.user_id)) return; // scarta orfani
    dateSet.add(s.shift_date);
    cellMap.set(`${s.user_id}:${s.shift_date}`, shiftToLabel(s));
  });

  const dates = [...dateSet].sort();

  const header = ['Data', ...sortedUsers.map((u) => u.full_name)];
  const rows: (string | number)[][] = [header];
  for (const date of dates) {
    const row: string[] = [toDMY(date)];
    for (const u of sortedUsers) {
      row.push(cellMap.get(`${u.id}:${date}`) ?? '');
    }
    rows.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 12 }, ...sortedUsers.map(() => ({ wch: 12 }))];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Turni');

  XLSX.writeFile(wb, `turni-${year}-${String(month).padStart(2, '0')}.xlsx`);
}
