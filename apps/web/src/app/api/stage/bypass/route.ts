import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { recordStageBypass } from '@/lib/stage-bypass-db';
import { resolveStagePasswordForUser } from '@/lib/stage-password';
import { isUsableStagePassword } from '@/lib/stage-password-utils';

const WARNINGS: Record<number, { step: number; message: string; final?: boolean }> = {
  1: {
    step: 1,
    message: 'Are you sure you want to skip this stage?',
  },
  2: {
    step: 2,
    message: "You won't get any points for this stage!",
  },
  3: {
    step: 3,
    message: 'Please confirm once again.',
    final: true,
  },
};

/**
 * POST /api/stage/bypass
 * Body: { accessToken, stageNumber, step: 1|2|3 }
 * Step 3 records bypass and returns the stage password.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber, step } = body;
    const stageNum = Number(stageNumber);
    const stepNum = Number(step);

    if (!accessToken || !Number.isInteger(stageNum) || stageNum < 1) {
      return NextResponse.json({ error: 'accessToken and stageNumber required' }, { status: 400 });
    }
    if (![1, 2, 3].includes(stepNum)) {
      return NextResponse.json({ error: 'step must be 1, 2, or 3' }, { status: 400 });
    }

    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }
    if (user.is_completed) {
      return NextResponse.json({ error: 'Contest already completed' }, { status: 403 });
    }

    const warn = WARNINGS[stepNum];
    if (stepNum < 3) {
      return NextResponse.json({
        ok: true,
        step: stepNum,
        nextStep: stepNum + 1,
        message: warn.message,
      });
    }

    await recordStageBypass({
      user_id: user.id,
      stage_number: stageNum,
      team_name: user.team_name,
    });

    const supabaseAdmin = isSupabaseConfigured ? getSupabaseAdmin() : null;
    const password = await resolveStagePasswordForUser(supabaseAdmin, accessToken, user, stageNum);

    if (!isUsableStagePassword(password)) {
      return NextResponse.json(
        {
          error:
            'Stage password could not be resolved for your team archive. Ask an organizer to verify pool assignment and passwords.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      ok: true,
      step: 3,
      message: warn.message,
      bypassed: true,
      stageNumber: stageNum,
      password,
      pointsNotice: 'No points will be awarded when you unlock this stage after bypass.',
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Bypass failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
