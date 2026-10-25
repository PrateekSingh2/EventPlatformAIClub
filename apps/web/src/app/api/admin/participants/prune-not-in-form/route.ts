import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type ParticipantRow = {
  id: string;
  email: string | null;
  name: string | null;
  access_token: string | null;
  team_name: string | null;
  role: string | null;
};

type TokenArchiveRow = {
  id: string;
  access_token: string | null;
  storage_path: string | null;
};

function collectFormEmails(submissions: { members?: unknown }[]): Set<string> {
  const emails = new Set<string>();
  for (const sub of submissions) {
    const members = Array.isArray(sub.members) ? sub.members : [];
    for (const m of members) {
      if (!m || typeof m !== 'object') continue;
      const email = String((m as { email?: string }).email || '')
        .trim()
        .toLowerCase();
      if (email.includes('@')) emails.add(email);
    }
  }
  return emails;
}

export async function POST(req: NextRequest) {
  const adminSecret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');

  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const execute = body.execute === true;

  const supabase = getSupabaseAdmin();

  const { data: submissions, error: formErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members');

  if (formErr) {
    return NextResponse.json({ error: formErr.message }, { status: 503 });
  }

  const formEmails = collectFormEmails(submissions ?? []);

  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, email, name, access_token, team_name, role')
    .eq('role', 'participant');

  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 503 });
  }

  const participantRows = (users ?? []) as ParticipantRow[];
  const orphanUsers = participantRows.filter((u) => {
    const email = String(u.email || '')
      .trim()
      .toLowerCase();
    return !formEmails.has(email);
  });

  const allowedTokens = new Set(
    participantRows
      .filter((u) => formEmails.has(String(u.email || '').trim().toLowerCase()))
      .map((u) => String(u.access_token || '').trim().toUpperCase())
      .filter((t) => t && !t.startsWith('PENDING'))
  );

  const { data: archives, error: archErr } = await supabase
    .from('token_archives')
    .select('id, access_token, storage_path');

  if (archErr) {
    return NextResponse.json({ error: archErr.message }, { status: 503 });
  }

  const archiveRows = (archives ?? []) as TokenArchiveRow[];
  const orphanArchives = archiveRows.filter((a) => {
    const token = String(a.access_token || '').trim().toUpperCase();
    return !allowedTokens.has(token);
  });

  if (!execute) {
    return NextResponse.json({
      dryRun: true,
      formEmailCount: formEmails.size,
      orphanUsers,
      orphanArchives,
    });
  }

  for (const u of orphanUsers) {
    await supabase.from('stage_telemetry').delete().eq('user_id', u.id);
    const { error } = await supabase.from('users').delete().eq('id', u.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  for (const a of orphanArchives) {
    try {
      await supabase.from('stage_passwords').delete().eq('token_archive_id', a.id);
    } catch {
      /* optional table */
    }
    const { error } = await supabase.from('token_archives').delete().eq('id', a.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    success: true,
    removedUsers: orphanUsers.length,
    removedArchives: orphanArchives.length,
  });
}
