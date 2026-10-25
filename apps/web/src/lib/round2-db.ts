import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';

export type Round2SelectionState = {
  selected_team_keys: string[];
  pool_assignments: Record<string, string>;
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
        updated_at: raw.updated_at ?? null,
        source: 'local',
      };
    }
  } catch (e) {
    console.warn('[round2] local cache read failed', e);
  }
  return { selected_team_keys: [], pool_assignments: {}, updated_at: null, source: 'local' };
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
  const { data, error } = await supabase
    .from('round2_selection')
    .select('selected_team_keys, pool_assignments, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) return readLocalRound2();

  const keys = Array.isArray(data.selected_team_keys)
    ? (data.selected_team_keys as unknown[]).map(String)
    : [];
  const pool =
    data.pool_assignments && typeof data.pool_assignments === 'object' && !Array.isArray(data.pool_assignments)
      ? (data.pool_assignments as Record<string, string>)
      : {};

  return {
    selected_team_keys: keys,
    pool_assignments: pool,
    updated_at: data.updated_at ?? null,
    source: 'supabase',
  };
}

export async function saveRound2Selection(input: {
  selected_team_keys: string[];
  pool_assignments?: Record<string, string>;
}): Promise<Round2SelectionState> {
  const updated_at = new Date().toISOString();
  const selected_team_keys = [...new Set(input.selected_team_keys.map(String))];
  const pool_assignments = input.pool_assignments ?? {};

  const ready = await isRound2TableReady();
  if (!ready) {
    const state = { selected_team_keys, pool_assignments, updated_at, source: 'local' as const };
    writeLocalRound2(state);
    return state;
  }

  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('round2_selection').upsert(
    {
      id: 1,
      selected_team_keys,
      pool_assignments,
      updated_at,
    },
    { onConflict: 'id' }
  );

  if (error) {
    console.warn('[round2] supabase save failed, falling back to local', error.message);
    const state = { selected_team_keys, pool_assignments, updated_at, source: 'local' as const };
    writeLocalRound2(state);
    return state;
  }

  return { selected_team_keys, pool_assignments, updated_at, source: 'supabase' };
}
