import fs from 'fs';
import path from 'path';
import { getSupabaseAdmin } from '@/lib/supabase';

export type StageBypassRecord = {
  id?: string;
  user_id: string;
  stage_number: number;
  team_name: string | null;
  bypassed_at: string;
  points_awarded: number;
};

const LOCAL_CACHE = path.join(process.cwd(), '.contest-cache', 'stage-bypasses.json');

function readLocal(): StageBypassRecord[] {
  try {
    if (fs.existsSync(LOCAL_CACHE)) {
      const raw = JSON.parse(fs.readFileSync(LOCAL_CACHE, 'utf8'));
      return Array.isArray(raw) ? (raw as StageBypassRecord[]) : [];
    }
  } catch {
    /* ignore */
  }
  return [];
}

function writeLocal(rows: StageBypassRecord[]) {
  try {
    const dir = path.dirname(LOCAL_CACHE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(LOCAL_CACHE, JSON.stringify(rows, null, 2), 'utf8');
  } catch {
    /* ignore */
  }
}

async function tableReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('stage_bypasses').select('id').limit(1);
  if (!error) return true;
  const msg = (error.message || '').toLowerCase();
  return !(msg.includes('does not exist') || msg.includes('could not find'));
}

export async function recordStageBypass(input: {
  user_id: string;
  stage_number: number;
  team_name?: string | null;
}): Promise<StageBypassRecord> {
  const row: StageBypassRecord = {
    user_id: input.user_id,
    stage_number: input.stage_number,
    team_name: input.team_name?.trim() || null,
    bypassed_at: new Date().toISOString(),
    points_awarded: 0,
  };

  if (!(await tableReady())) {
    const all = readLocal().filter(
      (r) => !(r.user_id === row.user_id && r.stage_number === row.stage_number)
    );
    all.push(row);
    writeLocal(all);
    return row;
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('stage_bypasses')
    .upsert(
      {
        user_id: row.user_id,
        stage_number: row.stage_number,
        team_name: row.team_name,
        bypassed_at: row.bypassed_at,
        points_awarded: 0,
      },
      { onConflict: 'user_id,stage_number' }
    )
    .select('*')
    .maybeSingle();

  if (error) {
    const all = readLocal().filter(
      (r) => !(r.user_id === row.user_id && r.stage_number === row.stage_number)
    );
    all.push(row);
    writeLocal(all);
    return row;
  }

  return (data as StageBypassRecord) || row;
}

export async function wasStageBypassed(userId: string, stageNumber: number): Promise<boolean> {
  if (await tableReady()) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase
      .from('stage_bypasses')
      .select('id')
      .eq('user_id', userId)
      .eq('stage_number', stageNumber)
      .maybeSingle();
    if (data) return true;
  }
  return readLocal().some((r) => r.user_id === userId && r.stage_number === stageNumber);
}

export async function loadAllStageBypasses(): Promise<StageBypassRecord[]> {
  if (await tableReady()) {
    const supabase = getSupabaseAdmin();
    const { data } = await supabase.from('stage_bypasses').select('*').order('bypassed_at', {
      ascending: false,
    });
    if (data?.length) return data as StageBypassRecord[];
  }
  return readLocal();
}
