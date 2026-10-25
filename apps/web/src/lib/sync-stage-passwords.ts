import type { SupabaseClient } from '@supabase/supabase-js';
import {
  passwordArrayForPoolKey,
  poolKeyFromStoragePath,
} from '@/lib/case-study-password-keys';

export type SyncStagePasswordsResult = {
  totalArchives: number;
  updated: number;
  skippedNoPool: number;
  skippedNoKeys: number;
  errors: Array<{ accessToken?: string; archiveId?: string; message: string }>;
};

function passwordRowsForArchive(
  tokenArchiveId: string,
  poolKey: string
): Array<{ token_archive_id: string; stage_number: number; password: string }> | null {
  const passwords = passwordArrayForPoolKey(poolKey);
  if (!passwords?.length) return null;
  return passwords.map((password, idx) => ({
    token_archive_id: tokenArchiveId,
    stage_number: idx + 2,
    password: password.trim(),
  }));
}

/**
 * Writes stages 2–12 into `stage_passwords` for each token archive, derived from
 * `storage_path` → case-study pool key → PASSWORD_KEY.json (bundled + data files).
 */
export async function syncStagePasswordsFromPoolKeys(
  supabaseAdmin: SupabaseClient,
  options?: { archiveIds?: string[] }
): Promise<SyncStagePasswordsResult> {
  const result: SyncStagePasswordsResult = {
    totalArchives: 0,
    updated: 0,
    skippedNoPool: 0,
    skippedNoKeys: 0,
    errors: [],
  };

  let query = supabaseAdmin.from('token_archives').select('id, access_token, storage_path');
  if (options?.archiveIds?.length) {
    query = query.in('id', options.archiveIds);
  }

  const { data: archives, error } = await query;
  if (error) {
    result.errors.push({ message: error.message });
    return result;
  }

  result.totalArchives = archives?.length ?? 0;

  for (const archive of archives || []) {
    const poolKey = poolKeyFromStoragePath(archive.storage_path || '');
    if (!poolKey) {
      result.skippedNoPool += 1;
      continue;
    }

    const rows = passwordRowsForArchive(archive.id, poolKey);
    if (!rows) {
      result.skippedNoKeys += 1;
      result.errors.push({
        accessToken: archive.access_token,
        archiveId: archive.id,
        message: `No PASSWORD_KEY entries for pool ${poolKey}`,
      });
      continue;
    }

    const { error: delErr } = await supabaseAdmin
      .from('stage_passwords')
      .delete()
      .eq('token_archive_id', archive.id);
    if (delErr) {
      result.errors.push({
        accessToken: archive.access_token,
        archiveId: archive.id,
        message: delErr.message,
      });
      continue;
    }

    const { error: insErr } = await supabaseAdmin.from('stage_passwords').insert(rows);
    if (insErr) {
      result.errors.push({
        accessToken: archive.access_token,
        archiveId: archive.id,
        message: insErr.message,
      });
      continue;
    }

    result.updated += 1;
  }

  return result;
}
