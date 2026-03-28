import { withHandler, jsonOk, noContent, parseBody, requireParam } from '@/lib/api-handler';
import { teamsAPI } from '@/lib/api/teams';

/**
 * GET /api/teams          → all teams
 * GET /api/teams?id=...   → single team
 */
export const GET = withHandler('api/teams', 'GET', async (req) => {
  const id = req.nextUrl.searchParams.get('id');

  if (id) {
    const team = await teamsAPI.getTeam(id);
    return team ? jsonOk(team) : jsonOk({ error: 'Team non trovato' }, 404);
  }

  const teams = await teamsAPI.getAllTeams();
  return jsonOk(teams);
});

/**
 * POST /api/teams  { name, description?, weeklyMeetingDay? }
 */
export const POST = withHandler('api/teams', 'POST', async (req) => {
  const { name, description, weeklyMeetingDay, color } = await parseBody(req);
  const team = await teamsAPI.createTeam(name, description, weeklyMeetingDay, color);
  return jsonOk(team, 201);
});

/**
 * PATCH /api/teams  { id, name?, description?, weeklyMeetingDay?, color? }
 */
export const PATCH = withHandler('api/teams', 'PATCH', async (req) => {
  const { id, name, description, weeklyMeetingDay, color } = await parseBody(req);

  const updates: Record<string, string | null | undefined> = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (weeklyMeetingDay !== undefined) updates.weekly_meeting_day = weeklyMeetingDay;
  if (color !== undefined) updates.color = color;

  const team = await teamsAPI.updateTeam(id, updates as any);
  return jsonOk(team);
});

/**
 * DELETE /api/teams?id=...
 */
export const DELETE = withHandler('api/teams', 'DELETE', async (req) => {
  const id = requireParam(req, 'id');
  await teamsAPI.deleteTeam(id);
  return noContent();
});
