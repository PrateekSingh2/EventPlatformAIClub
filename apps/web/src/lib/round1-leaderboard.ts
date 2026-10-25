import type { Round1LeaderboardEntry, Round1RubricEvaluation } from '@/lib/types';

export function buildLeaderboard(evaluations: Round1RubricEvaluation[]): Round1LeaderboardEntry[] {
  const teamMap = new Map<string, Round1RubricEvaluation[]>();
  for (const ev of evaluations) {
    const teamKey = ev.team_name.trim().toLowerCase();
    const existing = teamMap.get(teamKey) || [];
    existing.push(ev);
    teamMap.set(teamKey, existing);
  }

  const entries: Round1LeaderboardEntry[] = [];
  for (const [, evList] of teamMap.entries()) {
    evList.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = evList[0];
    const bestScore = Math.max(...evList.map((e) => Number(e.total_score) || 0));
    const representative = evList.find((e) => Number(e.total_score) === bestScore) || latest;

    entries.push({
      rank: 0,
      team_name: representative.team_name,
      theme: representative.theme,
      total_score: bestScore,
      judge_name: representative.judge_name,
      evaluations_count: evList.length,
      latest_evaluated_at: latest.created_at,
      evaluations: evList,
    });
  }

  entries.sort((a, b) => {
    if (b.total_score !== a.total_score) {
      return b.total_score - a.total_score;
    }
    return new Date(a.latest_evaluated_at).getTime() - new Date(b.latest_evaluated_at).getTime();
  });

  entries.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  return entries;
}

export type Round1JudgeNormalizationMeta = {
  judge_name: string;
  team_count: number;
  min_raw: number;
  max_raw: number;
};

/** Min–max scale to 0–100 within each judge's scored teams (separate cohort per judge). */
export function normalizeRawScoreForJudge(raw: number, minRaw: number, maxRaw: number): number {
  if (maxRaw <= minRaw) return 100;
  const scaled = ((raw - minRaw) / (maxRaw - minRaw)) * 100;
  return Number(Math.min(100, Math.max(0, scaled)).toFixed(1));
}

function judgeScoreStats(
  evaluations: Round1RubricEvaluation[]
): Map<string, { min: number; max: number; count: number }> {
  const byJudge = new Map<string, number[]>();
  for (const ev of evaluations) {
    const judge = ev.judge_name.trim();
    if (!judge) continue;
    const list = byJudge.get(judge) || [];
    list.push(Number(ev.total_score) || 0);
    byJudge.set(judge, list);
  }

  const stats = new Map<string, { min: number; max: number; count: number }>();
  for (const [judge, scores] of byJudge.entries()) {
    stats.set(judge, {
      min: Math.min(...scores),
      max: Math.max(...scores),
      count: scores.length,
    });
  }
  return stats;
}

export function buildJudgeNormalizedLeaderboard(evaluations: Round1RubricEvaluation[]): {
  leaderboard: Round1LeaderboardEntry[];
  judgeMeta: Round1JudgeNormalizationMeta[];
} {
  const stats = judgeScoreStats(evaluations);
  const rawBoard = buildLeaderboard(evaluations);

  const normalizedEntries = rawBoard.map((entry) => {
    const judge = entry.judge_name.trim();
    const stat = stats.get(judge);
    const raw = entry.total_score;
    const normalized_score =
      stat != null ? normalizeRawScoreForJudge(raw, stat.min, stat.max) : raw;

    return {
      ...entry,
      raw_total_score: raw,
      normalized_score,
    };
  });

  normalizedEntries.sort((a, b) => {
    const na = a.normalized_score ?? 0;
    const nb = b.normalized_score ?? 0;
    if (nb !== na) return nb - na;
    return new Date(a.latest_evaluated_at).getTime() - new Date(b.latest_evaluated_at).getTime();
  });

  normalizedEntries.forEach((entry, idx) => {
    entry.rank = idx + 1;
  });

  const judgeMeta: Round1JudgeNormalizationMeta[] = [...stats.entries()]
    .map(([judge_name, s]) => ({
      judge_name,
      team_count: s.count,
      min_raw: s.min,
      max_raw: s.max,
    }))
    .sort((a, b) => a.judge_name.localeCompare(b.judge_name));

  return { leaderboard: normalizedEntries, judgeMeta };
}
