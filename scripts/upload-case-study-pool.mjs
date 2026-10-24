/**
 * Upload case-study ZIPs to Supabase case-study-pool/ (unassigned; no token_archives commit).
 *
 * Usage: node scripts/upload-case-study-pool.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const BUCKET = 'stages';

/** Stable pool folder names (visible in admin pool list). */
const POOL_UPLOADS = [
  {
    poolKey: 'chakravyuh_case_study_01',
    file: path.join(ROOT, '../docs/chakravyuh/Chakravyuh_Case_Study_01.zip'),
  },
  {
    poolKey: 'chakravyuh_case_study_02',
    file: path.join(ROOT, 'apps/web/public/case-study-archive.zip'),
  },
  {
    poolKey: 'case_study_03_helix_grid',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_03_Helix_Grid.zip'),
  },
  {
    poolKey: 'case_study_04_mumbai_mint',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_04_Mumbai_Mint.zip'),
  },
  {
    poolKey: 'case_study_05_packet_forge',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_05_Packet_Forge.zip'),
  },
  {
    poolKey: 'case_study_06_satellite_kite',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_06_Satellite_Kite.zip'),
  },
  {
    poolKey: 'case_study_07_biolab_delta',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_07_BioLab_Delta.zip'),
  },
  {
    poolKey: 'case_study_08_tradewind',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_08_TradeWind.zip'),
  },
  {
    poolKey: 'case_study_09_cloudcastle',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_09_CloudCastle.zip'),
  },
  {
    poolKey: 'case_study_10_ridge_protocol',
    file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_10_Ridge_Protocol.zip'),
  },
];

const CANONICAL_POOL_KEYS = new Set(POOL_UPLOADS.map((u) => u.poolKey));

function loadEnv() {
  const envPath = path.join(ROOT, 'apps/web/.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

async function ensureBucket(supabase) {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET || b.id === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: 52428800,
      allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
    });
    if (error) console.warn('createBucket:', error.message);
  }
}

async function pruneNonCanonicalPoolEntries(supabase) {
  const { data: entries, error: listErr } = await supabase.storage.from(BUCKET).list('case-study-pool', {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (listErr) throw new Error(listErr.message);

  const extras = (entries || [])
    .map((e) => e.name)
    .filter((name) => name && !name.startsWith('.') && !CANONICAL_POOL_KEYS.has(name));

  for (const folder of extras) {
    const path = `case-study-pool/${folder}/archive.zip`;
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) console.error('REMOVE FAIL', folder, error.message);
    else console.log('REMOVED', folder);
  }
  return extras.length;
}

async function main() {
  const pruneOnly = process.argv.includes('--prune-only');
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase credentials missing in apps/web/.env.local');

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  await ensureBucket(supabase);

  if (pruneOnly) {
    const removed = await pruneNonCanonicalPoolEntries(supabase);
    console.log(`Pruned ${removed} extra pool folder(s).`);
  } else {
    let ok = 0;
    for (const item of POOL_UPLOADS) {
      if (!fs.existsSync(item.file)) {
        console.error('MISSING', item.file);
        continue;
      }
      const buf = fs.readFileSync(item.file);
      const storagePath = `case-study-pool/${item.poolKey}/archive.zip`;
      const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buf, {
        upsert: true,
        contentType: 'application/zip',
      });
      if (error) {
        console.error('FAIL', item.poolKey, error.message);
      } else {
        console.log('OK', item.poolKey, `(${buf.length} bytes) → ${storagePath}`);
        ok++;
      }
    }
    const removed = await pruneNonCanonicalPoolEntries(supabase);
    if (removed) console.log(`\nPruned ${removed} non-canonical pool folder(s).`);
    console.log(`\nUploaded ${ok}/${POOL_UPLOADS.length} (unassigned — assign from admin Stage Builder pool).`);
  }

  const { data: entries, error: listErr } = await supabase.storage.from(BUCKET).list('case-study-pool', {
    limit: 100,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (listErr) console.warn('list:', listErr.message);
  else {
    const names = (entries || []).map((e) => e.name).filter(Boolean);
    console.log(`\nPool folders (${names.length}):`, names.join(', '));
    if (names.length !== CANONICAL_POOL_KEYS.size) {
      console.warn(`Expected exactly ${CANONICAL_POOL_KEYS.size} folders.`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
