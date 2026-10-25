import type { SupabaseClient } from '@supabase/supabase-js';
import { dedupeFinalTeams, type FinalTeamRecord } from '@/lib/final-teams';
import { submissionIdsToRemoveAsDuplicates } from '@/lib/roster-dedupe';

export type PruneDuplicateTeamsResult = {
  removedSubmissionIds: string[];
  finalTeamsBefore: number;
  finalTeamsAfter: number;
  removedFinalCount: number;
};

export async function pruneDuplicateTeamsOnPlatform(
  supabase: SupabaseClient
): Promise<PruneDuplicateTeamsResult> {
  const { data: submissions, error: subErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members, created_at')
    .order('created_at', { ascending: true });
  if (subErr) throw new Error(subErr.message);

  const removeIds = submissionIdsToRemoveAsDuplicates(submissions ?? []);
  if (removeIds.size > 0) {
    const { error: delErr } = await supabase
      .from('team_registration_submissions')
      .delete()
      .in('id', [...removeIds]);
    if (delErr) throw new Error(delErr.message);
  }

  const { data: hallRows, error: hallErr } = await supabase
    .from('seminar_hall_assignments')
    .select('assignment_key, submission_ids');
  if (hallErr && !String(hallErr.message).includes('does not exist')) {
    throw new Error(hallErr.message);
  }

  if (Array.isArray(hallRows)) {
    for (const row of hallRows) {
      const ids = (row.submission_ids ?? []).filter((id: string) => !removeIds.has(id));
      await supabase
        .from('seminar_hall_assignments')
        .update({ submission_ids: ids, updated_at: new Date().toISOString() })
        .eq('assignment_key', row.assignment_key);
    }
  }

  const { data: finalRows, error: finErr } = await supabase.from('final_teams').select('*').order('sort_order');
  if (finErr) throw new Error(finErr.message);

  const before = finalRows?.length ?? 0;
  const deduped = dedupeFinalTeams((finalRows ?? []) as FinalTeamRecord[]);
  const after = deduped.length;

  const payload = deduped.map((t) => ({
    team_key: t.team_key,
    team_name: t.team_name,
    team_size: t.team_size,
    access_token: t.access_token.trim().toUpperCase(),
    members: t.members,
    source_team_names: t.source_team_names,
    submission_ids: (t.submission_ids ?? []).filter((id) => !removeIds.has(id)),
    seminar_hall: t.seminar_hall,
    sort_order: t.sort_order,
    updated_at: new Date().toISOString(),
  }));

  const { error: delFinErr } = await supabase.from('final_teams').delete().gte('team_key', '');
  if (delFinErr) throw new Error(delFinErr.message);
  if (payload.length > 0) {
    const { error: insFinErr } = await supabase.from('final_teams').insert(payload);
    if (insFinErr) throw new Error(insFinErr.message);
  }

  await supabase
    .from('final_teams_config')
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  return {
    removedSubmissionIds: [...removeIds],
    finalTeamsBefore: before,
    finalTeamsAfter: after,
    removedFinalCount: before - after,
  };
}
