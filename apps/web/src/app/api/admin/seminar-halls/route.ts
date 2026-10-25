import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { buildAssignmentKey } from '@/lib/seminar-halls';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const adminSecret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');

  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('seminar_hall_assignments')
    .select('assignment_key, seminar_hall, merged_team_name, source_team_names, submission_ids, updated_at')
    .order('seminar_hall')
    .order('merged_team_name');

  if (error) {
    return NextResponse.json({ error: error.message, assignments: [] }, { status: 503 });
  }

  return NextResponse.json(
    { assignments: data ?? [] },
    { headers: { 'Cache-Control': 'private, max-age=15' } }
  );
}

/** Replace-all sync of seating rows (admin export / seed script). */
export async function POST(req: NextRequest) {
  const adminSecret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');

  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const rows = body.assignments as
    | {
        assignment_key?: string;
        seminar_hall: string;
        merged_team_name: string;
        source_team_names: string[];
        submission_ids?: string[];
      }[]
    | undefined;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: 'assignments array is required' }, { status: 400 });
  }

  const payload = rows.map((r) => {
    const source = (r.source_team_names ?? []).map((n) => String(n).trim()).filter(Boolean);
    const assignment_key = r.assignment_key || buildAssignmentKey(source);
    return {
      assignment_key,
      seminar_hall: String(r.seminar_hall).trim().toUpperCase(),
      merged_team_name: r.merged_team_name,
      source_team_names: source,
      submission_ids: r.submission_ids ?? [],
      updated_at: new Date().toISOString(),
    };
  });

  const supabase = getSupabaseAdmin();

  const { error: delErr } = await supabase
    .from('seminar_hall_assignments')
    .delete()
    .gte('assignment_key', '');

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 });
  }

  const { error: insErr } = await supabase.from('seminar_hall_assignments').insert(payload);
  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, count: payload.length });
}
