import { getSupabaseAdmin } from '@/lib/supabase';
import { overlayUserRosterFromFinalTeams, type FinalTeamRecord, type FinalTeamsConfig } from '@/lib/final-teams';

export async function isFinalTeamsTableReady(): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from('final_teams').select('id').limit(1);
  if (!error) return true;
  const msg = (error.message || '').toLowerCase();
  return !(msg.includes('does not exist') || msg.includes('could not find'));
}

export async function loadFinalTeamsConfig(): Promise<FinalTeamsConfig> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('final_teams_config')
    .select('locked, locked_at, updated_at')
    .eq('id', 1)
    .maybeSingle();

  if (error || !data) {
    return { locked: false, locked_at: null, updated_at: null };
  }
  return {
    locked: Boolean(data.locked),
    locked_at: data.locked_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}

function rowToRecord(row: Record<string, unknown>): FinalTeamRecord {
  return {
    id: String(row.id ?? ''),
    team_key: String(row.team_key ?? ''),
    team_name: String(row.team_name ?? ''),
    team_size: String(row.team_size ?? 'Solo'),
    access_token: String(row.access_token ?? ''),
    members: Array.isArray(row.members) ? (row.members as FinalTeamRecord['members']) : [],
    source_team_names: Array.isArray(row.source_team_names)
      ? (row.source_team_names as string[])
      : [],
    submission_ids: Array.isArray(row.submission_ids) ? (row.submission_ids as string[]) : [],
    seminar_hall: row.seminar_hall != null ? String(row.seminar_hall) : null,
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function loadFinalTeams(): Promise<FinalTeamRecord[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('final_teams')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('team_name', { ascending: true });

  if (error || !data) return [];
  return data.map((row: Record<string, unknown>) => rowToRecord(row));
}

export async function replaceFinalTeams(teams: FinalTeamRecord[]): Promise<void> {
  const supabase = getSupabaseAdmin();
  const { error: delErr } = await supabase.from('final_teams').delete().gte('team_key', '');
  if (delErr) throw new Error(delErr.message);

  if (teams.length === 0) return;

  const payload = teams.map((t, index) => ({
    team_key: t.team_key,
    team_name: t.team_name.trim(),
    team_size: t.team_size,
    access_token: t.access_token.trim().toUpperCase(),
    members: t.members,
    source_team_names: t.source_team_names,
    submission_ids: t.submission_ids,
    seminar_hall: t.seminar_hall,
    sort_order: t.sort_order ?? index,
    updated_at: new Date().toISOString(),
  }));

  const { error: insErr } = await supabase.from('final_teams').insert(payload);
  if (insErr) throw new Error(insErr.message);

  await supabase
    .from('final_teams_config')
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });
}

/** When final roster is locked, align participant rows with canonical team_name / token / size. */
export async function overlayUsersIfFinalTeamsLocked<
  T extends {
    email?: string | null;
    team_name?: string | null;
    team_size?: string | null;
    access_token?: string | null;
  },
>(users: T[]): Promise<T[]> {
  if (!(await isFinalTeamsTableReady())) return users;
  const config = await loadFinalTeamsConfig();
  if (!config.locked) return users;
  const teams = await loadFinalTeams();
  if (teams.length === 0) return users;
  return overlayUserRosterFromFinalTeams(users, teams);
}

export async function setFinalTeamsLocked(locked: boolean): Promise<FinalTeamsConfig> {
  const supabase = getSupabaseAdmin();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('final_teams_config')
    .upsert(
      {
        id: 1,
        locked,
        locked_at: locked ? now : null,
        updated_at: now,
      },
      { onConflict: 'id' }
    )
    .select('locked, locked_at, updated_at')
    .single();

  if (error) throw new Error(error.message);
  return {
    locked: Boolean(data.locked),
    locked_at: data.locked_at ?? null,
    updated_at: data.updated_at ?? null,
  };
}
