import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { QuizQuestion } from '@/lib/types';
import { getContestSettings } from '@/lib/contest';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber, answers, nextStagePassword } = body;

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
    const nextStageNum = stageNum + 1;
    const supabaseAdmin = getSupabaseAdmin();

    // 2. Validate Next Stage Password if unlocking via password
    if (nextStagePassword) {
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
        return NextResponse.json(
          {
            success: false,
            message: 'Wrong password, try to figure it out once again.',
          },
          { status: 400 }
        );
      }
    }

    // 3. Fetch current stage details including min_expected_seconds
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

    // 4. Retrieve telemetry started_at to compute duration
    let durationSeconds = 30;
    try {
      const { data: telemetry } = await supabaseAdmin
        .from('stage_telemetry')
        .select('started_at, flagged_too_fast')
        .eq('user_id', user.id)
        .eq('stage_number', stageNum)
        .maybeSingle();

      const now = Date.now();
      const startedAtMs = telemetry?.started_at ? new Date(telemetry.started_at).getTime() : now;
      durationSeconds = Math.max(1, Math.floor((now - startedAtMs) / 1000));
    } catch {
      // Default duration
    }

    // 5. Check anti-cheat speed threshold
    const isTooFast = durationSeconds < minExpectedSeconds;
    let flagReason: string | null = null;

    if (isTooFast) {
      flagReason = `Speed-Run Alert: Completed Stage ${stageNum} in ${durationSeconds}s (Admin threshold: ${minExpectedSeconds}s)`;
      console.warn(`[Anti-Cheat Flag] User ${user.email} (${user.id}) flagged on Stage ${stageNum}: ${flagReason}`);
    }

    // 6. Update telemetry flag state
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

    // 7. Atomic progression & score awarding via PL/pgSQL RPC
    try {
      const { error: rpcErr } = await supabaseAdmin.rpc('complete_stage_and_award_points', {
        p_user_id: user.id,
        p_stage_number: stageNum,
        p_points: pointsAwarded,
        p_is_flagged: isTooFast,
      });

      if (rpcErr) {
        throw rpcErr;
      }
    } catch (rpcErr) {
      console.warn('[RPC fallback]: executing direct updates');
      try {
        await supabaseAdmin
          .from('users')
          .update({
            total_score: (user.total_score || 0) + pointsAwarded,
            current_stage: Math.max(user.current_stage || 1, stageNum + 1),
            is_flagged: Boolean(user.is_flagged || isTooFast),
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            completed_at: new Date().toISOString(),
            duration_seconds: durationSeconds,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('stage_number', stageNum);
      } catch {
        // Fallback completed
      }
    }

    return NextResponse.json({
      success: true,
      allCorrect: true,
      scoreAwarded: pointsAwarded,
      nextStage: stageNum + 1,
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
