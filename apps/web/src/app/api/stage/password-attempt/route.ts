import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import {
  getPasswordAttemptState,
  registerPasswordFailure,
} from '@/lib/password-attempts';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber, action } = body;
    const stageNum = Number(stageNumber);

    if (!accessToken || !Number.isInteger(stageNum) || stageNum < 1 || !['status', 'failed'].includes(action)) {
      return NextResponse.json({ error: 'Invalid password attempt request' }, { status: 400 });
    }

    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid participant token' }, { status: 401 });
    }
    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    if (action === 'status') {
      const state = await getPasswordAttemptState(user, stageNum);
      if (state.cooldownSeconds > 0) {
        return NextResponse.json({
          ok: false,
          error: `Too many incorrect passwords. Try again in ${state.cooldownSeconds} seconds.`,
          ...state,
        }, { status: 429 });
      }
      return NextResponse.json({ ok: true, ...state });
    }

    const current = await getPasswordAttemptState(user, stageNum);
    if (current.cooldownSeconds > 0) {
      return NextResponse.json({
        ok: false,
        error: `Too many incorrect passwords. Try again in ${current.cooldownSeconds} seconds.`,
        ...current,
      }, { status: 429 });
    }

    const state = await registerPasswordFailure(user, stageNum);
    if (state.blocked) {
      return NextResponse.json({
        ok: false,
        error: `Too many incorrect passwords. Try again in ${state.cooldownSeconds} seconds.`,
        ...state,
      }, { status: 429 });
    }
    const message = state.cooldownSeconds > 0
      ? `Incorrect stage key. Try again in ${state.cooldownSeconds} seconds.`
      : state.excessive
        ? 'Incorrect stage key. Excessive password guesses have been recorded.'
        : `Incorrect stage key. ${Math.max(0, 3 - state.failedAttempts)} attempt(s) before a 15-second cooldown.`;
    return NextResponse.json({ ok: false, error: message, ...state }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Unable to check password attempt status' },
      { status: 500 }
    );
  }
}
