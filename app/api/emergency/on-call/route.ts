import { NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase';
import { getActiveOnCallDate, getWeekStart, formatDate } from '@/lib/utils';
import { createLogger } from '@/lib/logger';

const log = createLogger('api/emergency/on-call');

export const dynamic = 'force-dynamic';

/**
 * GET /api/emergency/on-call            → JSON con il reperibile ATTIVO adesso
 * GET /api/emergency/on-call?format=twiml → TwiML che compone il numero (per Twilio Voice)
 *
 * "Attivo adesso": turno 18:00 → 09:00 del giorno dopo (Europe/Rome), quindi
 * prima delle 09:00 è ancora il reperibile di ieri (vedi getActiveOnCallDate).
 *
 * Sicurezza: se è impostata la env EMERGENCY_ONCALL_TOKEN, la richiesta deve
 * includere ?token=... oppure header 'x-emergency-token'. Se non impostata,
 * l'endpoint è pubblico (comodo per Twilio, ma espone il numero: valuta il token).
 */

function xml(body: string, status = 200): Response {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n${body}`, {
    status,
    headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Numero componibile: toglie spazi/trattini, tiene + e cifre. */
function dialable(phone: string | null): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[^\d+]/g, '');
  return cleaned || null;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const format = p.get('format');
  const wantTwiml = format === 'twiml';

  // ── Auth opzionale via token ──────────────────────────────────────────────
  const requiredToken = process.env.EMERGENCY_ONCALL_TOKEN;
  if (requiredToken) {
    const given = p.get('token') || req.headers.get('x-emergency-token');
    if (given !== requiredToken) {
      log.warn('GET', 'Token mancante o errato');
      return wantTwiml
        ? xml('<Response><Reject reason="rejected"/></Response>', 403)
        : json({ error: 'Non autorizzato' }, 403);
    }
  }

  try {
    const supabase = getServerSupabaseClient();
    const date = getActiveOnCallDate();

    // 1. Assegnazione giornaliera (modello attuale)
    let person: { full_name: string; email: string | null; phone: string | null } | null = null;

    const { data: daily } = await supabase
      .from('on_call_daily_assignments')
      .select('users:user_id(full_name, email, phone)')
      .eq('assignment_date', date)
      .maybeSingle();

    if (daily?.users) {
      person = daily.users as any;
    } else {
      // 2. Fallback settimanale (legacy)
      const weekStart = formatDate(getWeekStart(new Date(date + 'T12:00:00Z')));
      const { data: weekly } = await supabase
        .from('on_call_assignments')
        .select('users:user_id(full_name, email, phone)')
        .eq('week_start_date', weekStart)
        .limit(1);
      if (weekly && weekly[0]?.users) person = (weekly[0] as any).users;
    }

    // Finestra turno: 18:00 del giorno attivo → 09:00 del giorno dopo (Europe/Rome)
    const nextDay = new Date(date + 'T12:00:00Z');
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const shiftStart = `${date} 18:00`;
    const shiftEnd = `${formatDate(nextDay)} 09:00`;

    const phone = person?.phone ?? null;
    const dial = dialable(phone);

    // ── Risposta TwiML per Twilio Voice ──────────────────────────────────────
    if (wantTwiml) {
      if (dial) {
        return xml(
          `<Response>` +
            `<Say language="it-IT">Ti collego con il reperibile.</Say>` +
            `<Dial timeout="25">${dial}</Dial>` +
          `</Response>`,
        );
      }
      return xml(
        `<Response><Say language="it-IT">Nessun numero di reperibilità configurato al momento.</Say></Response>`,
      );
    }

    // ── Risposta JSON (comoda e piatta) ──────────────────────────────────────
    if (!person) {
      return json({
        onCall: false,
        date,
        name: null,
        phone: null,
        hasPhone: false,
        message: 'Nessun reperibile assegnato',
      });
    }

    return json({
      onCall: true,
      date,                       // giorno del turno attivo (YYYY-MM-DD)
      name: person.full_name,
      email: person.email ?? null,
      phone,                      // come inserito
      dial,                       // solo + e cifre, pronto da comporre
      hasPhone: Boolean(dial),
      shiftStart,                 // "YYYY-MM-DD 18:00"
      shiftEnd,                   // "YYYY-MM-DD 09:00"
      timeZone: 'Europe/Rome',
      message: dial
        ? `Reperibile: ${person.full_name} (${phone})`
        : `Reperibile: ${person.full_name} — numero di telefono MANCANTE`,
    });
  } catch (e) {
    log.error('GET', 'Errore risoluzione reperibile', e instanceof Error ? e : new Error(String(e)));
    return wantTwiml
      ? xml('<Response><Say language="it-IT">Errore nel recupero del reperibile.</Say></Response>', 500)
      : json({ error: 'Errore interno' }, 500);
  }
}
