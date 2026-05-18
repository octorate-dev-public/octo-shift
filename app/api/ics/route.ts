/**
 * GET /api/ics?uid=<userId>
 *
 * Feed ICS sottoscrivibile da Google Calendar (e qualsiasi client iCalendar).
 * Contiene:
 *   - UFFICIO    → evento 09:00–09:05, luogo "Via Filippo Caruso,23, Roma, Italia"
 *   - SMART      → evento tutto-il-giorno
 *   - REPERIBILITÀ → dalle 18:00 del giorno assegnato alle 09:00 del giorno successivo
 *                    (blocchi consecutivi unificati in un singolo evento)
 *
 * Tutti gli orari sono in Europe/Rome.
 * Non richiede autenticazione — l'UID funge da token di accesso.
 *
 * Google Calendar: Aggiungi → Da URL → incolla il link
 * Google aggiorna il feed ogni 8–24 ore automaticamente.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase';

// ─── Costanti ────────────────────────────────────────────────────────────────
const OFFICE_LOCATION = 'Via Filippo Caruso\\,23\\, Roma\\, Italia';
const TZ = 'Europe/Rome';
const APP_HOST = process.env.NEXT_PUBLIC_APP_URL ?? 'https://octoshift.app';

// ─── VTIMEZONE Europe/Rome (CET/CEST) ────────────────────────────────────────
const VTIMEZONE_ROME = `BEGIN:VTIMEZONE
TZID:Europe/Rome
X-LIC-LOCATION:Europe/Rome
BEGIN:DAYLIGHT
TZOFFSETFROM:+0100
TZOFFSETTO:+0200
TZNAME:CEST
DTSTART:19700329T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0200
TZOFFSETTO:+0100
TZNAME:CET
DTSTART:19701025T030000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE`;

// ─── Utility ICS ─────────────────────────────────────────────────────────────

/** Rimuove trattini da YYYY-MM-DD → YYYYMMDD */
const isoToYmd = (s: string) => s.replace(/-/g, '');

/** Data locale Rome per un evento con orario specifico */
const dtRome = (dateStr: string, hhmm: string) =>
  `TZID=${TZ}:${isoToYmd(dateStr)}T${hhmm}00`;

/** Data tutto-il-giorno */
const dtAllDay = (dateStr: string) =>
  `VALUE=DATE:${isoToYmd(dateStr)}`;

/** Aggiunge un giorno a YYYY-MM-DD */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Timestamp UTC per DTSTAMP (ora corrente) */
function nowUtc(): string {
  return new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
}

/**
 * ICS line folding: RFC 5545 impone max 75 ottetti per riga,
 * le continuazioni iniziano con uno spazio.
 */
function fold(line: string): string {
  const MAX = 75;
  if (line.length <= MAX) return line;
  const parts: string[] = [];
  let remaining = line;
  parts.push(remaining.slice(0, MAX));
  remaining = remaining.slice(MAX);
  while (remaining.length > 0) {
    parts.push(' ' + remaining.slice(0, MAX - 1));
    remaining = remaining.slice(MAX - 1);
  }
  return parts.join('\r\n');
}

/** Genera un VEVENT da un oggetto proprietà */
function vevent(props: Record<string, string>): string {
  const lines = ['BEGIN:VEVENT'];
  for (const [k, v] of Object.entries(props)) {
    lines.push(fold(`${k}:${v}`));
  }
  lines.push('END:VEVENT');
  return lines.join('\r\n');
}

// ─── Raggruppamento blocchi consecutivi ───────────────────────────────────────
interface Block { startDate: string; endDate: string }

function groupConsecutive(sortedDates: string[]): Block[] {
  if (sortedDates.length === 0) return [];
  const blocks: Block[] = [];
  let start = sortedDates[0];
  let prev  = sortedDates[0];

  for (let i = 1; i < sortedDates.length; i++) {
    const expected = addDays(prev, 1);
    if (sortedDates[i] === expected) {
      prev = sortedDates[i];
    } else {
      blocks.push({ startDate: start, endDate: prev });
      start = sortedDates[i];
      prev  = sortedDates[i];
    }
  }
  blocks.push({ startDate: start, endDate: prev });
  return blocks;
}

// ─── Colori RFC 7986 (CSS named colors) ──────────────────────────────────────
// Supportati da: Apple Calendar, Thunderbird, Fantastical, ecc.
// Google Calendar ignora il COLOR per-evento nei feed sottoscritti:
// usa invece 3 feed separati (?type=office|smart|oncall) da aggiungere
// come 3 calendari distinti a cui assegnare colori in GCal.
const TYPE_META = {
  office: {
    color: 'steelblue',            // blu ufficio
    calName: '🏢 Ufficio',
    desc: 'Giorni in ufficio — Via Filippo Caruso 23, Roma',
  },
  smart: {
    color: 'mediumseagreen',       // verde smart
    calName: '🏠 Smart Working',
    desc: 'Giorni in smart working',
  },
  oncall: {
    color: 'tomato',               // rosso reperibilità
    calName: '📞 Reperibilità',
    desc: 'Turni di reperibilità (18:00 → 09:00)',
  },
  all: {
    color: 'steelblue',
    calName: 'SmartWork Schedule',
    desc: 'Turni office/smart e reperibilità',
  },
} as const;

type FeedType = keyof typeof TYPE_META;

// ─── Handler ─────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const uid = req.nextUrl.searchParams.get('uid');
  if (!uid || uid.length < 10) {
    return new NextResponse('uid mancante o non valido', { status: 400 });
  }

  const typeParam = req.nextUrl.searchParams.get('type') ?? 'all';
  const feedType: FeedType = (typeParam in TYPE_META ? typeParam : 'all') as FeedType;

  const db = getServerSupabaseClient();

  // Verifica che l'utente esista
  const { data: user } = await db
    .from('users')
    .select('id, full_name, email')
    .eq('id', uid)
    .maybeSingle();

  if (!user) {
    return new NextResponse('Utente non trovato', { status: 404 });
  }

  // Range: anno corrente + prossimo anno
  const thisYear = new Date().getFullYear();
  const startDate = `${thisYear}-01-01`;
  const endDate   = `${thisYear + 1}-12-31`;

  // Turni (ufficio/smart)
  const { data: shifts } = await db
    .from('shifts')
    .select('shift_date, shift_type, leave_type')
    .eq('user_id', uid)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
    .order('shift_date', { ascending: true });

  // Reperibilità giornaliera
  const { data: onCallDays } = await db
    .from('on_call_daily_assignments')
    .select('assignment_date')
    .eq('user_id', uid)
    .gte('assignment_date', startDate)
    .lte('assignment_date', endDate)
    .order('assignment_date', { ascending: true });

  const stamp = nowUtc();
  const events: string[] = [];
  const meta = TYPE_META[feedType];

  // ── Ufficio ────────────────────────────────────────────────────────────────
  if (feedType === 'all' || feedType === 'office') {
    for (const shift of shifts ?? []) {
      if (shift.leave_type) continue;
      if (shift.shift_type !== 'office') continue;
      const d = shift.shift_date;
      events.push(vevent({
        'DTSTART;TZID=Europe/Rome': `${isoToYmd(d)}T090000`,
        'DTEND;TZID=Europe/Rome':   `${isoToYmd(d)}T090500`,
        'DTSTAMP':   stamp,
        'UID':       `office-${d}-${uid}@octoshift`,
        'SUMMARY':   '🏢 Ufficio',
        'LOCATION':  OFFICE_LOCATION,
        'CATEGORIES':'OFFICE',
        'COLOR':     TYPE_META.office.color,   // steelblue — Apple Cal / Fantastical
      }));
    }
  }

  // ── Smart Working ──────────────────────────────────────────────────────────
  if (feedType === 'all' || feedType === 'smart') {
    for (const shift of shifts ?? []) {
      if (shift.leave_type) continue;
      if (shift.shift_type !== 'smartwork') continue;
      const d = shift.shift_date;
      events.push(vevent({
        'DTSTART;VALUE=DATE': isoToYmd(d),
        'DTEND;VALUE=DATE':   isoToYmd(addDays(d, 1)),
        'DTSTAMP':   stamp,
        'UID':       `smart-${d}-${uid}@octoshift`,
        'SUMMARY':   '🏠 Smart Working',
        'CATEGORIES':'SMART',
        'COLOR':     TYPE_META.smart.color,    // mediumseagreen
      }));
    }
  }

  // ── Reperibilità: 18:00 → 09:00 del giorno successivo ────────────────────
  if (feedType === 'all' || feedType === 'oncall') {
    const onCallSortedDates = (onCallDays ?? []).map(r => r.assignment_date).sort();
    const onCallBlocks = groupConsecutive(onCallSortedDates);
    for (const block of onCallBlocks) {
      const dtEnd = addDays(block.endDate, 1);
      events.push(vevent({
        'DTSTART;TZID=Europe/Rome': `${isoToYmd(block.startDate)}T180000`,
        'DTEND;TZID=Europe/Rome':   `${isoToYmd(dtEnd)}T090000`,
        'DTSTAMP':   stamp,
        'UID':       `oncall-${block.startDate}-${block.endDate}-${uid}@octoshift`,
        'SUMMARY':   '📞 Reperibilità',
        'DESCRIPTION': `Reperibilità ${block.startDate === block.endDate ? block.startDate : `${block.startDate} → ${block.endDate}`}`,
        'CATEGORIES':'ONCALL',
        'COLOR':     TYPE_META.oncall.color,   // tomato
      }));
    }
  }

  // ── Assembla il calendario ─────────────────────────────────────────────────
  const calName = feedType === 'all'
    ? `${meta.calName} — ${user.full_name}`
    : `${meta.calName} — ${user.full_name}`;
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//OctoShift//SmartWork Scheduler//IT`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    fold(`X-WR-CALNAME:${calName}`),
    `X-WR-TIMEZONE:${TZ}`,
    fold(`X-WR-CALDESC:${meta.desc} — OctoShift`),
    fold(`X-APPLE-CALENDAR-COLOR:${meta.color}`), // Apple Calendar: colore calendario
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    `X-PUBLISHED-TTL:PT6H`,
    VTIMEZONE_ROME,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  return new NextResponse(ics, {
    headers: {
      'Content-Type':        'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="octoshift-${feedType}-${user.full_name.replace(/\s+/g, '-').toLowerCase()}.ics"`,
      'Cache-Control':       'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*', // necessario per Google Calendar
    },
  });
}
