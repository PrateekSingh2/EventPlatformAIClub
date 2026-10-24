import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured, supabase } from '@/lib/supabase';
import { readLocalTelemetry, resetLocalTelemetryForUser } from '@/lib/local-telemetry';
import { removeLocalDisqualification } from '@/lib/disqualification';
import { StageTelemetry, UserTelemetrySummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

function aggregateTelemetryByUser(
  usersList: any[],
  telemetryRecords: any[]
): UserTelemetrySummary[] {
  const userMap = new Map<string, UserTelemetrySummary>();

  for (const u of usersList) {
    userMap.set(u.id, {
      user_id: u.id,
      name: u.name || 'Unknown User',
      email: u.email || 'N/A',
      role: u.role || 'participant',
      total_score: Number(u.total_score || 0),
      current_stage: Number(u.current_stage || 1),
      is_completed: Boolean(u.is_completed),
      is_flagged: Boolean(u.is_flagged),
      is_disqualified: Boolean(u.is_disqualified || u.role === 'disqualified'),
      total_tab_switches: 0,
      total_fullscreen_exits: 0,
      total_multi_monitor: 0,
      total_devtools_timing: 0,
      total_window_discrepancies: 0,
      total_password_failed_attempts: 0,
      total_excessive_guesses: 0,
      flagged_speedruns: 0,
      flag_reasons: [],
      last_active: u.updated_at || new Date().toISOString(),
      stages: [],
    });
  }

  for (const rec of telemetryRecords) {
    const userId = rec.user_id;
    let summary = userMap.get(userId);
    if (!summary) {
      const uMeta = rec.user || {};
      summary = {
        user_id: userId,
        name: uMeta.name || 'Unknown User',
        email: uMeta.email || 'N/A',
        role: uMeta.role || 'participant',
        total_score: Number(uMeta.total_score || 0),
        current_stage: Number(uMeta.current_stage || rec.stage_number || 1),
        is_completed: Boolean(uMeta.is_completed),
        is_flagged: Boolean(uMeta.is_flagged),
        is_disqualified: Boolean(uMeta.is_disqualified || uMeta.role === 'disqualified'),
        total_tab_switches: 0,
        total_fullscreen_exits: 0,
        total_multi_monitor: 0,
        total_devtools_timing: 0,
        total_window_discrepancies: 0,
        total_password_failed_attempts: 0,
        total_excessive_guesses: 0,
        flagged_speedruns: 0,
        flag_reasons: [],
        last_active: rec.updated_at || rec.created_at || new Date().toISOString(),
        stages: [],
      };
      userMap.set(userId, summary);
    }

    // Accumulate total metrics across all stages for this user
    summary.total_tab_switches += Number(rec.tab_switches || 0);
    summary.total_fullscreen_exits += Number(rec.fullscreen_exits || 0);
    summary.total_multi_monitor += Number(rec.multi_monitor_detected || 0);
    summary.total_devtools_timing += Number(rec.devtools_timing_flags || 0);
    summary.total_window_discrepancies += Number(rec.window_size_discrepancies || 0);
    summary.total_password_failed_attempts += Number(rec.password_failed_attempts || 0);
    summary.total_excessive_guesses += Number(rec.excessive_password_guesses || 0);
    if (rec.flagged_too_fast) summary.flagged_speedruns += 1;
    if (rec.flag_reason && !summary.flag_reasons.includes(rec.flag_reason)) {
      summary.flag_reasons.push(rec.flag_reason);
    }

    summary.current_stage = Math.max(summary.current_stage, Number(rec.stage_number || 1));
    if (rec.updated_at && new Date(rec.updated_at).getTime() > new Date(summary.last_active).getTime()) {
      summary.last_active = rec.updated_at;
    }
    summary.stages.push(rec);
  }

  const results = Array.from(userMap.values());
  for (const summary of results) {
    summary.stages.sort((a, b) => a.stage_number - b.stage_number);
    if (
      summary.total_tab_switches > 2 ||
      summary.total_fullscreen_exits > 1 ||
      summary.total_multi_monitor > 0 ||
      summary.total_devtools_timing > 0 ||
      summary.total_window_discrepancies > 0 ||
      summary.total_excessive_guesses > 0 ||
      summary.flagged_speedruns > 0
    ) {
      summary.is_flagged = true;
    }
  }

  // Sort order: Disqualified first, then Flagged/Suspicious, then by score desc
  results.sort((a, b) => {
    if (a.is_disqualified && !b.is_disqualified) return -1;
    if (!a.is_disqualified && b.is_disqualified) return 1;
    if (a.is_flagged && !b.is_flagged) return -1;
    if (!a.is_flagged && b.is_flagged) return 1;
    return b.total_score - a.total_score;
  });

  return results;
}

export async function GET(req: NextRequest) {
  const adminSecret = req.headers.get('x-admin-secret');
  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Fallback for demo / offline environment without active Supabase
  if (!isSupabaseConfigured) {
    const rawLocal = readLocalTelemetry();
    const users = aggregateTelemetryByUser([], rawLocal);
    return NextResponse.json(
      {
        users,
        records: rawLocal,
        totalContestants: users.length,
        totalTabSwitches: users.reduce((acc, u) => acc + u.total_tab_switches, 0),
        totalFullscreenExits: users.reduce((acc, u) => acc + u.total_fullscreen_exits, 0),
        totalSuspicious: users.filter((u) => u.is_flagged && !u.is_disqualified).length,
        totalDisqualified: users.filter((u) => u.is_disqualified).length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch all participants from users table with safe column handling
    let usersData: any[] | null = null;
    let usersError: any = null;

    // Use select('*') so it never throws if is_completed has not been migrated yet
    const res = await supabaseAdmin
      .from('users')
      .select('*')
      .order('total_score', { ascending: false });

    usersData = res.data;
    usersError = res.error;

    if (usersError) {
      console.warn('[Telemetry API]: select(*) failed, falling back to basic columns:', usersError.message);
      const fallback = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, total_score, current_stage, is_flagged, is_disqualified, updated_at')
        .order('total_score', { ascending: false });
      usersData = fallback.data;
      usersError = fallback.error;
    }

    if (usersError) throw usersError;

    // 2. Fetch all telemetry records
    const { data: telemetryData, error: telemetryError } = await supabaseAdmin
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
        updated_at
      `)
      .order('updated_at', { ascending: false });

    if (telemetryError) throw telemetryError;

    const rawRecords = (telemetryData || []) as StageTelemetry[];
    const aggregatedUsers = aggregateTelemetryByUser(usersData || [], rawRecords);

    return NextResponse.json(
      {
        users: aggregatedUsers,
        records: rawRecords,
        totalContestants: aggregatedUsers.length,
        totalTabSwitches: aggregatedUsers.reduce((acc, u) => acc + u.total_tab_switches, 0),
        totalFullscreenExits: aggregatedUsers.reduce((acc, u) => acc + u.total_fullscreen_exits, 0),
        totalSuspicious: aggregatedUsers.filter((u) => u.is_flagged && !u.is_disqualified).length,
        totalDisqualified: aggregatedUsers.filter((u) => u.is_disqualified).length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          Pragma: 'no-cache',
          Expires: '0',
        },
      }
    );
  } catch (error: any) {
    console.error('[API GET /admin/telemetry error]:', error);
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

      if (isSupabaseConfigured) {
        const supabaseAdmin = getSupabaseAdmin();

        // 1. Check if user was previously disqualified
        const { data: targetUser } = await supabaseAdmin
          .from('users')
          .select('id, is_disqualified, role')
          .eq('id', userId)
          .maybeSingle();

        const wasDisqualified = Boolean(
          targetUser?.is_disqualified || targetUser?.role === 'disqualified'
        );

        // If disqualified, reset score to 0 and stage to 1 so they start from the beginning
        const userUpdatePayload: Record<string, any> = {
          is_flagged: false,
          is_disqualified: false,
          role: 'participant',
          disqualified_at: null,
          disqualification_reason: null,
          updated_at: new Date().toISOString(),
        };

        if (wasDisqualified) {
          userUpdatePayload.total_score = 0;
          userUpdatePayload.current_stage = 1;
        }

        try {
          await supabaseAdmin
            .from('users')
            .update({
              ...userUpdatePayload,
              is_completed: false,
              completed_at: null,
            })
            .eq('id', userId);
        } catch {
          await supabaseAdmin
            .from('users')
            .update(userUpdatePayload)
            .eq('id', userId);
        }

        // If disqualified, delete stages > 1
        if (wasDisqualified) {
          try {
            await supabaseAdmin.from('stage_telemetry').delete().eq('user_id', userId).gt('stage_number', 1);
          } catch {}
        }

        // 2. Clear telemetry flags and reset attempt cooldowns across all stages for this user
        const telemetryResetPayload: Record<string, any> = {
          flagged_too_fast: false,
          flag_reason: null,
          password_failed_attempts: 0,
          password_cooldown_until: null,
          excessive_password_guesses: 0,
          updated_at: new Date().toISOString(),
        };

        if (wasDisqualified) {
          telemetryResetPayload.tab_switches = 0;
          telemetryResetPayload.fullscreen_exits = 0;
          telemetryResetPayload.multi_monitor_detected = 0;
          telemetryResetPayload.devtools_timing_flags = 0;
          telemetryResetPayload.window_size_discrepancies = 0;
          telemetryResetPayload.score_awarded = 0;
          telemetryResetPayload.completed_at = null;
          telemetryResetPayload.completed_timestamp = null;
          telemetryResetPayload.duration_seconds = null;
        }

        if (telemetryId) {
          await supabaseAdmin
            .from('stage_telemetry')
            .update(telemetryResetPayload)
            .eq('id', telemetryId);
        } else {
          await supabaseAdmin
            .from('stage_telemetry')
            .update(telemetryResetPayload)
            .eq('user_id', userId);
        }

        // 3. Clear local in-memory disqualification cache & local telemetry
        removeLocalDisqualification(userId);
        if (wasDisqualified) {
          resetLocalTelemetryForUser(userId);
        }

        // 4. Real-time broadcast to participant's browser to unlock arena and resume gameplay immediately
        try {
          const payload = {
            userId,
            timestamp: new Date().toISOString(),
            resetToStart: wasDisqualified,
            stageNumber: 1,
            totalScore: 0,
          };
          const channel = supabase.channel('participant-status');
          const userChannel = supabase.channel(`participant-status-${userId}`);
          Promise.race([
            Promise.all([
              channel.send({ type: 'broadcast', event: 'reinstated', payload }),
              userChannel.send({ type: 'broadcast', event: 'reinstated', payload }),
            ]),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), 1000)),
          ]).catch(() => {});
        } catch {
          // Ignore broadcast failure
        }
      } else {
        removeLocalDisqualification(userId);
        resetLocalTelemetryForUser(userId);
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
