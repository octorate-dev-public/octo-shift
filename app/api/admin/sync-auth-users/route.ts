/**
 * POST /api/admin/sync-auth-users
 *
 * Migrazione una-tantum: crea gli utenti Supabase Auth per ogni riga
 * presente nella tabella `users` che non ha ancora un account Auth.
 *
 * - Usa lo stesso UUID dell'utente esistente per preservare tutte le FK.
 * - La password temporanea viene generata casualmente e inclusa nella risposta.
 * - Rimuovere questo file dopo l'esecuzione.
 *
 * Protezione: richiede l'header `x-admin-secret` con il valore di
 * ADMIN_SYNC_SECRET (env var). Se non impostata, accetta solo da localhost.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function makeAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY mancanti');
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function randomPassword(len = 16): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function POST(req: NextRequest) {
  // --- Protezione accesso ---
  const secret = process.env.ADMIN_SYNC_SECRET;
  if (secret) {
    if (req.headers.get('x-admin-secret') !== secret) {
      return NextResponse.json({ error: 'Non autorizzato' }, { status: 401 });
    }
  } else {
    // Senza secret, permetti solo da localhost
    const host = req.headers.get('host') ?? '';
    if (!host.startsWith('localhost') && !host.startsWith('127.0.0.1')) {
      return NextResponse.json(
        { error: 'Imposta ADMIN_SYNC_SECRET per usare questo endpoint in produzione' },
        { status: 403 },
      );
    }
  }

  const admin = makeAdminClient();

  // 1. Leggi tutti gli utenti dalla tabella app
  const { data: appUsers, error: dbErr } = await admin
    .from('users')
    .select('id, email, full_name, role')
    .order('full_name');

  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 });
  }

  // 2. Leggi tutti gli utenti Auth esistenti (paginati fino a 1000)
  const { data: authList, error: authErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (authErr) {
    return NextResponse.json({ error: authErr.message }, { status: 500 });
  }

  const authEmailSet = new Set(authList.users.map((u) => u.email?.toLowerCase()));
  const authIdSet = new Set(authList.users.map((u) => u.id));

  const created: { id: string; email: string; full_name: string; temp_password: string }[] = [];
  const skipped: { id: string; email: string; reason: string }[] = [];
  const errors: { id: string; email: string; error: string }[] = [];

  // 3. Per ogni utente app non ancora in Auth, crealo
  for (const user of appUsers ?? []) {
    const emailLower = user.email?.toLowerCase();

    if (authIdSet.has(user.id)) {
      skipped.push({ id: user.id, email: user.email, reason: 'ID già presente in Auth' });
      continue;
    }
    if (authEmailSet.has(emailLower)) {
      skipped.push({ id: user.id, email: user.email, reason: 'email già presente in Auth (ID diverso)' });
      continue;
    }

    const tempPassword = randomPassword();

    // Usa `id` per preservare le FK — supportato dall'API Admin di Supabase Auth
    const { data: created_user, error: createErr } = await admin.auth.admin.createUser({
      id: user.id,
      email: user.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { full_name: user.full_name },
    } as any);

    if (createErr) {
      errors.push({ id: user.id, email: user.email, error: createErr.message });
    } else {
      created.push({ id: created_user.user.id, email: user.email, full_name: user.full_name, temp_password: tempPassword });
    }
  }

  return NextResponse.json({
    summary: {
      total_app_users: (appUsers ?? []).length,
      created: created.length,
      skipped: skipped.length,
      errors: errors.length,
    },
    created,
    skipped,
    errors,
  });
}
