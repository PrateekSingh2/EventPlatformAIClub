'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { Round1RubricEvaluation, Round1LeaderboardEntry } from '@/lib/types';
import {
  buildJudgeNormalizedLeaderboard,
  type Round1CriterionNormalizationMeta,
} from '@/lib/round1-leaderboard';
import {
  Trophy,
  Award,
  Plus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  FileSpreadsheet,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  Eye,
  Trash2,
  Minus,
  Sparkles,
  FileCheck2,
  MessageSquare,
  HelpCircle,
  Sliders,
} from 'lucide-react';

interface Round1RubricTabProps {
  adminSecret: string;
}

interface CriterionConfig {
  key: keyof Pick<
    Round1RubricEvaluation,
    | 'score_prompt_clarity'
    | 'score_functional_impl'
    | 'score_ui_ux'
    | 'score_problem_solving'
    | 'score_prompt_iteration'
    | 'score_creativity'
    | 'score_live_demo'
  >;
  commentKey: keyof Pick<
    Round1RubricEvaluation,
    | 'comments_prompt_clarity'
    | 'comments_functional_impl'
    | 'comments_ui_ux'
    | 'comments_problem_solving'
    | 'comments_prompt_iteration'
    | 'comments_creativity'
    | 'comments_live_demo'
  >;
  number: number;
  title: string;
  maxMarks: number;
  description: string;
  quickScores: number[];
}

const RUBRIC_CRITERIA: CriterionConfig[] = [
  {
    number: 1,
    key: 'score_prompt_clarity',
    commentKey: 'comments_prompt_clarity',
    title: 'Prompt Clarity & Constraints',
    maxMarks: 20,
    description: 'Precision, constraints adherence, and structured prompt engineering.',
    quickScores: [0, 5, 10, 15, 20],
  },
  {
    number: 2,
    key: 'score_functional_impl',
    commentKey: 'comments_functional_impl',
    title: 'Functional Implementation',
    maxMarks: 25,
    description: 'Working features, architecture soundness, correctness, and stability.',
    quickScores: [0, 10, 15, 20, 25],
  },
  {
    number: 3,
    key: 'score_ui_ux',
    commentKey: 'comments_ui_ux',
    title: 'UI/UX & Visual Quality',
    maxMarks: 15,
    description: 'Design polish, responsive layout, intuitive navigation, and clean styling.',
    quickScores: [0, 5, 10, 12, 15],
  },
  {
    number: 4,
    key: 'score_problem_solving',
    commentKey: 'comments_problem_solving',
    title: 'Problem-Solving & Business Logic',
    maxMarks: 15,
    description: 'Novel approach, domain understanding, and effective edge-case handling.',
    quickScores: [0, 5, 10, 12, 15],
  },
  {
    number: 5,
    key: 'score_prompt_iteration',
    commentKey: 'comments_prompt_iteration',
    title: 'Prompt Iteration (Before vs. After)',
    maxMarks: 10,
    description: 'Evolution of instructions, prompt tuning depth, and comparative refinements.',
    quickScores: [0, 3, 5, 8, 10],
  },
  {
    number: 6,
    key: 'score_creativity',
    commentKey: 'comments_creativity',
    title: 'Creativity & Useful Extras',
    maxMarks: 5,
    description: 'Originality, innovative features, and pleasant surprises beyond basic brief.',
    quickScores: [0, 1, 2, 3, 5],
  },
  {
    number: 7,
    key: 'score_live_demo',
    commentKey: 'comments_live_demo',
    title: 'Live Demo & Explanation',
    maxMarks: 10,
    description: 'Articulated reasoning, team explanation, and smooth execution in demonstration.',
    quickScores: [0, 3, 5, 8, 10],
  },
];

const SQL_MIGRATION_SNIPPET = `-- Execute in Supabase SQL Editor:
CREATE TABLE IF NOT EXISTS round1 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    theme TEXT NOT NULL,
    score_prompt_clarity NUMERIC NOT NULL DEFAULT 0,
    score_functional_impl NUMERIC NOT NULL DEFAULT 0,
    score_ui_ux NUMERIC NOT NULL DEFAULT 0,
    score_problem_solving NUMERIC NOT NULL DEFAULT 0,
    score_prompt_iteration NUMERIC NOT NULL DEFAULT 0,
    score_creativity NUMERIC NOT NULL DEFAULT 0,
    score_live_demo NUMERIC NOT NULL DEFAULT 0,
    total_score NUMERIC NOT NULL DEFAULT 0,
    comments_prompt_clarity TEXT DEFAULT '',
    comments_functional_impl TEXT DEFAULT '',
    comments_ui_ux TEXT DEFAULT '',
    comments_problem_solving TEXT DEFAULT '',
    comments_prompt_iteration TEXT DEFAULT '',
    comments_creativity TEXT DEFAULT '',
    comments_live_demo TEXT DEFAULT '',
    judge_notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE round1 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow select round1" ON round1 FOR SELECT USING (true);
CREATE POLICY "Service role full access round1" ON round1 FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
CREATE POLICY "Allow insert round1" ON round1 FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow update round1" ON round1 FOR UPDATE USING (true);
CREATE POLICY "Allow delete round1" ON round1 FOR DELETE USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE round1;
NOTIFY pgrst, 'reload schema';`;

export function Round1RubricTab({ adminSecret }: Round1RubricTabProps) {
  // Leaderboard visibility toggle (strictly only shown when user clicks "Get Leaderboard")
  const [hasRequestedLeaderboard, setHasRequestedLeaderboard] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [leaderboard, setLeaderboard] = useState<Round1LeaderboardEntry[]>([]);
  const [evaluations, setEvaluations] = useState<Round1RubricEvaluation[]>([]);
  const [stats, setStats] = useState({
    totalEvaluations: 0,
    uniqueTeamsCount: 0,
    averageScore: 0,
    topScore: 0,
  });
  const [tableExists, setTableExists] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // DOM overflow protection: show 10 teams initially
  const [visibleCount, setVisibleCount] = useState<number>(10);
  const [visibleCountNormalized, setVisibleCountNormalized] = useState<number>(10);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Modal form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Detail breakdown modal
  const [selectedTeamBreakdown, setSelectedTeamBreakdown] = useState<Round1LeaderboardEntry | null>(null);

  // Copied SQL state
  const [copiedSql, setCopiedSql] = useState(false);

  // Form Fields
  const [teamName, setTeamName] = useState('');
  const [finalTeamNames, setFinalTeamNames] = useState<string[]>([]);
  const [teamAliasToCanonical, setTeamAliasToCanonical] = useState<Record<string, string>>({});
  const [judgeName, setJudgeName] = useState('');
  const [theme, setTheme] = useState('');

  const [scores, setScores] = useState<Record<string, string>>({
    score_prompt_clarity: '',
    score_functional_impl: '',
    score_ui_ux: '',
    score_problem_solving: '',
    score_prompt_iteration: '',
    score_creativity: '',
    score_live_demo: '',
  });

  useEffect(() => {
    if (!adminSecret) return;
    fetch('/api/admin/final-teams?namesOnly=1', {
      headers: { 'x-admin-secret': adminSecret },
    })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.teamNames) && d.teamNames.length > 0) {
          setFinalTeamNames(d.teamNames);
        }
        if (d.aliasToCanonical && typeof d.aliasToCanonical === 'object') {
          setTeamAliasToCanonical(d.aliasToCanonical as Record<string, string>);
        }
      })
      .catch(() => {});
  }, [adminSecret]);

  const canonicalTeamName = useCallback(
    (name: string) => {
      const key = name.trim().toLowerCase();
      return teamAliasToCanonical[key] ?? name.trim();
    },
    [teamAliasToCanonical]
  );

  const evaluatedTeamKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const ev of evaluations) {
      const canon = canonicalTeamName(ev.team_name || '').toLowerCase();
      if (canon) keys.add(canon);
    }
    return keys;
  }, [evaluations, canonicalTeamName]);

  const teamsAvailableForEvaluation = useMemo(() => {
    return finalTeamNames.filter(
      (name) => !evaluatedTeamKeys.has(canonicalTeamName(name).toLowerCase())
    );
  }, [finalTeamNames, evaluatedTeamKeys, canonicalTeamName]);

  const mergedTeamNameSet = useMemo(
    () => new Set(finalTeamNames.map((n) => n.trim().toLowerCase())),
    [finalTeamNames]
  );

  const teamNameDiscrepancies = useMemo(() => {
    if (finalTeamNames.length === 0 || Object.keys(teamAliasToCanonical).length === 0) {
      return [];
    }
    const seen = new Set<string>();
    const rows: {
      id: string;
      storedTeamName: string;
      canonicalTeamName: string;
      judgeName: string;
      totalScore: number;
      reason: 'alias' | 'not_on_roster';
    }[] = [];

    for (const ev of evaluations) {
      const stored = (ev.team_name || '').trim();
      if (!stored) continue;
      const canon = canonicalTeamName(stored);
      const storedKey = stored.toLowerCase();
      const canonKey = canon.toLowerCase();
      if (seen.has(ev.id)) continue;

      if (storedKey !== canonKey) {
        seen.add(ev.id);
        rows.push({
          id: ev.id,
          storedTeamName: stored,
          canonicalTeamName: canon,
          judgeName: ev.judge_name || '',
          totalScore: Number(ev.total_score) || 0,
          reason: 'alias',
        });
        continue;
      }

      if (!mergedTeamNameSet.has(canonKey)) {
        seen.add(ev.id);
        rows.push({
          id: ev.id,
          storedTeamName: stored,
          canonicalTeamName: canon,
          judgeName: ev.judge_name || '',
          totalScore: Number(ev.total_score) || 0,
          reason: 'not_on_roster',
        });
      }
    }

    return rows.sort((a, b) =>
      a.canonicalTeamName.localeCompare(b.canonicalTeamName, undefined, { sensitivity: 'base' })
    );
  }, [evaluations, finalTeamNames, teamAliasToCanonical, canonicalTeamName, mergedTeamNameSet]);

  useEffect(() => {
    if (!teamName.trim()) return;
    if (evaluatedTeamKeys.has(teamName.trim().toLowerCase())) {
      setTeamName('');
    }
  }, [evaluatedTeamKeys, teamName]);

  const [comments, setComments] = useState<Record<string, string>>({
    comments_prompt_clarity: '',
    comments_functional_impl: '',
    comments_ui_ux: '',
    comments_problem_solving: '',
    comments_prompt_iteration: '',
    comments_creativity: '',
    comments_live_demo: '',
  });

  const [judgeNotes, setJudgeNotes] = useState('');

  // Automatic calculation of total score in real-time
  const calculatedTotal = useMemo(() => {
    let sum = 0;
    for (const c of RUBRIC_CRITERIA) {
      const val = parseFloat(scores[c.key] || '0');
      if (!isNaN(val) && val >= 0) {
        sum += val;
      }
    }
    return Math.round(sum * 100) / 100;
  }, [scores]);

  // Performance tier badge
  const scoreTier = useMemo(() => {
    if (calculatedTotal >= 90) return { label: 'Outstanding (A+)', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' };
    if (calculatedTotal >= 75) return { label: 'Strong (A)', color: 'text-teal-400 bg-teal-500/10 border-teal-500/30' };
    if (calculatedTotal >= 60) return { label: 'Proficient (B)', color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
    if (calculatedTotal > 0) return { label: 'Needs Improvement', color: 'text-zinc-400 bg-zinc-500/10 border-zinc-500/30' };
    return { label: 'Unscored', color: 'text-zinc-500 bg-zinc-800/40 border-zinc-700/40' };
  }, [calculatedTotal]);

  // Adjust score helper for mobile touch
  const handleScoreStep = (key: string, delta: number, max: number) => {
    const current = parseFloat(scores[key] || '0');
    const safeCurrent = isNaN(current) ? 0 : current;
    const next = Math.max(0, Math.min(max, safeCurrent + delta));
    setScores((prev) => ({ ...prev, [key]: next.toString() }));
  };

  const handleQuickScoreSelect = (key: string, val: number) => {
    setScores((prev) => ({ ...prev, [key]: val.toString() }));
  };

  // Fetch Leaderboard and Evaluations
  const isFetchingRef = useRef(false);
  const pendingSilentRefreshRef = useRef(false);
  const fetchLeaderboard = useCallback(
    async (isSilent = false) => {
      if (isFetchingRef.current) {
        if (isSilent) pendingSilentRefreshRef.current = true;
        return;
      }
      isFetchingRef.current = true;

      if (!isSilent) setLeaderboardLoading(true);
      else setRefreshing(true);

      try {
        setError(null);
        const res = await fetch(`/api/admin/round1?t=${Date.now()}`, {
          headers: { 'x-admin-secret': adminSecret },
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to fetch Round 1 data');

        setLeaderboard(data.leaderboard || []);
        setEvaluations(data.evaluations || []);
        setStats(
          data.stats || {
            totalEvaluations: 0,
            uniqueTeamsCount: 0,
            averageScore: 0,
            topScore: 0,
          }
        );
        setTableExists(data.tableExists !== false);
        setLastUpdated(new Date().toLocaleTimeString());
      } catch (err: any) {
        console.error('[Round1] Load error', err);
        setError(err instanceof Error ? err.message : 'Could not fetch Round 1 data.');
      } finally {
        isFetchingRef.current = false;
        setLeaderboardLoading(false);
        setRefreshing(false);
        if (pendingSilentRefreshRef.current) {
          pendingSilentRefreshRef.current = false;
          void fetchLeaderboard(true);
        }
      }
    },
    [adminSecret]
  );

  useEffect(() => {
    if (!adminSecret) return;
    void fetchLeaderboard(true);
  }, [adminSecret, fetchLeaderboard]);

  // Triggered when user clicks "Get Leaderboard"
  const handleGetLeaderboard = () => {
    setHasRequestedLeaderboard(true);
    fetchLeaderboard(false);
  };

  // Realtime subscription + auto-sync hot reload (only when leaderboard is active)
  useEffect(() => {
    if (!hasRequestedLeaderboard) return;

    let channel: any = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('admin-round1-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'round1' }, () => {
          fetchLeaderboard(true);
        })
        .subscribe();
    }

    const interval = window.setInterval(() => {
      fetchLeaderboard(true);
    }, 4000);

    return () => {
      window.clearInterval(interval);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [hasRequestedLeaderboard, fetchLeaderboard]);

  // Reset form
  const resetForm = () => {
    setTeamName('');
    setJudgeName('');
    setTheme('');
    setScores({
      score_prompt_clarity: '',
      score_functional_impl: '',
      score_ui_ux: '',
      score_problem_solving: '',
      score_prompt_iteration: '',
      score_creativity: '',
      score_live_demo: '',
    });
    setComments({
      comments_prompt_clarity: '',
      comments_functional_impl: '',
      comments_ui_ux: '',
      comments_problem_solving: '',
      comments_prompt_iteration: '',
      comments_creativity: '',
      comments_live_demo: '',
    });
    setJudgeNotes('');
    setFormError(null);
    setFormSuccess(null);
  };

  const handleOpenForm = () => {
    resetForm();
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    if (submitting) return;
    setIsFormOpen(false);
  };

  // Form submission handler
  const handleSubmitEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!teamName.trim()) {
      setFormError('Team Name is mandatory.');
      return;
    }
    if (evaluatedTeamKeys.has(teamName.trim().toLowerCase())) {
      setFormError('This team already has an evaluation. Pick another team from the list.');
      return;
    }
    if (!judgeName.trim()) {
      setFormError('Judge Name is mandatory.');
      return;
    }
    if (!theme.trim()) {
      setFormError('Theme is mandatory.');
      return;
    }

    for (const c of RUBRIC_CRITERIA) {
      const rawVal = scores[c.key];
      if (rawVal === undefined || rawVal === '' || rawVal.trim() === '') {
        setFormError(`Score for "${c.title}" is mandatory.`);
        return;
      }
      const numVal = parseFloat(rawVal);
      if (isNaN(numVal) || numVal < 0 || numVal > c.maxMarks) {
        setFormError(`Score for "${c.title}" must be between 0 and ${c.maxMarks}.`);
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload = {
        team_name: canonicalTeamName(teamName),
        judge_name: judgeName.trim(),
        theme: theme.trim(),
        score_prompt_clarity: parseFloat(scores.score_prompt_clarity),
        score_functional_impl: parseFloat(scores.score_functional_impl),
        score_ui_ux: parseFloat(scores.score_ui_ux),
        score_problem_solving: parseFloat(scores.score_problem_solving),
        score_prompt_iteration: parseFloat(scores.score_prompt_iteration),
        score_creativity: parseFloat(scores.score_creativity),
        score_live_demo: parseFloat(scores.score_live_demo),
        comments_prompt_clarity: comments.comments_prompt_clarity || '',
        comments_functional_impl: comments.comments_functional_impl || '',
        comments_ui_ux: comments.comments_ui_ux || '',
        comments_problem_solving: comments.comments_problem_solving || '',
        comments_prompt_iteration: comments.comments_prompt_iteration || '',
        comments_creativity: comments.comments_creativity || '',
        comments_live_demo: comments.comments_live_demo || '',
        judge_notes: judgeNotes || '',
      };

      const res = await fetch('/api/admin/round1', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to submit evaluation.');

      setFormSuccess('Evaluation saved successfully.');

      await fetchLeaderboard(true);

      setTimeout(() => {
        setIsFormOpen(false);
        resetForm();
      }, 1000);
    } catch (err: any) {
      console.error('[Submit Rubric] Error', err);
      setFormError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete evaluation handler
  const handleDeleteEvaluation = async (id: string, teamName: string) => {
    if (!window.confirm(`Delete evaluation for team "${teamName}"?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/round1?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete evaluation.');
      fetchLeaderboard(true);
      if (selectedTeamBreakdown && selectedTeamBreakdown.evaluations.some((e) => e.id === id)) {
        setSelectedTeamBreakdown(null);
      }
    } catch (err: any) {
      alert(err.message || 'Error deleting evaluation');
    }
  };

  const { leaderboard: normalizedLeaderboard, criterionMeta: criterionNormalization } = useMemo(
    () => buildJudgeNormalizedLeaderboard(evaluations),
    [evaluations]
  );

  const filterLeaderboardEntries = useCallback(
    (entries: Round1LeaderboardEntry[]) => {
      if (!searchTerm.trim()) return entries;
      const q = searchTerm.toLowerCase();
      return entries.filter(
        (entry) =>
          (entry.team_name?.toLowerCase() || '').includes(q) ||
          (entry.theme?.toLowerCase() || '').includes(q) ||
          (entry.judge_name?.toLowerCase() || '').includes(q)
      );
    },
    [searchTerm]
  );

  const filteredLeaderboard = useMemo(
    () => filterLeaderboardEntries(leaderboard),
    [leaderboard, filterLeaderboardEntries]
  );

  const filteredNormalizedLeaderboard = useMemo(
    () => filterLeaderboardEntries(normalizedLeaderboard),
    [normalizedLeaderboard, filterLeaderboardEntries]
  );

  const visibleTeams = useMemo(() => {
    return filteredLeaderboard.slice(0, visibleCount);
  }, [filteredLeaderboard, visibleCount]);

  const visibleNormalizedTeams = useMemo(() => {
    return filteredNormalizedLeaderboard.slice(0, visibleCountNormalized);
  }, [filteredNormalizedLeaderboard, visibleCountNormalized]);

  const renderLeaderboardRows = (
    teams: Round1LeaderboardEntry[],
    mode: 'raw' | 'normalized'
  ) =>
    teams.map((team) => {
      const isTop1 = team.rank === 1;
      const isTop2 = team.rank === 2;
      const isTop3 = team.rank === 3;
      const displayScore =
        mode === 'normalized' ? (team.normalized_score ?? team.total_score) : team.total_score;

      return (
        <div
          key={`${mode}-${team.team_name}`}
          className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-app-hover/50 transition-colors"
        >
          <div className="flex items-center space-x-3 min-w-0">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 border ${
                isTop1
                  ? 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                  : isTop2
                    ? 'bg-slate-300/15 border-slate-300/30 text-slate-200'
                    : isTop3
                      ? 'bg-amber-700/15 border-amber-700/30 text-amber-500'
                      : 'bg-app-muted border-app-border text-app-subtext'
              }`}
            >
              {isTop1 ? '🥇' : isTop2 ? '🥈' : isTop3 ? '🥉' : `#${team.rank}`}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                <span className="text-xs sm:text-sm font-bold text-app-text truncate">
                  {team.team_name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app-muted text-app-subtext border border-app-border">
                  {team.theme}
                </span>
              </div>
              <div className="text-[11px] text-app-subtext mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-0.5">
                <span>
                  Judge: <strong className="text-app-text">{team.judge_name}</strong>
                </span>
                {mode === 'normalized' && (
                  <span className="text-[10px] text-app-subtext">
                    Raw:{' '}
                    <strong className="text-app-text">
                      {team.raw_total_score ?? team.total_score}
                    </strong>
                    /100
                  </span>
                )}
                {team.evaluations_count > 1 && (
                  <span className="text-[10px] text-indigo-400">
                    ({team.evaluations_count} evaluations)
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between sm:justify-end space-x-4 shrink-0 pl-12 sm:pl-0">
            <div className="text-left sm:text-right">
              <div className="text-sm sm:text-base font-bold text-app-text font-mono">
                {displayScore}
                <span className="text-xs text-app-subtext font-normal font-sans"> / 100</span>
              </div>
              {mode === 'normalized' && (
                <div className="text-[10px] text-violet-400/90 mt-0.5">criteria-wise scaled</div>
              )}
              <div className="w-20 sm:w-24 h-1 rounded-full bg-app-muted overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full ${mode === 'normalized' ? 'bg-violet-500' : 'bg-app-text'}`}
                  style={{ width: `${Math.min(100, displayScore)}%` }}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setSelectedTeamBreakdown(team)}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-app-border bg-app-surface hover:bg-app-hover text-xs font-medium text-app-text transition-colors cursor-pointer min-h-[36px]"
              title="View rubric score breakdown"
            >
              <Eye className="w-3.5 h-3.5 text-app-subtext" />
              <span>View</span>
            </button>
          </div>
        </div>
      );
    });

  const renderShowMoreFooter = (
    filtered: Round1LeaderboardEntry[],
    visible: Round1LeaderboardEntry[],
    visibleLimit: number,
    setVisibleLimit: React.Dispatch<React.SetStateAction<number>>
  ) => {
    if (filtered.length <= 10) return null;
    return (
      <div className="p-3 bg-app-surface border border-app-border rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2.5 text-xs text-app-subtext">
        <div className="text-[11px]">
          Showing <strong className="text-app-text">{visible.length}</strong> of{' '}
          <strong className="text-app-text">{filtered.length}</strong> teams
        </div>
        <div className="flex items-center space-x-2">
          {visibleLimit < filtered.length && (
            <button
              type="button"
              onClick={() => setVisibleLimit((prev) => prev + 10)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-app-hover border border-app-border text-app-text font-medium transition-colors cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Show More (+10)</span>
            </button>
          )}
          {visibleLimit > 10 && (
            <button
              type="button"
              onClick={() => setVisibleLimit(10)}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg border border-app-border text-app-subtext hover:text-app-text transition-colors cursor-pointer"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Less</span>
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderCriterionNormalizationLegend = (meta: Round1CriterionNormalizationMeta[]) => {
    if (meta.length === 0) return null;
    const byJudge = new Map<string, Round1CriterionNormalizationMeta[]>();
    for (const row of meta) {
      const list = byJudge.get(row.judge_name) || [];
      list.push(row);
      byJudge.set(row.judge_name, list);
    }
    return (
      <div className="space-y-2 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 text-[11px] text-app-subtext">
        {Array.from(byJudge.entries()).map(([judge, rows]) => (
          <div key={judge} className="space-y-1">
            <div className="font-semibold text-app-text">{judge}</div>
            <div className="flex flex-wrap gap-1.5">
              {rows.map((c) => (
                <span
                  key={`${judge}-${c.criterion_key}`}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-app-surface border border-app-border"
                >
                  <span className="text-app-text">{c.criterion_label}</span>
                  <span>
                    {c.min_raw}–{c.max_raw} → 0–{c.max_marks}
                  </span>
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(SQL_MIGRATION_SNIPPET);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="space-y-5">
      {/* =====================================================================
          HEADER SECTION
         ===================================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 sm:p-6 bg-app-surface border border-app-border rounded-2xl shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-app-text">
              Round 1 Rubric & Standings
            </h1>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-app-muted text-app-subtext border border-app-border">
              Independent
            </span>
          </div>
          <p className="text-xs text-app-subtext">
            Standard 100-mark hackathon rubric with automated calculation and live standings.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          {/* Button 1: Get Leaderboard */}
          <button
            onClick={handleGetLeaderboard}
            disabled={leaderboardLoading}
            className={`flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer min-h-[42px] ${
              hasRequestedLeaderboard
                ? 'bg-app-hover border border-app-border text-app-text hover:bg-app-muted'
                : 'bg-app-text text-app-bg hover:opacity-90 shadow-xs'
            }`}
          >
            {leaderboardLoading ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Loading...</span>
              </>
            ) : (
              <>
                <Trophy className="w-3.5 h-3.5" />
                <span>{hasRequestedLeaderboard ? 'Refresh Standings' : 'Get Leaderboard'}</span>
              </>
            )}
          </button>

          {/* Button 2: Add New Judgment */}
          <button
            onClick={handleOpenForm}
            className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-3.5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs tracking-wide transition-colors cursor-pointer min-h-[42px] shadow-xs"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Add Judgment</span>
          </button>
        </div>
      </div>

      {teamNameDiscrepancies.length > 0 && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-xs space-y-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1 min-w-0">
              <p className="font-semibold text-rose-200">
                Team name mismatch ({teamNameDiscrepancies.length})
              </p>
              <p className="text-rose-200/80 text-[11px] leading-relaxed">
                These judgments were saved under a solo or old team label, but the locked final roster
                uses the merged name. Delete the row and re-evaluate using the merged team from the
                dropdown.
              </p>
            </div>
          </div>
          <ul className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {teamNameDiscrepancies.map((row) => (
              <li
                key={row.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 rounded-lg bg-app-surface/80 border border-rose-500/20"
              >
                <div className="min-w-0 space-y-0.5">
                  <p className="text-app-text font-medium truncate">
                    Saved as: <span className="text-rose-200">{row.storedTeamName}</span>
                  </p>
                  <p className="text-app-subtext truncate">
                    Final merged team:{' '}
                    <span className="text-emerald-300/90">{row.canonicalTeamName}</span>
                    {row.judgeName ? (
                      <span className="text-app-subtext/80">
                        {' '}
                        · Judge {row.judgeName} · {row.totalScore}/100
                      </span>
                    ) : null}
                  </p>
                  {row.reason === 'not_on_roster' && (
                    <p className="text-[10px] text-amber-300/90">
                      Name not on current final merged roster — confirm merge sync, then re-review.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteEvaluation(row.id, row.storedTeamName)}
                  className="shrink-0 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-200 hover:bg-rose-500/15 text-[11px] font-semibold transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" />
                  Delete &amp; re-review
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Supabase Notice (If table is not yet in Supabase schema) */}
      {!tableExists && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div>
              <p className="font-semibold text-amber-300">
                Notice: Supabase table &apos;round1&apos; not detected
              </p>
              <p className="text-amber-200/80 text-[11px] mt-0.5">
                Evaluations are saved in local cache. To sync across team devices, execute the schema
                in Supabase SQL Editor.
              </p>
            </div>
            <button
              onClick={handleCopySql}
              className="flex items-center space-x-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/30 text-xs font-mono transition-colors cursor-pointer self-start sm:self-auto"
            >
              {copiedSql ? (
                <>
                  <Check className="w-3 h-3 text-emerald-400" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy SQL</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* =====================================================================
          LEADERBOARD DISPLAY AREA
          Rendered ONLY when user clicks "Get Leaderboard"!
         ===================================================================== */}
      {!hasRequestedLeaderboard ? (
        <div className="p-8 sm:p-12 bg-app-surface border border-app-border rounded-2xl shadow-xs text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-app-hover border border-app-border flex items-center justify-center text-app-text mx-auto">
            <Trophy className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1">
            <h2 className="text-sm sm:text-base font-semibold text-app-text">
              Round 1 Leaderboard Standby
            </h2>
            <p className="text-xs text-app-subtext">
              Leaderboard is loaded on demand to conserve bandwidth. Press &quot;Get Leaderboard&quot;
              above to stream live scores.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={handleGetLeaderboard}
              className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs tracking-wide transition-all cursor-pointer"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>Get Leaderboard</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
            <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border">
              <div className="text-[11px] font-medium text-app-subtext uppercase">Teams Judged</div>
              <div className="text-xl sm:text-2xl font-bold text-app-text mt-0.5">
                {stats.uniqueTeamsCount}
              </div>
            </div>
            <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border">
              <div className="text-[11px] font-medium text-app-subtext uppercase">Evaluations</div>
              <div className="text-xl sm:text-2xl font-bold text-app-text mt-0.5">
                {stats.totalEvaluations}
              </div>
            </div>
            <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border">
              <div className="text-[11px] font-medium text-app-subtext uppercase">Top Score</div>
              <div className="text-xl sm:text-2xl font-bold text-app-text mt-0.5">
                {stats.topScore} <span className="text-xs text-app-subtext font-normal">/ 100</span>
              </div>
            </div>
            <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border">
              <div className="text-[11px] font-medium text-app-subtext uppercase">Average Score</div>
              <div className="text-xl sm:text-2xl font-bold text-app-text mt-0.5">
                {stats.averageScore} <span className="text-xs text-app-subtext font-normal">/ 100</span>
              </div>
            </div>
          </div>

          {/* Search & Auto-Sync Controls */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-app-surface border border-app-border rounded-xl">
            {/* Live Indicator */}
            <div className="flex items-center space-x-2 text-xs text-app-subtext">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-medium text-app-text">Live Auto-Sync</span>
              {lastUpdated && (
                <span className="text-[11px] text-app-subtext hidden sm:inline">
                  &bull; Refreshed {lastUpdated}
                </span>
              )}
              {refreshing && <RefreshCw className="w-3 h-3 animate-spin text-app-subtext ml-1" />}
            </div>

            {/* Search Input */}
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-app-subtext absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search team, theme, judge..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-8.5 pr-3 py-1.5 text-xs bg-app-bg border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/40 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Leaderboard Cards / List */}
          {leaderboardLoading && leaderboard.length === 0 ? (
            <div className="p-10 text-center text-xs text-app-subtext flex flex-col items-center justify-center space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-app-text" />
              <span>Fetching standings...</span>
            </div>
          ) : filteredLeaderboard.length === 0 ? (
            <div className="p-10 text-center text-xs text-app-subtext bg-app-surface border border-app-border rounded-2xl space-y-1.5">
              <FileSpreadsheet className="w-7 h-7 text-app-subtext/40 mx-auto" />
              <p className="font-semibold text-app-text">No teams found</p>
              <p className="text-[11px] text-app-subtext">
                Click &quot;Add Judgment&quot; to submit a new evaluation.
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* Section 1: Raw rubric totals */}
              <section className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-app-text flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    Raw scores
                  </h2>
                  <p className="text-[11px] text-app-subtext">
                    Actual rubric totals (0–100) as entered by each judge.
                  </p>
                </div>
                <div className="bg-app-surface border border-app-border rounded-2xl overflow-hidden divide-y divide-app-border shadow-xs">
                  {renderLeaderboardRows(visibleTeams, 'raw')}
                </div>
                {renderShowMoreFooter(
                  filteredLeaderboard,
                  visibleTeams,
                  visibleCount,
                  setVisibleCount
                )}
              </section>

              {/* Section 2: Per-criterion min–max normalization */}
              <section className="space-y-3">
                <div className="space-y-1">
                  <h2 className="text-sm font-semibold text-app-text flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-violet-500" />
                    Criteria-normalized standings
                  </h2>
                  <p className="text-[11px] text-app-subtext">
                    Har judge ke liye har rubric criterion alag scale hota hai (us judge ki min–max
                    range se us criterion ke max marks tak). Total par ek shot mein scale nahi — jo
                    judge har line par kam marks de, un sab lines ko criteria-wise adjust karke phir
                    total banaya jata hai.
                  </p>
                </div>
                {renderCriterionNormalizationLegend(criterionNormalization)}
                <div className="bg-app-surface border border-violet-500/25 rounded-2xl overflow-hidden divide-y divide-app-border shadow-xs">
                  {renderLeaderboardRows(visibleNormalizedTeams, 'normalized')}
                </div>
                {renderShowMoreFooter(
                  filteredNormalizedLeaderboard,
                  visibleNormalizedTeams,
                  visibleCountNormalized,
                  setVisibleCountNormalized
                )}
              </section>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          REDESIGNED RUBRIC EVALUATION FORM (ELEGANT GRADING DOSSIER)
          Visually clean, highly structured, responsive with interactive scoring
         ===================================================================== */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <div
            onClick={handleCloseForm}
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative w-full sm:max-w-3xl lg:max-w-4xl h-full sm:h-auto sm:max-h-[92vh] bg-app-surface sm:border sm:border-app-border sm:rounded-2xl shadow-2xl flex flex-col text-left z-10 overflow-hidden">
            {/* Header: Clean document title & live score indicator */}
            <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between bg-app-surface sticky top-0 z-20">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-app-hover border border-app-border flex items-center justify-center text-app-text shrink-0">
                  <FileCheck2 className="w-4 h-4 text-app-text" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm sm:text-base font-bold text-app-text tracking-tight uppercase">
                      Hackathon Evaluation Rubric
                    </h2>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app-muted text-app-subtext border border-app-border hidden sm:inline">
                      100 Marks Max
                    </span>
                  </div>
                  <p className="text-[11px] text-app-subtext truncate">
                    Official scoring sheet &bull; Team, Judge, Theme and all 7 criterion marks required
                  </p>
                </div>
              </div>

              {/* Top Score Pill & Close Button */}
              <div className="flex items-center space-x-2.5 shrink-0">
                <div className="hidden xs:flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-app-bg border border-app-border text-xs font-mono">
                  <span className="text-[10px] uppercase text-app-subtext font-sans">Score:</span>
                  <span className="font-bold text-app-text">{calculatedTotal}</span>
                  <span className="text-[10px] text-app-subtext">/ 100</span>
                </div>

                <button
                  onClick={handleCloseForm}
                  disabled={submitting}
                  className="p-1.5 rounded-lg border border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer"
                  title="Close form"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Form Body (Scrollable Sheet) */}
            <form onSubmit={handleSubmitEvaluation} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Card 1: Team & Judge Identification */}
              <div className="p-4 sm:p-5 rounded-xl bg-app-bg border border-app-border space-y-3.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-app-subtext uppercase tracking-wider">
                    Team & Judge Identification
                  </span>
                  <span className="text-[10px] text-rose-400 font-medium">* All 3 fields mandatory</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-app-text">
                      Team Name <span className="text-rose-400">*</span>
                    </label>
                    {finalTeamNames.length > 0 ? (
                      <>
                        <select
                          required
                          value={teamName}
                          onChange={(e) => setTeamName(e.target.value)}
                          disabled={teamsAvailableForEvaluation.length === 0}
                          className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-text focus:outline-none focus:border-zinc-400 transition-colors disabled:opacity-50"
                        >
                          <option value="">
                            {teamsAvailableForEvaluation.length === 0
                              ? 'All teams evaluated'
                              : 'Select official team…'}
                          </option>
                          {teamsAvailableForEvaluation.map((n) => (
                            <option key={n} value={n}>
                              {n}
                            </option>
                          ))}
                        </select>
                        <p className="text-[10px] text-app-subtext">
                          Merged final teams only · {teamsAvailableForEvaluation.length} pending
                          {evaluatedTeamKeys.size > 0
                            ? ` · ${evaluatedTeamKeys.size} evaluated (canonical names)`
                            : ''}
                        </p>
                      </>
                    ) : (
                      <input
                        type="text"
                        required
                        placeholder="e.g. Neural Pioneers"
                        value={teamName}
                        onChange={(e) => setTeamName(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/30 focus:outline-none focus:border-zinc-400 transition-colors"
                      />
                    )}
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-app-text">
                      Judge Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Dr. Jane Doe"
                      value={judgeName}
                      onChange={(e) => setJudgeName(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/30 focus:outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-app-text">
                      Theme <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. AI for Health / FinTech"
                      value={theme}
                      onChange={(e) => setTheme(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/30 focus:outline-none focus:border-zinc-400 transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: 7 Rubric Criteria Section */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1">
                  <div>
                    <h3 className="text-xs font-semibold text-app-subtext uppercase tracking-wider">
                      Evaluation Criteria (100 Marks Total)
                    </h3>
                    <p className="text-[11px] text-app-subtext mt-0.5">
                      Use the quick-score chips or enter exact decimal scores directly.
                    </p>
                  </div>
                </div>

                <div className="space-y-3.5">
                  {RUBRIC_CRITERIA.map((criterion) => {
                    const currentScore = scores[criterion.key];
                    const numScore = parseFloat(currentScore || '0');
                    const isExceeded = !isNaN(numScore) && numScore > criterion.maxMarks;
                    const percent = !isNaN(numScore) && numScore > 0 
                      ? Math.min(100, (numScore / criterion.maxMarks) * 100) 
                      : 0;

                    return (
                      <div
                        key={criterion.key}
                        className="p-4 rounded-xl bg-app-surface border border-app-border space-y-3 transition-colors hover:border-zinc-700/80"
                      >
                        {/* Criterion Top Bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                          <div className="flex items-center space-x-2.5">
                            <span className="w-6 h-6 rounded-lg bg-app-muted border border-app-border flex items-center justify-center text-[11px] font-mono font-bold text-app-text shrink-0">
                              0{criterion.number}
                            </span>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className="text-xs sm:text-sm font-semibold text-app-text">
                                  {criterion.title}
                                </h4>
                                <span className="text-rose-400 text-xs">*</span>
                              </div>
                              <p className="text-[11px] text-app-subtext leading-tight mt-0.5">
                                {criterion.description}
                              </p>
                            </div>
                          </div>

                          {/* Max Marks Pill */}
                          <div className="flex items-center space-x-2 self-start sm:self-auto shrink-0">
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-app-muted text-app-subtext border border-app-border">
                              Max: <strong className="text-app-text">{criterion.maxMarks}</strong>
                            </span>
                          </div>
                        </div>

                        {/* Visual Progress Bar for this criterion */}
                        <div className="w-full h-1 bg-app-bg rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-200 ${
                              percent >= 80 ? 'bg-emerald-400' : percent >= 50 ? 'bg-amber-400' : 'bg-zinc-500'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>

                        {/* Interactive Scoring Controls */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 pt-1 items-center">
                          {/* Left: Quick-Score Chips + Direct Numeric Stepper */}
                          <div className="sm:col-span-6 flex flex-col gap-2">
                            <div className="flex items-center space-x-1.5">
                              {/* Decrement */}
                              <button
                                type="button"
                                onClick={() => handleScoreStep(criterion.key, -1, criterion.maxMarks)}
                                className="w-8 h-8 rounded-lg border border-app-border bg-app-bg hover:bg-app-hover flex items-center justify-center text-app-subtext hover:text-app-text cursor-pointer shrink-0 transition-colors"
                                title="Decrease by 1"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>

                              {/* Numeric Input */}
                              <div className="relative flex-1">
                                <input
                                  type="number"
                                  required
                                  min="0"
                                  max={criterion.maxMarks}
                                  step="0.5"
                                  placeholder={`0 - ${criterion.maxMarks}`}
                                  value={currentScore}
                                  onChange={(e) => {
                                    const raw = e.target.value;
                                    if (raw === '') {
                                      setScores((prev) => ({ ...prev, [criterion.key]: '' }));
                                      return;
                                    }
                                    const num = parseFloat(raw);
                                    if (Number.isNaN(num)) return;
                                    const clamped = Math.max(0, Math.min(criterion.maxMarks, num));
                                    setScores((prev) => ({
                                      ...prev,
                                      [criterion.key]: clamped.toString(),
                                    }));
                                  }}
                                  className={`w-full px-3 py-1.5 text-xs text-center font-mono font-bold rounded-lg bg-app-bg border text-app-text focus:outline-none transition-colors ${
                                    isExceeded
                                      ? 'border-rose-500 text-rose-400'
                                      : 'border-app-border focus:border-zinc-400'
                                  }`}
                                />
                                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-app-subtext pointer-events-none">
                                  / {criterion.maxMarks}
                                </div>
                              </div>

                              {/* Increment */}
                              <button
                                type="button"
                                onClick={() => handleScoreStep(criterion.key, 1, criterion.maxMarks)}
                                className="w-8 h-8 rounded-lg border border-app-border bg-app-bg hover:bg-app-hover flex items-center justify-center text-app-subtext hover:text-app-text cursor-pointer shrink-0 transition-colors"
                                title="Increase by 1"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Quick Select Preset Pills */}
                            <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none py-0.5">
                              <span className="text-[10px] text-app-subtext mr-1 shrink-0">Presets:</span>
                              {criterion.quickScores.map((scoreVal) => {
                                const isSelected = parseFloat(currentScore) === scoreVal;
                                return (
                                  <button
                                    key={scoreVal}
                                    type="button"
                                    onClick={() => handleQuickScoreSelect(criterion.key, scoreVal)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-semibold border transition-all cursor-pointer ${
                                      isSelected
                                        ? 'bg-app-text text-app-bg border-app-text'
                                        : 'bg-app-bg hover:bg-app-hover text-app-subtext hover:text-app-text border-app-border'
                                    }`}
                                  >
                                    {scoreVal}
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Right: Comments / Evidence input */}
                          <div className="sm:col-span-6 space-y-1">
                            <input
                              type="text"
                              placeholder="Comments / evidence (optional review)..."
                              value={comments[criterion.commentKey] || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setComments((prev) => ({ ...prev, [criterion.commentKey]: val }));
                              }}
                              className="w-full px-3 py-2 text-xs bg-app-bg border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/30 focus:outline-none focus:border-zinc-400 transition-colors"
                            />
                            {isExceeded && (
                              <p className="text-[10px] text-rose-400 font-mono">
                                Cannot exceed maximum {criterion.maxMarks} marks
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Card 3: Judge Notes (Optional Review Field) */}
              <div className="p-4 rounded-xl bg-app-bg border border-app-border space-y-2">
                <div className="flex items-center space-x-2 text-xs font-semibold text-app-text">
                  <MessageSquare className="w-3.5 h-3.5 text-app-subtext" />
                  <span>Judge Notes & Deliberations</span>
                  <span className="text-[11px] text-app-subtext font-normal">(Optional general commentary)</span>
                </div>
                <textarea
                  rows={3}
                  placeholder="Record overall team strengths, performance notes, technical observations, or feedback..."
                  value={judgeNotes}
                  onChange={(e) => setJudgeNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-app-surface border border-app-border rounded-lg text-app-text placeholder:text-app-subtext/30 focus:outline-none focus:border-zinc-400 resize-none transition-colors"
                />
              </div>

              {/* Error & Success States */}
              {formError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* Extra spacer so sticky footer never overlaps content */}
              <div className="h-20 sm:h-0" />
            </form>

            {/* =====================================================================
                STICKY BOTTOM SUMMARY BAR
                Shows automatic total, tier badge, cancel & submit
               ===================================================================== */}
            <div className="p-4 border-t border-app-border bg-app-surface/95 backdrop-blur-sm sticky bottom-0 z-20 flex items-center justify-between gap-3 shadow-lg">
              {/* Left: Automatically Calculated Score & Tier */}
              <div className="flex items-center space-x-3">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-mono text-app-subtext block">
                    Calculated Total
                  </span>
                  <div className="text-base sm:text-lg font-bold text-app-text font-mono flex items-center space-x-1.5">
                    <span className="text-emerald-400">{calculatedTotal}</span>
                    <span className="text-xs text-app-subtext font-normal font-sans">/ 100</span>
                  </div>
                </div>

                <span className={`text-[10px] font-mono font-medium px-2 py-0.5 rounded border hidden sm:inline ${scoreTier.color}`}>
                  {scoreTier.label}
                </span>
              </div>

              {/* Right: Actions */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  disabled={submitting}
                  className="px-3.5 py-2 rounded-lg border border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover text-xs font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  onClick={handleSubmitEvaluation}
                  disabled={submitting}
                  className="flex items-center space-x-1.5 px-4.5 py-2 rounded-lg bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs tracking-wide transition-opacity cursor-pointer disabled:opacity-40 min-h-[38px] shadow-xs"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span>Submit Evaluation</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          DETAILED RUBRIC BREAKDOWN VIEW MODAL
         ===================================================================== */}
      {selectedTeamBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 overflow-y-auto">
          {/* Backdrop */}
          <div
            onClick={() => setSelectedTeamBreakdown(null)}
            className="fixed inset-0 bg-black/70 backdrop-blur-xs"
            aria-hidden="true"
          />

          {/* Modal Container */}
          <div className="relative w-full sm:max-w-2xl h-full sm:h-auto sm:max-h-[85vh] bg-app-surface sm:border sm:border-app-border sm:rounded-2xl shadow-xl flex flex-col text-left z-10 overflow-hidden">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-app-border flex items-start justify-between bg-app-surface sticky top-0 z-20">
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm sm:text-base font-bold text-app-text">
                    {selectedTeamBreakdown.team_name}
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-app-muted text-app-subtext border border-app-border">
                    {selectedTeamBreakdown.theme}
                  </span>
                </div>
                <p className="text-xs text-app-subtext mt-0.5">
                  Rank #{selectedTeamBreakdown.rank} &bull; Score:{' '}
                  <strong className="text-app-text font-mono">
                    {selectedTeamBreakdown.total_score} / 100
                  </strong>
                </p>
              </div>

              <button
                onClick={() => setSelectedTeamBreakdown(null)}
                className="p-1.5 rounded-lg border border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {selectedTeamBreakdown.evaluations.map((ev, evIdx) => (
                <div
                  key={ev.id || evIdx}
                  className="p-3.5 sm:p-4 rounded-xl bg-app-bg border border-app-border space-y-3"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-app-border">
                    <div>
                      <div className="text-xs font-semibold text-app-text">
                        Judge: {ev.judge_name}
                      </div>
                      <div className="text-[10px] text-app-subtext">
                        {new Date(ev.created_at).toLocaleString()}
                      </div>
                    </div>

                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold font-mono text-emerald-400">
                        {ev.total_score} / 100
                      </span>
                      <button
                        onClick={() => handleDeleteEvaluation(ev.id, ev.team_name)}
                        className="p-1.5 rounded-lg border border-rose-500/20 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition-colors cursor-pointer"
                        title="Delete evaluation"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Criteria List */}
                  <div className="space-y-1.5">
                    {RUBRIC_CRITERIA.map((criterion) => {
                      const score = ev[criterion.key];
                      const comment = ev[criterion.commentKey];

                      return (
                        <div
                          key={criterion.key}
                          className="p-2.5 rounded-lg bg-app-surface border border-app-border flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-app-text">{criterion.title}</span>
                            {comment && (
                              <p className="text-[11px] text-app-subtext mt-0.5 italic">
                                &quot;{comment}&quot;
                              </p>
                            )}
                          </div>
                          <div className="font-mono font-semibold text-app-text shrink-0 text-xs">
                            {score}{' '}
                            <span className="text-[10px] text-app-subtext font-normal">
                              / {criterion.maxMarks}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Judge Notes */}
                  {ev.judge_notes && (
                    <div className="p-2.5 rounded-lg bg-app-surface border border-app-border text-xs space-y-1">
                      <span className="font-mono text-[10px] uppercase text-app-subtext font-semibold">
                        Judge Notes
                      </span>
                      <p className="text-app-text text-[11px] leading-relaxed whitespace-pre-wrap">
                        {ev.judge_notes}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
