import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { getContestSettings } from '@/lib/contest';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, finalPhrase, completedAt } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    // 1. Authenticate user
    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid access token' }, { status: 401 });
    }

    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // 2. If already completed, return idempotent success
    if (user.is_completed) {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        isCompleted: true,
        totalScore: user.total_score,
        completedAt: user.completed_at,
        message: 'Contest was already completed and your stats are permanently locked.',
      });
    }

    // 3. Enforce contest lifecycle
    const contest = await getContestSettings();
    if (contest.status === 'DRAFT') {
      return NextResponse.json({ error: 'Contest is currently in DRAFT mode.' }, { status: 403 });
    }
    if (contest.status === 'FROZEN') {
      return NextResponse.json({ error: 'Contest is currently FROZEN.' }, { status: 403 });
    }
    if (contest.status === 'CONCLUDED') {
      return NextResponse.json({ error: 'Contest has concluded.' }, { status: 403 });
    }

    // 4. Validate final recovery phrase
    const cleanPhrase = (finalPhrase || '').trim().toUpperCase();
    const validPhrases = new Set([
      'LEDGER-RESTORED-02',
      'LEDGER-RESTORED',
      'H4-CONFIRMED',
      'RESTORED',
      'COMPLETE',
    ]);

    // If finalPhrase provided, check against valid set
    if (cleanPhrase && !validPhrases.has(cleanPhrase)) {
      // In case organizers used a slight variation
      if (!cleanPhrase.includes('LEDGER') && !cleanPhrase.includes('RESTORED') && !cleanPhrase.includes('02')) {
        return NextResponse.json(
          { error: 'Invalid Final Recovery Phrase. Check the final stage documentation.' },
          { status: 400 }
        );
      }
    }

    const finalCompletionTime = completedAt && !isNaN(new Date(completedAt).getTime())
      ? new Date(completedAt).toISOString()
      : new Date().toISOString();

    const bonusPoints = 200; // Bonus score for concluding the entire case study
    const newTotalScore = (user.total_score || 0) + bonusPoints;

    if (isSupabaseConfigured) {
      const supabaseAdmin = getSupabaseAdmin();

      // 5. Update user: lock stats permanently
      try {
        await supabaseAdmin
          .from('users')
          .update({
            is_completed: true,
            completed_at: finalCompletionTime,
            total_score: newTotalScore,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      } catch (err: any) {
        console.warn('[complete-contest] Error updating user:', err.message);
      }

      // 6. Record final telemetry entry
      try {
        await supabaseAdmin.from('stage_telemetry').upsert(
          {
            user_id: user.id,
            stage_number: user.current_stage || 12,
            completed_at: finalCompletionTime,
            score_awarded: bonusPoints,
          },
          { onConflict: 'user_id,stage_number', ignoreDuplicates: false }
        );
      } catch {}
    }

    return NextResponse.json({
      success: true,
      isCompleted: true,
      totalScore: newTotalScore,
      completedAt: finalCompletionTime,
      message: 'Investigation completed successfully. Stats are locked.',
    });
  } catch (error: any) {
    console.error('[API /api/stage/complete-contest error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to complete contest' },
      { status: 500 }
    );
  }
}
