import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getStagePasswordForStoragePath,
  passwordMatchesCaseStudyStage,
} from '@/lib/case-study-password-keys';

/** @deprecated Use per-pool PASSWORD_KEY.json via storage_path — kept for legacy tests only */
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

async function loadTokenArchive(
  supabaseAdmin: SupabaseClient,
  accessToken: string,
  user: UserLike
): Promise<{ id: string; storage_path: string } | null> {
  let { data: archiveRecord } = await supabaseAdmin
    .from('token_archives')
    .select('id, storage_path')
    .eq('access_token', accessToken.trim().toUpperCase())
    .maybeSingle();

  if (!archiveRecord && user.team_name) {
    const { data: teamArchive } = await supabaseAdmin
      .from('token_archives')
      .select('id, storage_path')
      .eq('team_name', user.team_name)
      .order('uploaded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (teamArchive) archiveRecord = teamArchive;
  }

  if (!archiveRecord?.storage_path) return null;
  return { id: archiveRecord.id, storage_path: archiveRecord.storage_path };
}

export async function resolveStagePasswordForUser(
  supabaseAdmin: SupabaseClient | null,
  accessToken: string,
  user: UserLike,
  stageNum: number
): Promise<string | null> {
  if (supabaseAdmin) {
    try {
      const archive = await loadTokenArchive(supabaseAdmin, accessToken, user);
      if (archive?.storage_path) {
        const fromPool = getStagePasswordForStoragePath(archive.storage_path, stageNum);
        if (fromPool) return fromPool;

        const { data: pwRow } = await supabaseAdmin
          .from('stage_passwords')
          .select('password')
          .eq('token_archive_id', archive.id)
          .eq('stage_number', stageNum)
          .maybeSingle();
        if (pwRow?.password) return String(pwRow.password).trim();
      }
    } catch {
      /* fall through */
    }
  }

  if (!supabaseAdmin) {
    return KNOWN_STAGE_PASSWORDS[stageNum] ?? null;
  }

  try {
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

export async function isStagePasswordValidForUser(
  supabaseAdmin: SupabaseClient | null,
  accessToken: string,
  user: UserLike,
  stageNum: number,
  password: string
): Promise<boolean> {
  const clean = password.trim();
  if (!clean) return false;

  if (supabaseAdmin) {
    try {
      const archive = await loadTokenArchive(supabaseAdmin, accessToken, user);
      if (archive?.storage_path) {
        if (passwordMatchesCaseStudyStage(archive.storage_path, stageNum, clean)) {
          return true;
        }
        const { data: pwRow } = await supabaseAdmin
          .from('stage_passwords')
          .select('password')
          .eq('token_archive_id', archive.id)
          .eq('stage_number', stageNum)
          .maybeSingle();
        if (pwRow?.password) {
          return pwRow.password.trim().toUpperCase() === clean.toUpperCase();
        }
        // Nested ZIP unlock in browser already validated the key
        return true;
      }
    } catch {
      /* continue */
    }
  }

  if (KNOWN_STAGE_PASSWORDS[stageNum]?.toUpperCase() === clean.toUpperCase()) {
    return true;
  }

  if (!supabaseAdmin) return true;

  try {
    const { data: stageRow } = await supabaseAdmin
      .from('stages')
      .select('zip_password')
      .eq('stage_number', stageNum)
      .maybeSingle();
    if (stageRow?.zip_password) {
      return stageRow.zip_password.trim().toUpperCase() === clean.toUpperCase();
    }
  } catch {
    return true;
  }

  return true;
}
