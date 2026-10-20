import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readLocalTelemetry } from '@/lib/local-telemetry';
import { removeLocalDisqualification } from '@/lib/disqualification';

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
          is_flagged,
          role,
          is_disqualified
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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, telemetryId, userId, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (action === 'clear_flag') {
      if (!userId) {
        return NextResponse.json({ error: 'userId is required' }, { status: 400 });
      }

      const supabaseAdmin = getSupabaseAdmin();

      // 1. Reset user flag & disqualification status so contestant can immediately resume gameplay
      await supabaseAdmin
        .from('users')
        .update({
          is_flagged: false,
          is_disqualified: false,
          role: 'participant',
          disqualified_at: null,
          disqualification_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      // 2. Clear telemetry flags and reset attempt cooldowns
      if (telemetryId) {
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            flagged_too_fast: false,
            flag_reason: null,
            password_failed_attempts: 0,
            password_cooldown_until: null,
            excessive_password_guesses: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', telemetryId);
      } else {
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            flagged_too_fast: false,
            flag_reason: null,
            password_failed_attempts: 0,
            password_cooldown_until: null,
            excessive_password_guesses: 0,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }

      // 3. Clear local in-memory disqualification cache
      removeLocalDisqualification(userId);

      // 4. Real-time broadcast to participant's browser to unlock arena and resume gameplay immediately
      try {
        if (isSupabaseConfigured) {
          const payload = { userId, timestamp: new Date().toISOString() };
          const channel = supabase.channel('participant-status');
          const userChannel = supabase.channel(`participant-status-${userId}`);
          Promise.race([
            Promise.all([
              channel.send({ type: 'broadcast', event: 'reinstated', payload }),
              userChannel.send({ type: 'broadcast', event: 'reinstated', payload }),
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), 1000)),
          ]).catch(() => {});
        }
      } catch {
        // Ignore broadcast failure
      }

      return NextResponse.json({
        success: true,
        message: 'Flag cleared successfully. Participant game session resumed.',
        userId,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[API POST /admin/telemetry error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process telemetry action' },
      { status: 500 }
    );
  }
}
