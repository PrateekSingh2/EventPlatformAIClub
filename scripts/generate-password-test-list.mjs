/**
 * Writes apps/web/data/PASSWORD_KEY.test-passwords.json — poolKey → stages 2–12 for QA/bypass checks.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

const main = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data/PASSWORD_KEY.json'), 'utf8'));
const chak = JSON.parse(fs.readFileSync(path.join(ROOT, 'apps/web/data/chakravyuh-password-key.json'), 'utf8'));
const byFolder = new Map();
for (const p of [...(chak.packs || []), ...(main.packs || [])]) {
  if (p.folder) byFolder.set(p.folder, p);
}

const pools = {};
for (const [poolKey, folder] of Object.entries(POOL_MAP)) {
  const pack = byFolder.get(folder);
  if (!pack?.passwords) continue;
  pools[poolKey] = {
    title: pack.title,
    folder,
    stages: pack.passwords,
  };
}

const out = {
  generated_at: new Date().toISOString(),
  note: 'Stage 1 is always unlocked. Bypass and verify-stage-password use these keys per token_archives.storage_path pool.',
  pools,
};

const outPath = path.join(ROOT, 'apps/web/data/PASSWORD_KEY.test-passwords.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log('Wrote', outPath, Object.keys(pools).length, 'pools');
