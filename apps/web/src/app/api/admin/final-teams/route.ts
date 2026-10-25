import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, generateAccessToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import {
    buildFinalTeamsFromMerger,
    buildFinalTeamsEmailPasteCsv,
    buildFinalTeamsExportCsv,
    dedupeFinalTeams,
    finalTeamsToEmailRecipients,
    type FinalTeamRecord,
} from '@/lib/final-teams';
import {
    isFinalTeamsTableReady,
    loadFinalTeams,
    loadFinalTeamsConfig,
    replaceFinalTeams,
    setFinalTeamsLocked,
} from '@/lib/final-teams-db';
import type { TeamSubmission } from '@/lib/team-merger';
import type { StoredSeminarHallRow } from '@/lib/seminar-halls';
import { pruneDuplicateTeamsOnPlatform } from '@/lib/prune-duplicate-teams-db';

export const dynamic = 'force-dynamic';

function unauthorized() {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function normalizeTeamInput(raw: unknown, index: number): FinalTeamRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const team_name = String(o.team_name ?? '').trim();
    if (!team_name) return null;
    const submission_ids = Array.isArray(o.submission_ids)
        ? o.submission_ids.map(String)
        : [];
    const team_key =
        String(o.team_key ?? '').trim() ||
        (submission_ids.length ? submission_ids.slice().sort().join('|') : `manual-${index}-${team_name}`);
    const access_token = String(o.access_token ?? '').trim().toUpperCase();
    return {
        id: o.id != null ? String(o.id) : undefined,
        team_key,
        team_name,
        team_size: String(o.team_size ?? 'Solo'),
        access_token: access_token || '',
        members: Array.isArray(o.members) ? (o.members as FinalTeamRecord['members']) : [],
        source_team_names: Array.isArray(o.source_team_names)
            ? (o.source_team_names as string[])
            : [],
        submission_ids,
        seminar_hall: o.seminar_hall != null ? String(o.seminar_hall) : null,
        sort_order: Number(o.sort_order ?? index),
    };
}

export async function GET(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(secret)) return unauthorized();

    const exportKind = req.nextUrl.searchParams.get('export');
    const namesOnly = req.nextUrl.searchParams.get('namesOnly') === '1';

    if (!(await isFinalTeamsTableReady())) {
        return NextResponse.json({
            ready: false,
            error: 'Run migration 012_final_teams_roster.sql in Supabase',
            config: { locked: false, locked_at: null, updated_at: null },
            teams: [],
            teamNames: [],
            recipients: [],
        });
    }

    const config = await loadFinalTeamsConfig();
    const teams = await loadFinalTeams();

    if (exportKind === 'teams-csv') {
        const csv = buildFinalTeamsExportCsv(teams);
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="final-teams-${Date.now()}.csv"`,
            },
        });
    }

    if (exportKind === 'email-csv') {
        const csv = buildFinalTeamsEmailPasteCsv(teams);
        return new NextResponse(csv, {
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="final-teams-email-paste-${Date.now()}.csv"`,
            },
        });
    }

    if (namesOnly) {
        return NextResponse.json({
            ready: true,
            locked: config.locked,
            teamNames: teams.map((t) => t.team_name).sort((a, b) => a.localeCompare(b)),
        });
    }

    const recipientsOnly = req.nextUrl.searchParams.get('recipients') === '1';
    if (recipientsOnly) {
        return NextResponse.json({
            ready: true,
            locked: config.locked,
            recipients: finalTeamsToEmailRecipients(teams),
            teams: teams.length,
        });
    }

    return NextResponse.json({ ready: true, config, teams });
}

export async function PUT(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) return unauthorized();

    if (!(await isFinalTeamsTableReady())) {
        return NextResponse.json({ error: 'final_teams table missing — run migration 012' }, { status: 503 });
    }

    const config = await loadFinalTeamsConfig();
    if (config.locked) {
        return NextResponse.json({ error: 'Roster is locked. Unlock to edit.' }, { status: 409 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const rawTeams = record.teams;
    if (!Array.isArray(rawTeams)) {
        return NextResponse.json({ error: 'teams array required' }, { status: 400 });
    }

    const teams: FinalTeamRecord[] = [];
    for (let i = 0; i < rawTeams.length; i++) {
        const t = normalizeTeamInput(rawTeams[i], i);
        if (t) teams.push(t);
    }

    const seenKeys = new Set<string>();
    for (const t of teams) {
        if (seenKeys.has(t.team_key)) {
            return NextResponse.json({ error: `Duplicate team_key: ${t.team_key}` }, { status: 400 });
        }
        seenKeys.add(t.team_key);
        if (!t.access_token) t.access_token = generateAccessToken();
    }

    await replaceFinalTeams(dedupeFinalTeams(teams));
    const nextConfig = await loadFinalTeamsConfig();
    const saved = await loadFinalTeams();
    return NextResponse.json({ success: true, config: nextConfig, teams: saved });
}

export async function PATCH(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) return unauthorized();

    if (!(await isFinalTeamsTableReady())) {
        return NextResponse.json({ error: 'final_teams table missing — run migration 012' }, { status: 503 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const action = record.action;

    if (action === 'lock') {
        const config = await setFinalTeamsLocked(true);
        return NextResponse.json({ success: true, config });
    }
    if (action === 'unlock') {
        const config = await setFinalTeamsLocked(false);
        return NextResponse.json({ success: true, config });
    }

    return NextResponse.json({ error: 'action must be lock or unlock' }, { status: 400 });
}

export async function POST(req: NextRequest) {
    const secret = req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) return unauthorized();

    if (!(await isFinalTeamsTableReady())) {
        return NextResponse.json({ error: 'final_teams table missing — run migration 012' }, { status: 503 });
    }

    const config = await loadFinalTeamsConfig();
    if (config.locked) {
        return NextResponse.json({ error: 'Roster is locked. Unlock to sync from merger.' }, { status: 409 });
    }

    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }
    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const action = record.action;

    if (action === 'prune-duplicate-teams') {
        const supabase = getSupabaseAdmin();
        const result = await pruneDuplicateTeamsOnPlatform(supabase);
        const saved = await loadFinalTeams();
        const nextConfig = await loadFinalTeamsConfig();
        return NextResponse.json({
            success: true,
            config: nextConfig,
            teams: saved,
            teamCount: saved.length,
            prune: result,
        });
    }

    if (action !== 'sync-from-merger') {
        return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const autoMerge = Boolean(record.autoMerge);
    const manualGroupMap =
        typeof record.manualGroupMap === 'string' ? record.manualGroupMap : null;

    const supabase = getSupabaseAdmin();
    const { data: submissions, error: subErr } = await supabase
        .from('team_registration_submissions')
        .select('id, team_name, members, squad_merge_opt_in, created_at')
        .order('created_at', { ascending: true });

    if (subErr) {
        return NextResponse.json({ error: subErr.message }, { status: 500 });
    }

    let storedHalls: StoredSeminarHallRow[] = [];
    const { data: hallRows } = await supabase
        .from('seminar_hall_assignments')
        .select('assignment_key, seminar_hall, merged_team_name, source_team_names, submission_ids, updated_at');
    if (Array.isArray(hallRows)) {
        storedHalls = hallRows as StoredSeminarHallRow[];
    }

    const existing = await loadFinalTeams();
    const existingByKey = new Map(existing.map((t) => [t.team_key, t]));

    const built = buildFinalTeamsFromMerger(
        (submissions || []) as TeamSubmission[],
        autoMerge,
        manualGroupMap,
        storedHalls,
        existingByKey
    );

    await replaceFinalTeams(built);
    const saved = await loadFinalTeams();
    const nextConfig = await loadFinalTeamsConfig();

    return NextResponse.json({
        success: true,
        config: nextConfig,
        teams: saved,
        teamCount: saved.length,
    });
}
