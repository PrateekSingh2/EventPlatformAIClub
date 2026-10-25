/**
 * Apply seminar photo manual merges to Supabase (same as admin API apply-photo-merges).
 *
 * Usage: cd apps/web && npx tsx ../../scripts/apply-photo-merges.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { applyPhotoSeminarMerges } from '../apps/web/src/lib/photo-seminar-merges.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const require = createRequire(path.join(repoRoot, 'apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {};
  for (const p of [
    path.join(repoRoot, '.env'),
    path.join(repoRoot, '.env.local'),
    path.join(repoRoot, 'apps/web/.env.local'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  return env;
}

async function main() {
  const fileEnv = loadEnv();
  const env = { ...fileEnv, ...process.env };
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes('your-project-id')) {
    console.error('Set real NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const supabase = createClient(url, key);
  const result = await applyPhotoSeminarMerges(supabase);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
