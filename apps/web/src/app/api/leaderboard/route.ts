import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sortLeaderboardUsers } from '@/lib/leaderboard-sort';
import { loadFinalTeams, overlayUsersIfFinalTeamsLocked } from '@/lib/final-teams-db';
import { loadRound2Selection } from '@/lib/round2-db';
import { filterUsersToRound2Teams } from '@/lib/round2-watcher';
import { draftRosterToFinalTeams } from '@/lib/round2-draft';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const scope = req.nextUrl.searchParams.get('scope');
    const supabaseAdmin = getSupabaseAdmin();

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, team_name, team_size, total_score, current_stage, is_flagged, is_disqualified, is_completed, created_at, updated_at, contest_started_at, stage_timestamps, stage_durations, total_time_seconds, last_stage_completed_at')
      .eq('role', 'participant')
      .limit(1000);

    if (error) {
      console.warn('[GET /api/leaderboard error]:', error.message);
      return NextResponse.json({ success: false, users: [] }, { status: 500 });
    }

    const baseUsers = users ?? [];
    const rosterAligned = await overlayUsersIfFinalTeamsLocked(baseUsers);
    let sortedUsers = sortLeaderboardUsers(rosterAligned as typeof baseUsers);

    if (scope === 'round2') {
      const [finalTeams, selection] = await Promise.all([loadFinalTeams(), loadRound2Selection()]);
      const rosterTeams =
        selection.draft_roster?.teams?.length
          ? draftRosterToFinalTeams(selection.draft_roster, true)
          : finalTeams;
      sortedUsers = sortLeaderboardUsers(
        filterUsersToRound2Teams(sortedUsers as typeof baseUsers, rosterTeams, selection.selected_team_keys)
      );
    }

    return NextResponse.json(
      {
        success: true,
        scope: scope === 'round2' ? 'round2' : 'all',
        users: sortedUsers,
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=45',
        },
      }
    );
  } catch (err: any) {
    console.error('[API GET /api/leaderboard exception]:', err);
    return NextResponse.json({ success: false, users: [] }, { status: 500 });
  }
}
