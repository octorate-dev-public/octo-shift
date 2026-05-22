import { withHandler, jsonOk, parseBody } from '@/lib/api-handler';
import { AppError } from '@/lib/logger';
import { usersAPI } from '@/lib/api/users';
import { shiftsAPI } from '@/lib/api/shifts';
import { teamsAPI } from '@/lib/api/teams';

interface VacationSuggestRequest {
  userId: string;
  days: number;   // giorni lavorativi richiesti
  today: string;  // YYYY-MM-DD
}

export interface VacationWindow {
  startDate: string;     // YYYY-MM-DD
  endDate: string;       // YYYY-MM-DD
  workingDays: number;
  peakAbsences: number;  // max colleghi assenti in un singolo giorno della finestra
  note: string;          // descrizione leggibile
}

const DAY_NAMES: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function dateDiff(a: string, b: string): number {
  return Math.round(
    (new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000,
  );
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('it-IT', {
    weekday: 'short', day: 'numeric', month: 'long',
  });
}

export const POST = withHandler('api/vacation-suggest', 'POST', async (req) => {
  const body = await parseBody<VacationSuggestRequest>(req);
  const { userId, days, today } = body;

  if (!userId || !days || days < 1 || days > 30 || !today) {
    throw new AppError('Parametri non validi', { code: 'INVALID_REQUEST', httpStatus: 400 });
  }

  const year = new Date(today + 'T00:00:00').getFullYear();

  const [allUsers, allTeams, yearLeaves] = await Promise.all([
    usersAPI.getAllUsers(),
    teamsAPI.getAllTeams(),
    shiftsAPI.getYearLeaves(year),
  ]);

  const user = allUsers.find((u) => u.id === userId);
  const userTeam = allTeams.find((t) => user?.team_ids?.includes(t.id));
  const meetingDayNum = userTeam?.weekly_meeting_day
    ? (DAY_NAMES[userTeam.weekly_meeting_day.toLowerCase()] ?? -1)
    : -1;

  // Date in cui l'utente ha già un'assenza
  const userAbsentDates = new Set(
    yearLeaves
      .filter((s) => s.user_id === userId)
      .map((s) => s.shift_date),
  );

  // Numero colleghi assenti per data (escluso l'utente richiedente)
  const teamAbsenceByDate = new Map<string, number>();
  for (const s of yearLeaves) {
    if (s.user_id === userId) continue;
    teamAbsenceByDate.set(s.shift_date, (teamAbsenceByDate.get(s.shift_date) ?? 0) + 1);
  }

  // Giorni lavorativi disponibili nei prossimi 31 giorni di calendario
  const available: string[] = [];
  for (let i = 1; i <= 31; i++) {
    const d = addDays(today, i);
    const dow = new Date(d + 'T00:00:00').getDay();
    if (dow === 0 || dow === 6) continue;      // weekend
    if (dow === meetingDayNum) continue;       // giorno riunione
    if (userAbsentDates.has(d)) continue;      // già assente
    available.push(d);
  }

  if (available.length < days) {
    return jsonOk({ suggestions: [] });
  }

  // Span massimo di calendario accettabile per N giorni lavorativi
  // Esempio: 5 gg lav = 1 settimana = 7 gg cal; 3 gg lav ≤ 5 gg cal
  const maxCalSpan = days + Math.floor(days / 5) * 2 + 2;

  const windows: (VacationWindow & { totalAbsences: number })[] = [];
  const seen = new Set<string>();

  for (let i = 0; i <= available.length - days; i++) {
    const slice = available.slice(i, i + days);
    const startDate = slice[0];
    const endDate = slice[days - 1];
    const calSpan = dateDiff(startDate, endDate);

    if (calSpan > maxCalSpan) continue;

    const key = `${startDate}:${endDate}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const counts = slice.map((d) => teamAbsenceByDate.get(d) ?? 0);
    const peakAbsences = Math.max(...counts);
    const totalAbsences = counts.reduce((a, b) => a + b, 0);

    let coverage: string;
    if (peakAbsences === 0) coverage = 'team al completo';
    else if (peakAbsences === 1) coverage = '1 collega assente';
    else coverage = `max ${peakAbsences} colleghi assenti`;

    const dateLabel = days === 1
      ? formatDate(startDate)
      : `${formatDate(startDate)} – ${formatDate(endDate)}`;

    windows.push({
      startDate,
      endDate,
      workingDays: days,
      peakAbsences,
      totalAbsences,
      note: `${dateLabel} (${coverage})`,
    });
  }

  // Ordina: prima picco assenze basso, poi totale basso
  windows.sort((a, b) => {
    if (a.peakAbsences !== b.peakAbsences) return a.peakAbsences - b.peakAbsences;
    return a.totalAbsences - b.totalAbsences;
  });

  const suggestions: VacationWindow[] = windows.slice(0, 4).map(({ totalAbsences: _t, ...w }) => w);
  return jsonOk({ suggestions });
});
