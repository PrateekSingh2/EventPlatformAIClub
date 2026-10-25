import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { sortLeaderboardUsers } from '@/lib/leaderboard-sort';
import { overlayUserRosterFromFinalTeams } from '@/lib/final-teams';
import { isFinalTeamsTableReady, loadFinalTeams, loadFinalTeamsConfig } from '@/lib/final-teams-db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
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

    let sortedUsers = sortLeaderboardUsers(users || []);

    if (await isFinalTeamsTableReady()) {
      const config = await loadFinalTeamsConfig();
      if (config.locked) {
        const teams = await loadFinalTeams();
        if (teams.length > 0) {
          sortedUsers = sortLeaderboardUsers(overlayUserRosterFromFinalTeams(sortedUsers, teams));
        }
      }
    }

    return NextResponse.json(
      {
        success: true,
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
