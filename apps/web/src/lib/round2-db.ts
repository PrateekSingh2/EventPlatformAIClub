import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';

import type { Round2DraftRoster, Round2WorkflowPhase } from '@/lib/round2-draft';
import { parseDraftRoster } from '@/lib/round2-draft';

export type Round2SelectionState = {
  selected_team_keys: string[];
  pool_assignments: Record<string, string>;
  draft_roster: Round2DraftRoster | null;
  workflow_phase: Round2WorkflowPhase;
  updated_at: string | null;
  source: 'supabase' | 'local';
};

const LOCAL_CACHE_FILE = path.join(process.cwd(), '.contest-cache', 'round2-selection.json');

function readLocalRound2(): Round2SelectionState {
  try {
    if (fs.existsSync(LOCAL_CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_CACHE_FILE, 'utf8')) as {
        selected_team_keys?: string[];
        pool_assignments?: Record<string, string>;
        updated_at?: string | null;
      };
      return {
        selected_team_keys: Array.isArray(raw.selected_team_keys) ? raw.selected_team_keys.map(String) : [],
        pool_assignments:
          raw.pool_assignments && typeof raw.pool_assignments === 'object' ? raw.pool_assignments : {},
        draft_roster: parseDraftRoster((raw as { draft_roster?: unknown }).draft_roster),
        workflow_phase: ((raw as { workflow_phase?: string }).workflow_phase as Round2WorkflowPhase) || 'edit',
        updated_at: raw.updated_at ?? null,
        source: 'local',
      };
    }
  } catch (e) {
    console.warn('[round2] local cache read failed', e);
  }
  return {
    selected_team_keys: [],
    pool_assignments: {},
    draft_roster: null,
    workflow_phase: 'edit',
    updated_at: null,
    source: 'local',
  };
}

function writeLocalRound2(state: Omit<Round2SelectionState, 'source'>) {
  try {
    const dir = path.dirname(LOCAL_CACHE_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      LOCAL_CACHE_FILE,
      JSON.stringify(
        {
          selected_team_keys: state.selected_team_keys,
          pool_assignments: state.pool_assignments,
          draft_roster: state.draft_roster,
          workflow_phase: state.workflow_phase,
          updated_at: state.updated_at,
        },
        null,
        2
      ),
      'utf8'
    );
  } catch (e) {
    console.warn('[round2] local cache write failed', e);
  }
}

export async function isRound2TableReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('round2_selection').select('id').eq('id', 1).maybeSingle();
  if (!error) return true;
  const msg = (error.message || '').toLowerCase();
  return !(msg.includes('does not exist') || msg.includes('could not find'));
}

export async function loadRound2Selection(): Promise<Round2SelectionState> {
  const ready = await isRound2TableReady();
  if (!ready) return readLocalRound2();

  const supabase = getSupabaseAdmin();
  let data: Record<string, unknown> | null = null;
  let error: { message?: string } | null = null;
  const full = await supabase
    .from('round2_selection')
    .select('selected_team_keys, pool_assignments, draft_roster, workflow_phase, updated_at')
    .eq('id', 1)
    .maybeSingle();
  data = full.data as Record<string, unknown> | null;
  error = full.error;

  if (error && (error.message || '').toLowerCase().includes('draft_roster')) {
    const legacy = await supabase
      .from('round2_selection')
      .select('selected_team_keys, pool_assignments, updated_at')
      .eq('id', 1)
      .maybeSingle();
    data = legacy.data as Record<string, unknown> | null;
    error = legacy.error;
  }

  if (error || !data) return readLocalRound2();

  const keys = Array.isArray(data.selected_team_keys)
    ? (data.selected_team_keys as unknown[]).map(String)
    : [];
  const pool =
    data.pool_assignments && typeof data.pool_assignments === 'object' && !Array.isArray(data.pool_assignments)
      ? (data.pool_assignments as Record<string, string>)
      : {};

  const phase = String(data.workflow_phase || 'edit') as Round2WorkflowPhase;

  return {
    selected_team_keys: keys,
    pool_assignments: pool,
    draft_roster: parseDraftRoster(data.draft_roster),
    workflow_phase: phase === 'tokens_ready' || phase === 'ops' ? phase : 'edit',
    updated_at: data.updated_at ? String(data.updated_at) : null,
    source: 'supabase',
  };
}

export async function saveRound2Selection(input: {
  selected_team_keys: string[];
  pool_assignments?: Record<string, string>;
  draft_roster?: Round2DraftRoster | null;
  workflow_phase?: Round2WorkflowPhase;
}): Promise<Round2SelectionState> {
  const updated_at = new Date().toISOString();
  const selected_team_keys = [...new Set(input.selected_team_keys.map(String))];
  const pool_assignments = input.pool_assignments ?? {};
  const draft_roster = input.draft_roster ?? null;
  const workflow_phase = input.workflow_phase ?? 'edit';

  const ready = await isRound2TableReady();
  if (!ready) {
    const state = {
      selected_team_keys,
      pool_assignments,
      draft_roster,
      workflow_phase,
      updated_at,
      source: 'local' as const,
    };
    writeLocalRound2(state);
    return state;
  }

  const supabase = getSupabaseAdmin();
  const payload: Record<string, unknown> = {
    id: 1,
    selected_team_keys,
    pool_assignments,
    updated_at,
    workflow_phase,
  };
  if (draft_roster !== undefined) payload.draft_roster = draft_roster;

  const { error } = await supabase.from('round2_selection').upsert(payload, { onConflict: 'id' });

  if (error) {
    console.warn('[round2] supabase save failed, falling back to local', error.message);
    const state = {
      selected_team_keys,
      pool_assignments,
      draft_roster,
      workflow_phase,
      updated_at,
      source: 'local' as const,
    };
    writeLocalRound2(state);
    return state;
  }

  return {
    selected_team_keys,
    pool_assignments,
    draft_roster,
    workflow_phase,
    updated_at,
    source: 'supabase',
  };
}
