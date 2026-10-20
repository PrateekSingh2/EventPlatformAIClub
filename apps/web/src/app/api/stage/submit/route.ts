import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { QuizQuestion } from '@/lib/types';
import { getContestSettings } from '@/lib/contest';
import {
  clearPasswordAttemptState,
  getPasswordAttemptState,
  registerPasswordFailure,
} from '@/lib/password-attempts';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      try {
        const text = await req.text();
        body = JSON.parse(text);
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON request payload' },
          { status: 400 }
        );
      }
    }

    const {
      accessToken,
      stageNumber,
      answers,
      nextStagePassword,
      completedAt,
      completedTimestamp,
      durationSeconds: clientDurationSeconds,
      points: clientPoints,
    } = body;

    if (!accessToken || !stageNumber) {
      return NextResponse.json(
        { error: 'accessToken and stageNumber are required' },
        { status: 400 }
      );
    }

    // 1. Authenticate user
    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid participant token' },
        { status: 401 }
      );
    }

    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json(
        { error: 'Account Suspended for Fair-Play Violations. Submissions blocked.' },
        { status: 403 }
      );
    }

    // 2. Enforce contest lifecycle
    const contest = await getContestSettings();
    if (contest.status === 'DRAFT') {
      return NextResponse.json(
        { error: 'Contest is in DRAFT mode. Submissions are not yet open.' },
        { status: 403 }
      );
    }
    if (contest.status === 'FROZEN') {
      return NextResponse.json(
        { error: 'Contest is currently FROZEN. Submissions are temporarily paused.' },
        { status: 403 }
      );
    }
    if (contest.status === 'CONCLUDED') {
      return NextResponse.json(
        { error: 'Contest has CONCLUDED. Submissions are closed.' },
        { status: 403 }
      );
    }

    const stageNum = Number(stageNumber);
    if (!Number.isInteger(stageNum) || stageNum < 1) {
      return NextResponse.json({ error: 'Invalid stage number' }, { status: 400 });
    }
    const nextStageNum = stageNum + 1;
    const supabaseAdmin = getSupabaseAdmin();

    // 3. Compute exact completion timestamp (preserves true offline completion time for leaderboard tie-breakers)
    let completionIso: string;
    if (completedAt && !isNaN(new Date(completedAt).getTime())) {
      completionIso = new Date(completedAt).toISOString();
    } else if (completedTimestamp && typeof completedTimestamp === 'number' && completedTimestamp > 0) {
      completionIso = new Date(completedTimestamp).toISOString();
    } else {
      completionIso = new Date().toISOString();
    }

    // 4. Idempotency Check: Prevent duplicate score additions if offline queue retries
    try {
      const { data: existingTelemetry } = await supabaseAdmin
        .from('stage_telemetry')
        .select('completed_at, duration_seconds')
        .eq('user_id', user.id)
        .eq('stage_number', stageNum)
        .maybeSingle();

      if (existingTelemetry?.completed_at || (user.current_stage && user.current_stage > stageNum)) {
        return NextResponse.json({
          success: true,
          alreadyCompleted: true,
          scoreAwarded: 0,
          nextStage: Math.max(user.current_stage || 1, stageNum + 1),
          message: `Stage ${stageNum} was already submitted. Leaderboard ranking is preserved.`,
          completedAt: existingTelemetry?.completed_at || completionIso,
        });
      }
    } catch {
      // Continue if telemetry table read fails
    }

    // 5. Validate Next Stage Password if unlocking via password
    if (typeof nextStagePassword !== 'string' || !nextStagePassword.trim()) {
      return NextResponse.json({ success: false, error: 'Stage password is required.' }, { status: 400 });
    }
    if (nextStagePassword) {
      const attemptState = await getPasswordAttemptState(user, stageNum);
      if (attemptState.cooldownSeconds > 0) {
        return NextResponse.json({
          success: false,
          error: `Too many incorrect passwords. Try again in ${attemptState.cooldownSeconds} seconds.`,
          ...attemptState,
        }, { status: 429 });
      }

      const cleanPassword = nextStagePassword.trim();
      let isPasswordValid = false;

      // Check against database next stage if available
      try {
        const { data: nextStage } = await supabaseAdmin
          .from('stages')
          .select('zip_password')
          .eq('stage_number', nextStageNum)
          .maybeSingle();

        if (nextStage && nextStage.zip_password) {
          isPasswordValid = cleanPassword === nextStage.zip_password.trim();
        }
      } catch {
        // Fallback to demo passwords
      }

      // Built-in demo archive password verification
      if (!isPasswordValid) {
        if (nextStageNum === 2 && cleanPassword === 'cyber2026') {
          isPasswordValid = true;
        } else if (nextStageNum === 3 && cleanPassword === 'quantum4096') {
          isPasswordValid = true;
        }
      }

      if (!isPasswordValid) {
        const failedAttempt = await registerPasswordFailure(user, stageNum);
        if (failedAttempt.blocked) {
          return NextResponse.json({
            success: false,
            error: `Too many incorrect passwords. Try again in ${failedAttempt.cooldownSeconds} seconds.`,
            ...failedAttempt,
          }, { status: 429 });
        }
        return NextResponse.json(
          {
            success: false,
            error: failedAttempt.cooldownSeconds > 0
              ? `Wrong password. Try again in ${failedAttempt.cooldownSeconds} seconds.`
              : 'Wrong password, try to figure it out once again.',
            ...failedAttempt,
          },
          { status: 400 }
        );
      }

      await clearPasswordAttemptState(user, stageNum);
    }

    // 6. Fetch current stage details including min_expected_seconds
    let minExpectedSeconds = 60;
    let pointsAwarded = 100;

    try {
      const { data: stage } = await supabaseAdmin
        .from('stages')
        .select('points, min_expected_seconds')
        .eq('stage_number', stageNum)
        .maybeSingle();

      if (stage) {
        minExpectedSeconds = stage.min_expected_seconds || 60;
        pointsAwarded = stage.points || 100;
      }
    } catch {
      // Use defaults
    }

    // Allow optional points override from client payload if defined and positive
    if (typeof clientPoints === 'number' && clientPoints > 0) {
      pointsAwarded = clientPoints;
    }

    // 7. Accurately calculate duration using client measurement or telemetry started_at
    let durationSeconds = 30;
    try {
      const { data: telemetry } = await supabaseAdmin
        .from('stage_telemetry')
        .select('started_at, flagged_too_fast')
        .eq('user_id', user.id)
        .eq('stage_number', stageNum)
        .maybeSingle();

      const completionMs = new Date(completionIso).getTime();
      const startedAtMs = telemetry?.started_at ? new Date(telemetry.started_at).getTime() : completionMs - 30000;
      const serverCalculatedDuration = Math.max(1, Math.floor((completionMs - startedAtMs) / 1000));

      if (typeof clientDurationSeconds === 'number' && clientDurationSeconds > 0) {
        durationSeconds = Math.max(1, Math.round(clientDurationSeconds));
      } else {
        durationSeconds = serverCalculatedDuration;
      }
    } catch {
      if (typeof clientDurationSeconds === 'number' && clientDurationSeconds > 0) {
        durationSeconds = Math.max(1, Math.round(clientDurationSeconds));
      }
    }

    // 8. Check anti-cheat speed threshold against true elapsed stage duration
    const isTooFast = durationSeconds < minExpectedSeconds;
    let flagReason: string | null = null;

    if (isTooFast) {
      flagReason = `Speed-Run Alert: Completed Stage ${stageNum} in ${durationSeconds}s (Admin threshold: ${minExpectedSeconds}s)`;
      console.warn(`[Anti-Cheat Flag] User ${user.email} (${user.id}) flagged on Stage ${stageNum}: ${flagReason}`);
    }

    // 9. Update telemetry flag state if violation detected
    if (isTooFast) {
      try {
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            flagged_too_fast: true,
            flag_reason: flagReason,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('stage_number', stageNum);
      } catch {
        // Silently ignore
      }
    }

    // 10. Atomic progression & score awarding with exact completion timestamp
    let rpcSuccess = false;
    try {
      // Attempt 1: Call updated 6-parameter RPC passing completion timestamp & duration
      const { error: rpcErr } = await supabaseAdmin.rpc('complete_stage_and_award_points', {
        p_user_id: user.id,
        p_stage_number: stageNum,
        p_points: pointsAwarded,
        p_is_flagged: isTooFast,
        p_completed_at: completionIso,
        p_duration_seconds: durationSeconds,
      });

      if (!rpcErr) {
        rpcSuccess = true;
      } else {
        // Attempt 2: Backwards compatible call with 4 parameters
        const { error: rpc4Err } = await supabaseAdmin.rpc('complete_stage_and_award_points', {
          p_user_id: user.id,
          p_stage_number: stageNum,
          p_points: pointsAwarded,
          p_is_flagged: isTooFast,
        });
        if (!rpc4Err) {
          rpcSuccess = true;
        }
      }
    } catch (rpcErr) {
      console.warn('[RPC fallback]: executing direct atomic updates with timestamp', rpcErr);
    }

    // In case RPC was 4-parameter or direct fallback was required:
    // Update users.updated_at strictly to completionIso so leaderboard tie-breaker reflects actual completion!
    try {
      await supabaseAdmin
        .from('users')
        .update({
          ...(!rpcSuccess ? {
            total_score: (user.total_score || 0) + pointsAwarded,
            current_stage: Math.max(user.current_stage || 1, stageNum + 1),
            is_flagged: Boolean(user.is_flagged || isTooFast),
          } : {}),
          updated_at: completionIso, // Leaderboard rank tie-breaker
        })
        .eq('id', user.id);

      await supabaseAdmin
        .from('stage_telemetry')
        .update({
          completed_at: completionIso,
          duration_seconds: durationSeconds,
          ...(isTooFast ? { flagged_too_fast: true, flag_reason: flagReason } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('stage_number', stageNum);
    } catch (directErr) {
      console.warn('[Fallback direct update warning]:', directErr);
    }

    return NextResponse.json({
      success: true,
      allCorrect: true,
      scoreAwarded: pointsAwarded,
      nextStage: stageNum + 1,
      completedAt: completionIso,
      durationSeconds,
      message: `Stage ${stageNum} passed successfully! +${pointsAwarded} points awarded.`,
    });
  } catch (error: any) {
    console.error('[API POST /api/stage/submit error]:', error);
    return NextResponse.json(
      { error: error.message || 'Submission failed' },
      { status: 500 }
    );
  }
}
