/**
 * Backfill stage_passwords for all token_archives from PASSWORD_KEY + storage_path pool key.
 * Usage: node scripts/backfill-stage-passwords-from-pool.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

config({ path: path.join(ROOT, 'apps/web/.env.local') });

// Keep in sync with apps/web/src/lib/case-study-password-keys.ts
const POOL_MAP = {
  chakravyuh_case_study_01: 'Chakravyuh_Case_Study_01',
  chakravyuh_case_study_02: 'Chakravyuh_Case_Study_02',
  case_study_03_helix_grid: 'Case_Study_03_Helix_Grid',
  case_study_04_mumbai_mint: 'Case_Study_04_Mumbai_Mint',
  case_study_05_packet_forge: 'Case_Study_05_Packet_Forge',
  case_study_06_satellite_kite: 'Case_Study_06_Satellite_Kite',
  case_study_07_biolab_delta: 'Case_Study_07_BioLab_Delta',
  case_study_08_tradewind: 'Case_Study_08_TradeWind',
  case_study_09_cloudcastle: 'Case_Study_09_CloudCastle',
  case_study_10_ridge_protocol: 'Case_Study_10_Ridge_Protocol',
};

const keys = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data/PASSWORD_KEY.json'), 'utf8'));
const chak = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data/chakravyuh-password-key.json'), 'utf8'));
const allPacks = [...chak.packs, ...keys.packs];

function poolKeyFromPath(storagePath) {
  const m = String(storagePath).match(/case-study-pool\/([^/]+)\/archive\.zip/i);
  return m ? m[1] : null;
}

function passwordsForPool(poolKey) {
  const folder = POOL_MAP[poolKey];
  if (!folder) return null;
  const pack = allPacks.find((p) => p.folder === folder);
  if (!pack?.passwords) return null;
  const rows = [];
  for (let s = 2; s <= 12; s++) {
    const pw = pack.passwords[String(s)];
    if (!pw) return null;
    rows.push({ stage_number: s, password: pw });
  }
  return rows;
}

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const { data: archives } = await sb.from('token_archives').select('id, access_token, storage_path');
let updated = 0;
for (const a of archives || []) {
  const pk = poolKeyFromPath(a.storage_path);
  if (!pk) continue;
  const pws = passwordsForPool(pk);
  if (!pws) continue;
  await sb.from('stage_passwords').delete().eq('token_archive_id', a.id);
  const { error } = await sb.from('stage_passwords').insert(
    pws.map((r) => ({ token_archive_id: a.id, ...r }))
  );
  if (error) console.warn(a.access_token, error.message);
  else updated++;
}
console.log('Backfilled stage_passwords for', updated, 'archives of', archives?.length || 0);
