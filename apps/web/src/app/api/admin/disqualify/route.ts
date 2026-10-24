import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

import { recordLocalDisqualification, removeLocalDisqualification } from '@/lib/disqualification';
import { resetLocalTelemetryForUser } from '@/lib/local-telemetry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, reason, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid userId' },
        { status: 400 }
      );
    }

    const cleanReason =
      typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : 'Disqualified by tournament administrator for fair-play rule violations.';

    let updatedUser: any = null;

    let teamMemberIds: string[] = [userId];

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // 1. Ensure user is not an administrator and fetch team info
      const { data: targetUser, error: fetchErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role, team_name, access_token')
        .eq('id', userId)
        .maybeSingle();

      if (targetUser && targetUser.role === 'admin') {
        return NextResponse.json(
          { success: false, error: 'Cannot disqualify an administrator account.' },
          { status: 400 }
        );
      }

      // 2. Discover all team members belonging to the same team name or token
      if (targetUser) {
        if (targetUser.team_name) {
          const { data: teamUsers } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('team_name', targetUser.team_name);
          if (teamUsers && teamUsers.length > 0) {
            teamMemberIds = Array.from(new Set([...teamMemberIds, ...teamUsers.map((u: any) => u.id)]));
          }
        } else if (targetUser.access_token) {
          const { data: tokenUsers } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('access_token', targetUser.access_token);
          if (tokenUsers && tokenUsers.length > 0) {
            teamMemberIds = Array.from(new Set([...teamMemberIds, ...tokenUsers.map((u: any) => u.id)]));
          }
        }
      }

      // 3. Disqualify ALL members belonging to this team
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          role: 'disqualified',
          is_disqualified: true,
          disqualified_at: new Date().toISOString(),
          disqualification_reason: cleanReason,
          is_flagged: true,
          updated_at: new Date().toISOString(),
        })
        .in('id', teamMemberIds)
        .select();

      if (!error && data && data.length > 0) {
        updatedUser = data.find((u: any) => u.id === userId) || data[0];
      }
    } catch (err: any) {
      console.warn('[Disqualify API] Supabase error:', err.message);
    }

    // Record in local cache for each team member
    for (const memberId of teamMemberIds) {
      recordLocalDisqualification(memberId);
    }

    // Broadcast real-time suspension events for all team members
    try {
      const isSupabaseConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');
      if (isSupabaseConfigured) {
        const channel = supabase.channel('participant-status');
        for (const memberId of teamMemberIds) {
          const payload = {
            userId: memberId,
            reason: cleanReason,
            timestamp: new Date().toISOString(),
          };
          const userChannel = supabase.channel(`participant-status-${memberId}`);
          channel.send({ type: 'broadcast', event: 'disqualified', payload }).catch(() => {});
          userChannel.send({ type: 'broadcast', event: 'disqualified', payload }).catch(() => {});
        }
      }
    } catch {
      // Ignore realtime delivery warnings
    }

    return NextResponse.json({
      success: true,
      message: 'Participant has been successfully disqualified.',
      user: updatedUser || {
        id: userId,
        role: 'disqualified',
        is_disqualified: true,
        disqualification_reason: cleanReason,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to disqualify participant' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid userId' },
        { status: 400 }
      );
    }

    let teamMemberIds: string[] = [userId];

    try {
      const supabaseAdmin = getSupabaseAdmin();

      const { data: targetUser } = await supabaseAdmin
        .from('users')
        .select('id, team_name, access_token')
        .eq('id', userId)
        .maybeSingle();

      if (targetUser) {
        if (targetUser.team_name) {
          const { data: teamUsers } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('team_name', targetUser.team_name);
          if (teamUsers && teamUsers.length > 0) {
            teamMemberIds = Array.from(new Set([...teamMemberIds, ...teamUsers.map((u: any) => u.id)]));
          }
        } else if (targetUser.access_token) {
          const { data: tokenUsers } = await supabaseAdmin
            .from('users')
            .select('id')
            .eq('access_token', targetUser.access_token);
          if (tokenUsers && tokenUsers.length > 0) {
            teamMemberIds = Array.from(new Set([...teamMemberIds, ...tokenUsers.map((u: any) => u.id)]));
          }
        }
      }

      // Reset users to start from beginning (stage 1) and reset score to 0
      const updatePayload: Record<string, any> = {
        role: 'participant',
        is_disqualified: false,
        is_flagged: false,
        disqualified_at: null,
        disqualification_reason: null,
        total_score: 0,
        current_stage: 1,
        updated_at: new Date().toISOString(),
      };

      // Safely try updating with is_completed & completed_at
      try {
        await supabaseAdmin
          .from('users')
          .update({
            ...updatePayload,
            is_completed: false,
            completed_at: null,
          })
          .in('id', teamMemberIds);
      } catch {
        // Fallback if is_completed column doesn't exist
        await supabaseAdmin
          .from('users')
          .update(updatePayload)
          .in('id', teamMemberIds);
      }

      // Clear stage_telemetry records for stage_number > 1
      try {
        await supabaseAdmin
          .from('stage_telemetry')
          .delete()
          .in('user_id', teamMemberIds)
          .gt('stage_number', 1);
      } catch {}

      // Reset stage_number === 1 telemetry metrics (reset violations, failed guesses, cooldowns, flags)
      try {
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            tab_switches: 0,
            fullscreen_exits: 0,
            multi_monitor_detected: 0,
            devtools_timing_flags: 0,
            window_size_discrepancies: 0,
            password_failed_attempts: 0,
            password_cooldown_until: null,
            excessive_password_guesses: 0,
            flagged_too_fast: false,
            flag_reason: null,
            score_awarded: 0,
            completed_at: null,
            completed_timestamp: null,
            duration_seconds: null,
            updated_at: new Date().toISOString(),
          })
          .in('user_id', teamMemberIds)
          .eq('stage_number', 1);
      } catch {}
    } catch {
      // Ignore
    }

    for (const memberId of teamMemberIds) {
      removeLocalDisqualification(memberId);
      resetLocalTelemetryForUser(memberId);
    }

    // Broadcast real-time reinstatement events for all team members
    try {
      const isSupabaseConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');
      if (isSupabaseConfigured) {
        const channel = supabase.channel('participant-status');
        for (const memberId of teamMemberIds) {
          const payload = { userId: memberId, timestamp: new Date().toISOString(), resetToStart: true, stageNumber: 1, totalScore: 0 };
          const userChannel = supabase.channel(`participant-status-${memberId}`);
          channel.send({ type: 'broadcast', event: 'reinstated', payload }).catch(() => {});
          userChannel.send({ type: 'broadcast', event: 'reinstated', payload }).catch(() => {});
        }
      }
    } catch {
      // Ignore realtime delivery warnings
    }

    return NextResponse.json({
      success: true,
      message: 'Participant has been successfully reinstated.',
      userId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reinstate participant' },
      { status: 500 }
    );
  }
}
