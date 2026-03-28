import { withHandler, jsonOk, parseBody, noContent } from '@/lib/api-handler';
import { usersAPI } from '@/lib/api/users';

/**
 * GET /api/users                   → all active users
 * GET /api/users?id=...            → single user
 * GET /api/users?email=...         → user by email
 * GET /api/users?teamId=...        → team users
 * GET /api/users?search=...        → search
 * GET /api/users?sortBy=seniority  → sorted by seniority
 */
export const GET = withHandler('api/users', 'GET', async (req) => {
  const p = req.nextUrl.searchParams;

  if (p.has('id')) {
    const user = await usersAPI.getUser(p.get('id')!);
    return user ? jsonOk(user) : jsonOk({ error: 'Utente non trovato' }, 404);
  }

  if (p.has('email')) {
    const user = await usersAPI.getUserByEmail(p.get('email')!);
    return user ? jsonOk(user) : jsonOk({ error: 'Utente non trovato' }, 404);
  }

  if (p.has('teamId')) {
    const users = await usersAPI.getTeamUsers(p.get('teamId')!);
    return jsonOk(users);
  }

  if (p.has('search')) {
    const users = await usersAPI.searchUsers(p.get('search')!);
    return jsonOk(users);
  }

  if (p.get('sortBy') === 'seniority') {
    const users = await usersAPI.getUsersBySeniority();
    return jsonOk(users);
  }

  const users = await usersAPI.getAllUsers();
  return jsonOk(users);
});

/**
 * POST /api/users  { email, password, fullName, role, seniorityDate, teamId? }
 */
export const POST = withHandler('api/users', 'POST', async (req) => {
  const { email, password, fullName, role, seniorityDate, teamIds } = await parseBody(req);
  const user = await usersAPI.createUser(email, password, fullName, role, seniorityDate, teamIds ?? []);
  return jsonOk(user, 201);
});

/**
 * PATCH /api/users  { id, fullName?, email?, role?, seniorityDate?, teamId?, isActive? }
 */
export const PATCH = withHandler('api/users', 'PATCH', async (req) => {
  const { id, fullName, email, role, seniorityDate, isActive, teamIds } = await parseBody(req);
  if (!id) return jsonOk({ error: 'Parametro id mancante' }, 400);

  const updates: Record<string, unknown> = {};
  if (fullName !== undefined) updates.full_name = fullName;
  if (email !== undefined) updates.email = email;
  if (role !== undefined) updates.role = role;
  if (seniorityDate !== undefined) updates.seniority_date = seniorityDate;
  if (isActive !== undefined) updates.is_active = isActive;
  if (Array.isArray(teamIds)) updates.team_ids = teamIds;

  const user = await usersAPI.updateUser(id, updates as any);
  return jsonOk(user);
});

/**
 * DELETE /api/users?id=...  (soft-delete / deactivate)
 */
export const DELETE = withHandler('api/users', 'DELETE', async (req) => {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return jsonOk({ error: 'Parametro id mancante' }, 400);
  const user = await usersAPI.deactivateUser(id);
  return jsonOk(user);
});
