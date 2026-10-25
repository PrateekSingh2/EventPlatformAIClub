import type { SupabaseClient } from '@supabase/supabase-js';

/** Nested case-study unlock passwords (fallback when DB row missing). */
export const KNOWN_STAGE_PASSWORDS: Record<number, string> = {
  2: 'SEV2-PAYMENT-1431',
  3: '143401-143210',
  4: 'V2PAY-504-31',
  5: 'P7-O1840927-C2',
  6: 'HOT-7-M-CHAIPLANET-92',
  7: 'POLL-2-105-228',
  8: 'DUP-31-89920',
  9: 'A1F9C3E-20261010-2',
  10: 'CFG-CMP-LCK-LAG-RBL-DUP',
  11: 'A2-A3-A6-A9',
  12: 'H4-CONFIRMED',
};

type UserLike = { id: string; team_name?: string | null };

export async function resolveStagePasswordForUser(
  supabaseAdmin: SupabaseClient | null,
  accessToken: string,
  user: UserLike,
  stageNum: number
): Promise<string | null> {
  if (KNOWN_STAGE_PASSWORDS[stageNum]) {
    return KNOWN_STAGE_PASSWORDS[stageNum];
  }

  if (!supabaseAdmin) return null;

  try {
    let { data: archiveRecord } = await supabaseAdmin
      .from('token_archives')
      .select('id')
      .eq('access_token', accessToken)
      .maybeSingle();

    if (!archiveRecord && user.team_name) {
      const { data: teamArchive } = await supabaseAdmin
        .from('token_archives')
        .select('id')
        .eq('team_name', user.team_name)
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (teamArchive) archiveRecord = teamArchive;
    }

    if (archiveRecord) {
      const { data: pwRow } = await supabaseAdmin
        .from('stage_passwords')
        .select('password')
        .eq('token_archive_id', archiveRecord.id)
        .eq('stage_number', stageNum)
        .maybeSingle();
      if (pwRow?.password) return String(pwRow.password).trim();
    }

    const { data: stageRow } = await supabaseAdmin
      .from('stages')
      .select('zip_password')
      .eq('stage_number', stageNum)
      .maybeSingle();
    if (stageRow?.zip_password) return String(stageRow.zip_password).trim();
  } catch {
    return null;
  }

  return null;
}
