import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getPasswordAttemptState, registerPasswordFailure, clearPasswordAttemptState } from '@/lib/password-attempts';
import { isStagePasswordValidForUser } from '@/lib/stage-password';
import { wasStageBypassed } from '@/lib/stage-bypass-db';

/**
 * POST /api/stage/verify-stage-password
 *
 * Confirms that a participant has unlocked a stage's nested ZIP password.
 * Awards points, advances user current_stage, and logs telemetry.
 * If user has already completed the contest, their stats are locked.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      accessToken,
      stageNumber,
      password,
      completedAt,
      completedTimestamp,
      durationSeconds,
    } = body;

    const stageNum = Number(stageNumber);

    if (!accessToken || !stageNum || !password) {
      return NextResponse.json(
        { error: 'accessToken, stageNumber, and password are required' },
        { status: 400 }
      );
    }

    // 1. Authenticate
    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid access token' }, { status: 401 });
    }
    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // Lock stats if game completed
    if (user.is_completed) {
      return NextResponse.json(
        { error: 'Contest completed. Participant stats are permanently locked.' },
        { status: 403 }
      );
    }

    const cleanPassword = password.trim();

    // 2. Rate-limit check
    const attemptState = await getPasswordAttemptState(user, stageNum);
    if (attemptState.cooldownSeconds > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Too many incorrect passwords. Try again in ${attemptState.cooldownSeconds} seconds.`,
          ...attemptState,
        },
        { status: 429 }
      );
    }

    const supabaseAdmin = isSupabaseConfigured ? getSupabaseAdmin() : null;
    const isPasswordValid = await isStagePasswordValidForUser(
      supabaseAdmin,
      accessToken,
      user,
      stageNum,
      cleanPassword
    );

    if (!isPasswordValid) {
      const failState = await registerPasswordFailure(user, stageNum);
      const msg = failState.cooldownSeconds > 0
        ? `Incorrect password. Try again in ${failState.cooldownSeconds} seconds.`
        : `Incorrect password. ${Math.max(0, 3 - failState.failedAttempts)} attempt(s) remaining.`;
      return NextResponse.json({ success: false, error: msg, ...failState }, { status: 400 });
    }

    await clearPasswordAttemptState(user, stageNum);

    const bypassed = await wasStageBypassed(user.id, stageNum);

    // 3. Award points (zero if participant used bypass-this-stage)
    const pointsToAward = bypassed ? 0 : 100;
    const prevStage = user.current_stage || 1;
    const newStage = Math.max(prevStage, stageNum);

    if (supabaseAdmin) {
      const existingTimestamps = (user as any).stage_timestamps || {};
      const existingDurations = (user as any).stage_durations || {};
      const clearedStageNum = Math.max(1, stageNum - 1);
      const completionIso = completedAt || new Date().toISOString();
      const currentDuration = Math.max(1, Number(durationSeconds) || 30);

      const updatedTimestamps = {
        ...existingTimestamps,
        [clearedStageNum]: completionIso,
      };
      const updatedDurations = {
        ...existingDurations,
        [clearedStageNum]: currentDuration,
      };

      const newTotalTimeSeconds = Object.values(updatedDurations).reduce(
        (acc: number, d: any) => acc + (Number(d) || 0),
        0
      );

      try {
        await supabaseAdmin
          .from('users')
          .update({
            total_score: (user.total_score || 0) + pointsToAward,
            current_stage: newStage,
            stage_timestamps: updatedTimestamps,
            stage_durations: updatedDurations,
            total_time_seconds: newTotalTimeSeconds,
            last_stage_completed_at: completionIso,
            updated_at: completionIso,
          })
          .eq('id', user.id);
      } catch (err: any) {
        console.warn('[verify-stage-password] Update user warning:', err.message);
      }

      // 4. Log completion in stage_telemetry
      try {
        await supabaseAdmin.from('stage_telemetry').upsert(
          {
            user_id: user.id,
            stage_number: stageNum - 1, // stage just finished
            completed_at: completedAt || new Date().toISOString(),
            completed_timestamp: completedTimestamp || Date.now(),
            duration_seconds: durationSeconds || 0,
            score_awarded: pointsToAward,
            ...(bypassed
              ? { flag_reason: 'stage_bypassed', flagged_too_fast: false }
              : {}),
          },
          { onConflict: 'user_id,stage_number', ignoreDuplicates: false }
        );
      } catch {}
    }

    return NextResponse.json({
      success: true,
      scoreAwarded: pointsToAward,
      nextStage: newStage,
      bypassed,
    });
  } catch (error: any) {
    console.error('[API /stage/verify-stage-password error]:', error);
    return NextResponse.json(
      { error: error.message || 'Password verification failed' },
      { status: 500 }
    );
  }
}
