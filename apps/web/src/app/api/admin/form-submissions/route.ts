import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret');

    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (req.nextUrl.searchParams.get('egressIp') === '1') {
      try {
        const ipRes = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
        const ipData = (await ipRes.json()) as { ip?: string };
        const ip = ipData.ip?.trim();
        if (!ip) {
          return NextResponse.json({ error: 'Could not resolve egress IP' }, { status: 502 });
        }
        return NextResponse.json({
          ip,
          hint: 'Add in Brevo → Settings → Security → Authorized IPs (or disable blocking for Vercel).',
        });
      } catch {
        return NextResponse.json({ error: 'Failed to detect egress IP' }, { status: 502 });
      }
    }

    const supabase = getSupabaseAdmin();
    let { data, error } = await supabase
      .from('team_registration_submissions')
      .select('id, team_name, members, squad_merge_opt_in, created_at')
      .order('created_at', { ascending: false });

    if (error?.message?.includes('squad_merge_opt_in')) {
      const fallback = await supabase
        .from('team_registration_submissions')
        .select('id, team_name, members, created_at')
        .order('created_at', { ascending: false });
      data =
        fallback.data?.map((row: { id: string; team_name: string; members: unknown; created_at: string }) => ({
          ...row,
          squad_merge_opt_in: null,
        })) ?? null;
      error = fallback.error;
    }

    if (error) {
      console.error('[GET /api/admin/form-submissions]', error.message);
      return NextResponse.json({ submissions: [], error: error.message }, { status: 503 });
    }

    return NextResponse.json({ submissions: data ?? [] });
  } catch (err) {
    console.error('[GET /api/admin/form-submissions]', err);
    return NextResponse.json(
      { submissions: [], error: 'Failed to load submissions' },
      { status: 500 }
    );
  }
}
