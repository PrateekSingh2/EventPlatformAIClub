/**
 * Sync stage_passwords for bypass from PASSWORD_KEY + token_archives.storage_path.
 * Run: npx tsx scripts/sync-stage-passwords-db.ts (from apps/web)
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(here, '../.env.local') });

async function main() {
  const { getSupabaseAdmin } = await import('../src/lib/supabase');
  const { syncStagePasswordsFromPoolKeys } = await import('../src/lib/sync-stage-passwords');

  const result = await syncStagePasswordsFromPoolKeys(getSupabaseAdmin());
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0 && result.updated === 0) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
