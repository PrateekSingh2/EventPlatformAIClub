import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { Round1RubricEvaluation } from '@/lib/types';
import { buildLeaderboard, buildJudgeNormalizedLeaderboard } from '@/lib/round1-leaderboard';
import {
  buildFinalTeamAliasMap,
  canonicalizeRound1TeamName,
  displayTeamNameFromRecord,
} from '@/lib/final-teams';
import {
  isFinalTeamsTableReady,
  loadFinalTeams,
  loadFinalTeamsConfig,
} from '@/lib/final-teams-db';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function getLocalCachePath(): string {
  const dir = path.join(process.cwd(), '.contest-cache');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return path.join(dir, 'round1-evaluations.json');
}

function readLocalEvaluations(): Round1RubricEvaluation[] {
  try {
    const file = getLocalCachePath();
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (e) {
    console.error('[Round1 API] Failed reading local evaluations cache', e);
  }
  return [];
}

function writeLocalEvaluations(evaluations: Round1RubricEvaluation[]) {
  try {
    const file = getLocalCachePath();
    fs.writeFileSync(file, JSON.stringify(evaluations, null, 2), 'utf8');
  } catch (e) {
    console.error('[Round1 API] Failed writing local evaluations cache', e);
  }
}

function normalizeRound1TeamKey(teamName: string): string {
  return teamName.trim().toLowerCase();
}

async function loadRound1AliasMapIfLocked(): Promise<Map<string, string>> {
  if (!(await isFinalTeamsTableReady())) return new Map();
  const config = await loadFinalTeamsConfig();
  if (!config.locked) return new Map();
  const teams = (await loadFinalTeams()).map((t) => ({
    ...t,
    team_name: displayTeamNameFromRecord(t),
  }));
  return buildFinalTeamAliasMap(teams);
}

async function loadStoredEvaluations(): Promise<{ evaluations: Round1RubricEvaluation[]; tableExists: boolean }> {
  let evaluations: Round1RubricEvaluation[] = [];
  let tableExists = true;

  if (isSupabaseConfigured) {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('round1')
      .select('*')
      .order('total_score', { ascending: false })
      .order('created_at', { ascending: true });

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('not find the table') || error.message?.includes('does not exist')) {
        tableExists = false;
      }
      evaluations = readLocalEvaluations();
    } else if (data) {
      evaluations = data as Round1RubricEvaluation[];
      writeLocalEvaluations(evaluations);
    }
  } else {
    evaluations = readLocalEvaluations();
  }

  return { evaluations, tableExists };
}

export async function GET(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
    }

    const { evaluations, tableExists } = await loadStoredEvaluations();

    let aliasMap = new Map<string, string>();
    if (await isFinalTeamsTableReady()) {
      const config = await loadFinalTeamsConfig();
      if (config.locked) {
        const teams = (await loadFinalTeams()).map((t) => ({
          ...t,
          team_name: displayTeamNameFromRecord(t),
        }));
        aliasMap = buildFinalTeamAliasMap(teams);
      }
    }

    const canonicalEvaluations =
      aliasMap.size > 0
        ? evaluations.map((ev) => ({
            ...ev,
            team_name: canonicalizeRound1TeamName(ev.team_name, aliasMap),
          }))
        : evaluations;

    const leaderboard = buildLeaderboard(canonicalEvaluations);
    const { leaderboard: normalized_leaderboard, judgeMeta: judge_normalization } =
      buildJudgeNormalizedLeaderboard(canonicalEvaluations);

    // Compute metrics
    const totalEvaluations = evaluations.length;
    const uniqueTeamsCount = leaderboard.length;
    const scores = evaluations.map((e) => Number(e.total_score) || 0);
    const averageScore = scores.length > 0 ? Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1)) : 0;
    const topScore = scores.length > 0 ? Math.max(...scores) : 0;

    return NextResponse.json({
      success: true,
      tableExists,
      evaluations,
      leaderboard,
      normalized_leaderboard,
      judge_normalization,
      stats: {
        totalEvaluations,
        uniqueTeamsCount,
        averageScore,
        topScore,
      },
    });
  } catch (error: any) {
    console.error('[Round1 API GET] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch Round 1 data' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
    }

    const body = await req.json();
    const {
      team_name,
      judge_name,
      theme,
      score_prompt_clarity,
      score_functional_impl,
      score_ui_ux,
      score_problem_solving,
      score_prompt_iteration,
      score_creativity,
      score_live_demo,
      comments_prompt_clarity,
      comments_functional_impl,
      comments_ui_ux,
      comments_problem_solving,
      comments_prompt_iteration,
      comments_creativity,
      comments_live_demo,
      judge_notes,
    } = body;

    // Validate Mandatory Headers
    if (!team_name || typeof team_name !== 'string' || !team_name.trim()) {
      return NextResponse.json({ error: 'Team Name is mandatory' }, { status: 400 });
    }
    if (!judge_name || typeof judge_name !== 'string' || !judge_name.trim()) {
      return NextResponse.json({ error: 'Judge Name is mandatory' }, { status: 400 });
    }
    if (!theme || typeof theme !== 'string' || !theme.trim()) {
      return NextResponse.json({ error: 'Theme is mandatory' }, { status: 400 });
    }

    const { evaluations: existingEvaluations } = await loadStoredEvaluations();
    const aliasMap = await loadRound1AliasMapIfLocked();
    const resolvedTeamName = aliasMap.size
      ? canonicalizeRound1TeamName(team_name, aliasMap)
      : team_name.trim();
    const teamKey = normalizeRound1TeamKey(resolvedTeamName);
    if (
      existingEvaluations.some((e) => {
        const existingName = aliasMap.size
          ? canonicalizeRound1TeamName(e.team_name, aliasMap)
          : e.team_name;
        return normalizeRound1TeamKey(existingName) === teamKey;
      })
    ) {
      return NextResponse.json(
        { error: 'This team already has a Round 1 evaluation. Delete the existing entry to re-evaluate.' },
        { status: 409 }
      );
    }

    // Validate Mandatory Criterion Scores & Boundaries
    const s1 = Number(score_prompt_clarity);
    const s2 = Number(score_functional_impl);
    const s3 = Number(score_ui_ux);
    const s4 = Number(score_problem_solving);
    const s5 = Number(score_prompt_iteration);
    const s6 = Number(score_creativity);
    const s7 = Number(score_live_demo);

    if (isNaN(s1) || s1 < 0 || s1 > 20) {
      return NextResponse.json({ error: 'Prompt Clarity & Constraints score must be between 0 and 20' }, { status: 400 });
    }
    if (isNaN(s2) || s2 < 0 || s2 > 25) {
      return NextResponse.json({ error: 'Functional Implementation score must be between 0 and 25' }, { status: 400 });
    }
    if (isNaN(s3) || s3 < 0 || s3 > 15) {
      return NextResponse.json({ error: 'UI/UX & Visual Quality score must be between 0 and 15' }, { status: 400 });
    }
    if (isNaN(s4) || s4 < 0 || s4 > 15) {
      return NextResponse.json({ error: 'Problem-Solving & Business Logic score must be between 0 and 15' }, { status: 400 });
    }
    if (isNaN(s5) || s5 < 0 || s5 > 10) {
      return NextResponse.json({ error: 'Prompt Iteration (Before vs. After) score must be between 0 and 10' }, { status: 400 });
    }
    if (isNaN(s6) || s6 < 0 || s6 > 5) {
      return NextResponse.json({ error: 'Creativity & Useful Extras score must be between 0 and 5' }, { status: 400 });
    }
    if (isNaN(s7) || s7 < 0 || s7 > 10) {
      return NextResponse.json({ error: 'Live Demo & Explanation score must be between 0 and 10' }, { status: 400 });
    }

    // Automatically calculate final score out of 100
    const total_score = Number((s1 + s2 + s3 + s4 + s5 + s6 + s7).toFixed(2));
    const nowIso = new Date().toISOString();

    const newEvaluation: Round1RubricEvaluation = {
      id: crypto.randomUUID(),
      team_name: resolvedTeamName,
      judge_name: judge_name.trim(),
      theme: theme.trim(),
      score_prompt_clarity: s1,
      score_functional_impl: s2,
      score_ui_ux: s3,
      score_problem_solving: s4,
      score_prompt_iteration: s5,
      score_creativity: s6,
      score_live_demo: s7,
      total_score,
      comments_prompt_clarity: comments_prompt_clarity?.trim() || '',
      comments_functional_impl: comments_functional_impl?.trim() || '',
      comments_ui_ux: comments_ui_ux?.trim() || '',
      comments_problem_solving: comments_problem_solving?.trim() || '',
      comments_prompt_iteration: comments_prompt_iteration?.trim() || '',
      comments_creativity: comments_creativity?.trim() || '',
      comments_live_demo: comments_live_demo?.trim() || '',
      judge_notes: judge_notes?.trim() || '',
      created_at: nowIso,
      updated_at: nowIso,
    };

    let tableExists = true;

    // Persist to Supabase
    if (isSupabaseConfigured) {
      const supabaseAdmin = getSupabaseAdmin();
      const { data, error } = await supabaseAdmin
        .from('round1')
        .insert([newEvaluation])
        .select()
        .single();

      if (error) {
        if (error.code === 'PGRST205' || error.message?.includes('not find the table') || error.message?.includes('does not exist')) {
          tableExists = false;
        }
        console.warn('[Round1 API POST] Supabase insert warning:', error.message);
      } else if (data) {
        newEvaluation.id = data.id;
      }
    }

    // Save to local cache as well to ensure zero data loss
    const local = readLocalEvaluations();
    local.unshift(newEvaluation);
    writeLocalEvaluations(local);

    return NextResponse.json({
      success: true,
      tableExists,
      evaluation: newEvaluation,
      message: 'Rubric evaluation successfully recorded',
    });
  } catch (error: any) {
    console.error('[Round1 API POST] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to submit rubric evaluation' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized: Invalid Admin Secret' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Missing evaluation ID to delete' }, { status: 400 });
    }

    if (isSupabaseConfigured) {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin.from('round1').delete().eq('id', id);
    }

    // Remove from local cache
    const local = readLocalEvaluations().filter((e) => e.id !== id);
    writeLocalEvaluations(local);

    return NextResponse.json({ success: true, message: 'Evaluation deleted successfully' });
  } catch (error: any) {
    console.error('[Round1 API DELETE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to delete evaluation' },
      { status: 500 }
    );
  }
}
