import type { Round1LeaderboardEntry, Round1RubricEvaluation } from '@/lib/types';

export const ROUND1_CRITERION_SPECS = [
  { key: 'score_prompt_clarity' as const, label: 'Prompt Clarity', maxMarks: 20 },
  { key: 'score_functional_impl' as const, label: 'Functional Impl', maxMarks: 25 },
  { key: 'score_ui_ux' as const, label: 'UI/UX', maxMarks: 15 },
  { key: 'score_problem_solving' as const, label: 'Problem Solving', maxMarks: 15 },
  { key: 'score_prompt_iteration' as const, label: 'Prompt Iteration', maxMarks: 10 },
  { key: 'score_creativity' as const, label: 'Creativity', maxMarks: 5 },
  { key: 'score_live_demo' as const, label: 'Live Demo', maxMarks: 10 },
];

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

/** @deprecated Use criterion-level stats; kept for type compatibility in API responses. */
export type Round1JudgeNormalizationMeta = {
  judge_name: string;
  team_count: number;
  min_raw: number;
  max_raw: number;
};

export type Round1CriterionNormalizationMeta = {
  judge_name: string;
  criterion_key: string;
  criterion_label: string;
  max_marks: number;
  min_raw: number;
  max_raw: number;
  team_count: number;
};

/** Scale one criterion to 0…maxMarks using min–max within that judge's cohort for that criterion. */
export function normalizeCriterionScore(
  raw: number,
  minRaw: number,
  maxRaw: number,
  maxMarks: number
): number {
  if (maxRaw <= minRaw) return maxMarks;
  const scaled = ((raw - minRaw) / (maxRaw - minRaw)) * maxMarks;
  return Number(Math.min(maxMarks, Math.max(0, scaled)).toFixed(2));
}

type CriterionStats = { min: number; max: number; count: number };

function criterionScoreStatsByJudge(
  evaluations: Round1RubricEvaluation[]
): Map<string, Map<string, CriterionStats>> {
  const byJudge = new Map<string, Map<string, number[]>>();

  for (const ev of evaluations) {
    const judge = ev.judge_name.trim();
    if (!judge) continue;
    let perCriterion = byJudge.get(judge);
    if (!perCriterion) {
      perCriterion = new Map();
      byJudge.set(judge, perCriterion);
    }
    for (const spec of ROUND1_CRITERION_SPECS) {
      const list = perCriterion.get(spec.key) || [];
      list.push(Number(ev[spec.key]) || 0);
      perCriterion.set(spec.key, list);
    }
  }

  const stats = new Map<string, Map<string, CriterionStats>>();
  for (const [judge, perCriterion] of byJudge.entries()) {
    const judgeStats = new Map<string, CriterionStats>();
    for (const [key, scores] of perCriterion.entries()) {
      judgeStats.set(key, {
        min: Math.min(...scores),
        max: Math.max(...scores),
        count: scores.length,
      });
    }
    stats.set(judge, judgeStats);
  }
  return stats;
}

/** Sum of per-criterion normalized marks (max 100) for one evaluation. */
export function criteriaNormalizedTotalForEvaluation(
  ev: Round1RubricEvaluation,
  stats: Map<string, Map<string, CriterionStats>>
): number {
  const judge = ev.judge_name.trim();
  const judgeStats = stats.get(judge);
  let sum = 0;
  for (const spec of ROUND1_CRITERION_SPECS) {
    const raw = Number(ev[spec.key]) || 0;
    const cStat = judgeStats?.get(spec.key);
    if (cStat) {
      sum += normalizeCriterionScore(raw, cStat.min, cStat.max, spec.maxMarks);
    } else {
      sum += raw;
    }
  }
  return Number(sum.toFixed(1));
}

function buildCriterionNormalizationMeta(
  stats: Map<string, Map<string, CriterionStats>>
): Round1CriterionNormalizationMeta[] {
  const meta: Round1CriterionNormalizationMeta[] = [];
  for (const [judge_name, perCriterion] of stats.entries()) {
    for (const spec of ROUND1_CRITERION_SPECS) {
      const s = perCriterion.get(spec.key);
      if (!s) continue;
      meta.push({
        judge_name,
        criterion_key: spec.key,
        criterion_label: spec.label,
        max_marks: spec.maxMarks,
        min_raw: s.min,
        max_raw: s.max,
        team_count: s.count,
      });
    }
  }
  return meta.sort(
    (a, b) =>
      a.judge_name.localeCompare(b.judge_name) ||
      a.criterion_label.localeCompare(b.criterion_label)
  );
}

/** Legacy total-only min–max (not used for standings anymore). */
export function normalizeRawScoreForJudge(raw: number, minRaw: number, maxRaw: number): number {
  if (maxRaw <= minRaw) return 100;
  const scaled = ((raw - minRaw) / (maxRaw - minRaw)) * 100;
  return Number(Math.min(100, Math.max(0, scaled)).toFixed(1));
}

/**
 * Fair standings when a judge scores low (or high) on every rubric line:
 * each criterion is min–max scaled to its rubric max within that judge's teams, then summed.
 */
export function buildCriteriaNormalizedLeaderboard(evaluations: Round1RubricEvaluation[]): {
  leaderboard: Round1LeaderboardEntry[];
  criterionMeta: Round1CriterionNormalizationMeta[];
  judgeMeta: Round1JudgeNormalizationMeta[];
} {
  const stats = criterionScoreStatsByJudge(evaluations);
  const rawBoard = buildLeaderboard(evaluations);

  const normalizedEntries = rawBoard.map((entry) => {
    let bestNorm = -1;
    let bestRaw = entry.total_score;
    let judge = entry.judge_name;

    for (const ev of entry.evaluations) {
      const norm = criteriaNormalizedTotalForEvaluation(ev, stats);
      if (norm > bestNorm) {
        bestNorm = norm;
        bestRaw = Number(ev.total_score) || 0;
        judge = ev.judge_name;
      }
    }

    const normalized_score = bestNorm >= 0 ? bestNorm : entry.total_score;

    return {
      ...entry,
      judge_name: judge,
      raw_total_score: bestRaw,
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

  const criterionMeta = buildCriterionNormalizationMeta(stats);

  const judgeMeta: Round1JudgeNormalizationMeta[] = [...stats.entries()].map(([judge_name, per]) => {
    const counts = [...per.values()].map((s) => s.count);
    const team_count = counts.length ? Math.max(...counts) : 0;
    const mins = [...per.values()].map((s) => s.min);
    const maxs = [...per.values()].map((s) => s.max);
    return {
      judge_name,
      team_count,
      min_raw: mins.length ? Math.min(...mins) : 0,
      max_raw: maxs.length ? Math.max(...maxs) : 0,
    };
  });

  return { leaderboard: normalizedEntries, criterionMeta, judgeMeta };
}

/** @deprecated Name retained for callers — uses criteria-wise normalization, not total-only. */
export function buildJudgeNormalizedLeaderboard(evaluations: Round1RubricEvaluation[]): {
  leaderboard: Round1LeaderboardEntry[];
  judgeMeta: Round1JudgeNormalizationMeta[];
  criterionMeta: Round1CriterionNormalizationMeta[];
} {
  const { leaderboard, judgeMeta, criterionMeta } = buildCriteriaNormalizedLeaderboard(evaluations);
  return { leaderboard, judgeMeta, criterionMeta };
}
