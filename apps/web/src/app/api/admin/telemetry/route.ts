import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { readLocalTelemetry } from '@/lib/local-telemetry';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ records: readLocalTelemetry() });
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('stage_telemetry')
      .select(`
        id,
        user_id,
        stage_number,
        started_at,
        completed_at,
        duration_seconds,
        tab_switches,
        fullscreen_exits,
        multi_monitor_detected,
        devtools_timing_flags,
        devtools_probe_latency_ms,
        window_size_discrepancies,
        password_failed_attempts,
        password_cooldown_until,
        excessive_password_guesses,
        flagged_too_fast,
        flag_reason,
        created_at,
        updated_at,
        users (
          name,
          email,
          total_score,
          current_stage,
          is_flagged
        )
      `)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    const records = (data || []).map((row: any) => ({
      ...row,
      user: Array.isArray(row.users) ? row.users[0] : row.users,
    }));
    return NextResponse.json({ records });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to load live telemetry' },
      { status: 500 }
    );
  }
}
