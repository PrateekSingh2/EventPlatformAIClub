import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { loadFinalTeams, overlayUsersIfFinalTeamsLocked } from '@/lib/final-teams-db';
import { loadRound2Selection } from '@/lib/round2-db';
import { loadAllStageBypasses } from '@/lib/stage-bypass-db';
import {
  buildRound2TeamLiveRows,
  filterUsersToRound2Teams,
  pickRound2TopTeams,
} from '@/lib/round2-watcher';
import { sortLeaderboardUsers } from '@/lib/leaderboard-sort';
import type { StageTelemetry, User } from '@/lib/types';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
  if (!verifyAdminSecret(secret)) return unauthorized();

  const topOnly = req.nextUrl.searchParams.get('top5') === '1';
  const supabase = getSupabaseAdmin();

  const [finalTeams, selection, bypasses] = await Promise.all([
    loadFinalTeams(),
    loadRound2Selection(),
    loadAllStageBypasses(),
  ]);

  const { data: usersRaw, error: usersErr } = await supabase
    .from('users')
    .select(
      'id, name, email, role, team_name, team_size, total_score, current_stage, is_flagged, is_disqualified, is_completed, updated_at, stage_timestamps, stage_durations, total_time_seconds'
    )
    .eq('role', 'participant')
    .limit(2000);

  if (usersErr) {
    return NextResponse.json({ error: usersErr.message }, { status: 500 });
  }

  const participants = (await overlayUsersIfFinalTeamsLocked(usersRaw || [])) as User[];
  const round2Users = filterUsersToRound2Teams(
    participants,
    finalTeams,
    selection.selected_team_keys
  );
  const userIds = round2Users.map((u) => u.id);

  let telemetry: StageTelemetry[] = [];
  if (userIds.length > 0) {
    const { data: tel } = await supabase
      .from('stage_telemetry')
      .select('*')
      .in('user_id', userIds);
    telemetry = (tel || []) as StageTelemetry[];
  }

  const teamRows = buildRound2TeamLiveRows({
    finalTeams,
    selectedTeamKeys: selection.selected_team_keys,
    poolAssignments: selection.pool_assignments,
    participants: round2Users,
    telemetry,
    bypasses,
  });

  const top5 = pickRound2TopTeams(teamRows, 5);
  const leaderboard = sortLeaderboardUsers(round2Users as User[]);

  if (topOnly) {
    return NextResponse.json({ generatedAt: new Date().toISOString(), top5 });
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    selectedCount: selection.selected_team_keys.length,
    teamRows,
    top5,
    leaderboard,
    bypasses,
  });
}
