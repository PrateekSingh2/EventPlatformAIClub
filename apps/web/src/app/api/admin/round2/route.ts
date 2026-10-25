import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { upsertParticipantRows } from '@/lib/sync-users-from-final-teams';
import { buildFinalTeamsEmailPasteCsv } from '@/lib/final-teams';
import { loadFinalTeams, loadFinalTeamsConfig, isFinalTeamsTableReady } from '@/lib/final-teams-db';
import { listCaseStudyPoolArchives } from '@/lib/storage';
import {
  buildRandomPoolAssignments,
  filterFinalTeamsByKeys,
  finalTeamsToParticipantPayload,
  teamsToPoolCommitArchives,
} from '@/lib/round2';
import {
  isRound2TableReady,
  loadRound2Selection,
  saveRound2Selection,
} from '@/lib/round2-db';

export const dynamic = 'force-dynamic';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
  if (!verifyAdminSecret(secret)) return unauthorized();

  if (!(await isFinalTeamsTableReady())) {
    return NextResponse.json({
      ready: false,
      error: 'Run migration 012_final_teams_roster.sql',
      locked: false,
      teams: [],
      selection: { selected_team_keys: [], pool_assignments: {} },
    });
  }

  const config = await loadFinalTeamsConfig();
  const allTeams = await loadFinalTeams();
  const selection = await loadRound2Selection();

  const exportKind = req.nextUrl.searchParams.get('export');
  if (exportKind === 'email-csv') {
    const selected = filterFinalTeamsByKeys(allTeams, selection.selected_team_keys);
    const csv = buildFinalTeamsEmailPasteCsv(selected);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="round2-selected-email-${Date.now()}.csv"`,
      },
    });
  }

  let poolItems: Awaited<ReturnType<typeof listCaseStudyPoolArchives>> = [];
  if (isSupabaseConfigured) {
    try {
      poolItems = await listCaseStudyPoolArchives();
    } catch {
      poolItems = [];
    }
  }

  return NextResponse.json({
    ready: true,
    round2TableReady: await isRound2TableReady(),
    locked: config.locked,
    locked_at: config.locked_at,
    teams: allTeams,
    selection: {
      selected_team_keys: selection.selected_team_keys,
      pool_assignments: selection.pool_assignments,
      updated_at: selection.updated_at,
      source: selection.source,
    },
    poolItems,
    selectedCount: selection.selected_team_keys.length,
  });
}

export async function PUT(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  if (!verifyAdminSecret(secret)) return unauthorized();

  const body = await req.json();
  const selected_team_keys = Array.isArray(body.selected_team_keys)
    ? body.selected_team_keys.map(String)
    : null;
  if (!selected_team_keys) {
    return NextResponse.json({ error: 'selected_team_keys array required' }, { status: 400 });
  }

  const config = await loadFinalTeamsConfig();
  if (!config.locked) {
    return NextResponse.json({ error: 'Lock the final roster before Round 2 selection' }, { status: 409 });
  }

  const allTeams = await loadFinalTeams();
  const validKeys = new Set(allTeams.map((t) => t.team_key));
  const filtered = selected_team_keys.filter((k: string) => validKeys.has(k));

  const existing = await loadRound2Selection();
  const pool_assignments =
    body.pool_assignments && typeof body.pool_assignments === 'object'
      ? (body.pool_assignments as Record<string, string>)
      : existing.pool_assignments;

  const prunedPool: Record<string, string> = {};
  for (const key of filtered) {
    if (pool_assignments[key]) prunedPool[key] = pool_assignments[key];
  }

  const saved = await saveRound2Selection({
    selected_team_keys: filtered,
    pool_assignments: prunedPool,
  });

  return NextResponse.json({ success: true, selection: saved, selectedCount: filtered.length });
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret');
  const body = await req.json();
  const adminSecret = body.adminSecret || secret;
  if (!verifyAdminSecret(adminSecret)) return unauthorized();

  const action = String(body.action || '');
  const config = await loadFinalTeamsConfig();
  if (!config.locked) {
    return NextResponse.json({ error: 'Final roster must be locked' }, { status: 409 });
  }

  const allTeams = await loadFinalTeams();
  const selection = await loadRound2Selection();
  const selectedTeams = filterFinalTeamsByKeys(allTeams, selection.selected_team_keys);

  if (selectedTeams.length === 0 && action !== 'random-pool') {
    return NextResponse.json({ error: 'Select at least one team for Round 2' }, { status: 400 });
  }

  if (action === 'random-pool') {
    const teamKeys =
      Array.isArray(body.teamKeys) && body.teamKeys.length > 0
        ? body.teamKeys.map(String)
        : selection.selected_team_keys;
    const teamsForMap = filterFinalTeamsByKeys(allTeams, teamKeys);
    if (teamsForMap.length === 0) {
      return NextResponse.json({ error: 'No teams to assign' }, { status: 400 });
    }

    let poolItems: Awaited<ReturnType<typeof listCaseStudyPoolArchives>> = [];
    try {
      poolItems = await listCaseStudyPoolArchives();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to list pool';
      return NextResponse.json({ error: msg }, { status: 503 });
    }
    if (poolItems.length === 0) {
      return NextResponse.json({ error: 'Case-study pool is empty. Upload pool ZIPs in Stages tab.' }, { status: 400 });
    }

    const poolKeys = poolItems.map((p) => p.poolKey);
    const preserveManual = body.preserveManual !== false;
    const mapping = buildRandomPoolAssignments(
      teamsForMap.map((t) => t.team_key),
      poolKeys,
      selection.pool_assignments,
      preserveManual
    );

    const saved = await saveRound2Selection({
      selected_team_keys: selection.selected_team_keys,
      pool_assignments: mapping,
    });

    return NextResponse.json({
      success: true,
      pool_assignments: saved.pool_assignments,
      mappedTeams: teamsForMap.length,
      poolCount: poolKeys.length,
    });
  }

  if (action === 'assign-pool') {
    const stageCount = Math.max(1, Number(body.stageCount) || 12);
    let poolItems: Awaited<ReturnType<typeof listCaseStudyPoolArchives>> = [];
    try {
      poolItems = await listCaseStudyPoolArchives();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to list pool';
      return NextResponse.json({ error: msg }, { status: 503 });
    }

    const poolByKey = new Map(poolItems.map((p) => [p.poolKey, p]));
    const assignments =
      body.pool_assignments && typeof body.pool_assignments === 'object'
        ? (body.pool_assignments as Record<string, string>)
        : selection.pool_assignments;

    const unmapped = selectedTeams.filter((t) => !assignments[t.team_key]);
    if (unmapped.length > 0) {
      return NextResponse.json(
        {
          error: `${unmapped.length} selected team(s) have no pool mapping. Run random assign or set mappings first.`,
          unmapped: unmapped.map((t) => t.team_name),
        },
        { status: 400 }
      );
    }

    let archives;
    try {
      archives = teamsToPoolCommitArchives(selectedTeams, assignments, poolByKey, stageCount);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Invalid pool mapping';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const origin = req.nextUrl.origin;
    const commitRes = await fetch(`${origin}/api/admin/stages/bulk-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'commit-pool',
        adminSecret,
        archives,
      }),
    });
    const commitData = await commitRes.json();
    if (!commitRes.ok || !commitData.success) {
      return NextResponse.json(
        { error: commitData.error || 'Pool commit failed', details: commitData.errors },
        { status: commitRes.status || 500 }
      );
    }

    await saveRound2Selection({
      selected_team_keys: selection.selected_team_keys,
      pool_assignments: assignments,
    });

    return NextResponse.json({
      success: true,
      committed: commitData.committed || [],
      teamCount: selectedTeams.length,
    });
  }

  if (action === 'ingest-contest') {
    const rows = finalTeamsToParticipantPayload(selectedTeams);
    const result = await upsertParticipantRows(getSupabaseAdmin(), rows);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      count: result.count,
      teamCount: selectedTeams.length,
      memberRows: rows.length,
    });
  }

  return NextResponse.json({ error: 'Unknown action. Use random-pool, assign-pool, or ingest-contest.' }, { status: 400 });
}
