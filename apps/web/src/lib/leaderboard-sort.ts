/**
 * Leaderboard sorting and tie-breaking utilities
 *
 * Ranking criteria:
 * 1. Total Score DESC (Primary)
 * 2. Total Elapsed Time to reach current stage ASC (First tie-breaker)
 * 3. Stage-wise duration comparison ASC: Stage 1 time, then Stage 2 time, etc. (Second tie-breaker)
 * 4. Earliest completion / submission timestamp ASC (Third tie-breaker)
 */

export interface SortableLeaderboardUser {
  id?: string;
  name: string;
  email?: string;
  access_token?: string;
  team_name?: string | null;
  team_size?: string | null;
  total_score?: number;
  current_stage?: number;
  is_flagged?: boolean;
  is_disqualified?: boolean;
  is_completed?: boolean;
  contest_started_at?: string | null;
  stage_timestamps?: Record<string, string> | null;
  stage_durations?: Record<string, number> | null;
  total_time_seconds?: number | null;
  last_stage_completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds < 0) {
    return '--';
  }

  const s = Math.round(seconds);
  if (s < 60) {
    return `${s}s`;
  }

  const mins = Math.floor(s / 60);
  const remSec = s % 60;
  if (mins < 60) {
    return `${mins}m ${remSec.toString().padStart(2, '0')}s`;
  }

  const hours = Math.floor(mins / 60);
  const remMin = mins % 60;
  return `${hours}h ${remMin.toString().padStart(2, '0')}m ${remSec.toString().padStart(2, '0')}s`;
}

export function getUserTotalTime(u: SortableLeaderboardUser): number {
  if (typeof u.total_time_seconds === 'number' && u.total_time_seconds > 0) {
    return u.total_time_seconds;
  }
  if (u.last_stage_completed_at && u.contest_started_at) {
    const diff = (new Date(u.last_stage_completed_at).getTime() - new Date(u.contest_started_at).getTime()) / 1000;
    if (diff > 0) return Math.round(diff);
  }
  if (u.updated_at && u.created_at && (u.total_score || 0) > 0) {
    const diff = (new Date(u.updated_at).getTime() - new Date(u.created_at).getTime()) / 1000;
    if (diff > 0) return Math.round(diff);
  }
  return (u.total_score || 0) > 0 ? 9999999 : 0;
}

export function sortLeaderboardUsers<T extends SortableLeaderboardUser>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    // 1. Primary: Score (Descending)
    const scoreA = Number(a.total_score) || 0;
    const scoreB = Number(b.total_score) || 0;
    if (scoreB !== scoreA) {
      return scoreB - scoreA;
    }

    // 2. First Tie-Breaker: Minimum total time taken to reach the latest completed stage (Ascending)
    const timeA = getUserTotalTime(a);
    const timeB = getUserTotalTime(b);
    if (timeA !== timeB) {
      return timeA - timeB;
    }

    // 3. Second Tie-Breaker: Stage-wise duration comparison (Stage 1, then Stage 2, etc.)
    for (let s = 1; s <= 15; s++) {
      const stageKey = String(s);
      const durA = a.stage_durations?.[stageKey];
      const durB = b.stage_durations?.[stageKey];

      if (durA !== undefined && durB !== undefined && durA !== durB) {
        return Number(durA) - Number(durB);
      }
      if (durA !== undefined && durB === undefined) return -1;
      if (durA === undefined && durB !== undefined) return 1;
    }

    // 4. Final Tie-Breaker: Earliest updated_at / created_at (Ascending)
    const updA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const updB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return updA - updB;
  });
}

/**
 * Returns a human-readable reason why higherRankUser is ranked above lowerRankUser
 * when both have identical scores.
 */
export function getTieBreakReason(
  higherRankUser: SortableLeaderboardUser,
  lowerRankUser: SortableLeaderboardUser
): string | null {
  const scoreHigher = Number(higherRankUser.total_score) || 0;
  const scoreLower = Number(lowerRankUser.total_score) || 0;
  if (scoreHigher !== scoreLower || scoreHigher === 0) return null;

  const timeHigher = getUserTotalTime(higherRankUser);
  const timeLower = getUserTotalTime(lowerRankUser);

  if (timeHigher < timeLower) {
    const diff = timeLower - timeHigher;
    return `Faster overall time by ${formatDuration(diff)}`;
  }

  // Check stage-wise
  for (let s = 1; s <= 15; s++) {
    const key = String(s);
    const durHigher = higherRankUser.stage_durations?.[key];
    const durLower = lowerRankUser.stage_durations?.[key];
    if (durHigher !== undefined && durLower !== undefined && durHigher < durLower) {
      return `Faster on Stage ${s} (${formatDuration(durHigher)} vs ${formatDuration(durLower)})`;
    }
  }

  return 'Earlier stage submission timestamp';
}
