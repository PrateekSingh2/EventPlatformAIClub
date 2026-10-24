import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminSecret =
      req.headers.get('x-admin-secret') ||
      req.nextUrl.searchParams.get('adminSecret');

    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_registration_submissions')
      .select('id, team_name, members, created_at')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/admin/form-submissions]', error.message);
      return NextResponse.json({ submissions: [], error: error.message }, { status: 200 });
    }

    return NextResponse.json({ submissions: data ?? [] });
  } catch (err) {
    console.error('[GET /api/admin/form-submissions]', err);
    return NextResponse.json({ submissions: [] });
  }
}
