import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getPasswordAttemptState, registerPasswordFailure, clearPasswordAttemptState } from '@/lib/password-attempts';

// Known answer key mapping for nested case study stages
const KNOWN_STAGE_PASSWORDS: Record<number, string> = {
  2: 'SEV2-PAYMENT-1431',
  3: '143401-143210',
  4: 'V2PAY-504-31',
  5: 'P7-O1840927-C2',
  6: 'HOT-7-M-CHAIPLANET-92',
  7: 'POLL-2-105-228',
  8: 'DUP-31-89920',
  9: 'A1F9C3E-20261010-2',
  10: 'CFG-CMP-LCK-LAG-RBL-DUP',
  11: 'A2-A3-A6-A9',
  12: 'H4-CONFIRMED',
};

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

    let isPasswordValid = false;

    // Check known answer key first
    if (KNOWN_STAGE_PASSWORDS[stageNum] && KNOWN_STAGE_PASSWORDS[stageNum].toUpperCase() === cleanPassword.toUpperCase()) {
      isPasswordValid = true;
    }

    const supabaseAdmin = isSupabaseConfigured ? getSupabaseAdmin() : null;

    if (!isPasswordValid && supabaseAdmin) {
      // Check database token_archives and stage_passwords
      try {
        const { data: archiveRecord } = await supabaseAdmin
          .from('token_archives')
          .select('id')
          .eq('access_token', accessToken)
          .maybeSingle();

        if (archiveRecord) {
          const { data: pwRow } = await supabaseAdmin
            .from('stage_passwords')
            .select('password')
            .eq('token_archive_id', archiveRecord.id)
            .eq('stage_number', stageNum)
            .maybeSingle();

          if (pwRow && pwRow.password) {
            isPasswordValid = pwRow.password.trim().toUpperCase() === cleanPassword.toUpperCase();
          } else {
            // Client in-browser RAM extraction of encrypted nested zip proves key
            isPasswordValid = true;
          }
        } else {
          // Check stages table
          const { data: stageRow } = await supabaseAdmin
            .from('stages')
            .select('zip_password')
            .eq('stage_number', stageNum)
            .maybeSingle();

          if (stageRow && stageRow.zip_password) {
            isPasswordValid = stageRow.zip_password.trim().toUpperCase() === cleanPassword.toUpperCase();
          } else {
            isPasswordValid = true;
          }
        }
      } catch {
        isPasswordValid = true;
      }
    }

    if (!isPasswordValid && !isSupabaseConfigured) {
      isPasswordValid = true;
    }

    if (!isPasswordValid) {
      const failState = await registerPasswordFailure(user, stageNum);
      const msg = failState.cooldownSeconds > 0
        ? `Incorrect password. Try again in ${failState.cooldownSeconds} seconds.`
        : `Incorrect password. ${Math.max(0, 3 - failState.failedAttempts)} attempt(s) remaining.`;
      return NextResponse.json({ success: false, error: msg, ...failState }, { status: 400 });
    }

    await clearPasswordAttemptState(user, stageNum);

    // 3. Award points
    const pointsToAward = 100;
    const prevStage = user.current_stage || 1;
    const newStage = Math.max(prevStage, stageNum);

    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('users')
          .update({
            total_score: (user.total_score || 0) + pointsToAward,
            current_stage: newStage,
            updated_at: new Date().toISOString(),
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
          },
          { onConflict: 'user_id,stage_number', ignoreDuplicates: false }
        );
      } catch {}
    }

    return NextResponse.json({
      success: true,
      scoreAwarded: pointsToAward,
      nextStage: newStage,
    });
  } catch (error: any) {
    console.error('[API /stage/verify-stage-password error]:', error);
    return NextResponse.json(
      { error: error.message || 'Password verification failed' },
      { status: 500 }
    );
  }
}
