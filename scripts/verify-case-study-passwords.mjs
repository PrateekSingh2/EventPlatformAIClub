/**
 * Verifies every PASSWORD_KEY.json stage 2–12 password against pack ZIPs (zip.js).
 * Exit 0 only if all packs pass. Regenerates apps/web/data/PASSWORD_KEY.test-report.json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BlobReader,
  BlobWriter,
  ZipReader,
} from '../apps/web/node_modules/@zip.js/zip.js/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PACK_FILES = [
  {
    poolKey: 'chakravyuh_case_study_01',
    chainFormat: true,
    file: [
      path.join(ROOT, 'examples/case-studies/packs/Chakravyuh_Case_Study_01.zip'),
      path.join(ROOT, '../docs/chakravyuh/Chakravyuh_Case_Study_01.zip'),
    ].find((p) => fs.existsSync(p)),
  },
  {
    poolKey: 'chakravyuh_case_study_02',
    chainFormat: true,
    file: path.join(ROOT, 'apps/web/public/case-study-archive.zip'),
  },
  { poolKey: 'case_study_03_helix_grid', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_03_Helix_Grid.zip') },
  { poolKey: 'case_study_04_mumbai_mint', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_04_Mumbai_Mint.zip') },
  { poolKey: 'case_study_05_packet_forge', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_05_Packet_Forge.zip') },
  { poolKey: 'case_study_06_satellite_kite', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_06_Satellite_Kite.zip') },
  { poolKey: 'case_study_07_biolab_delta', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_07_BioLab_Delta.zip') },
  { poolKey: 'case_study_08_tradewind', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_08_TradeWind.zip') },
  { poolKey: 'case_study_09_cloudcastle', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_09_CloudCastle.zip') },
  { poolKey: 'case_study_10_ridge_protocol', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_10_Ridge_Protocol.zip') },
];

const POOL_KEY_TO_FOLDER = {
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

async function entryToBuffer(entry, password) {
  const blob = await entry.getData(new BlobWriter('application/zip'), password ? { password } : undefined);
  return Buffer.from(await blob.arrayBuffer());
}

async function verifyTree(buffer, passwords, failures, prefix = '') {
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));
  for (const entry of await reader.getEntries()) {
    if (entry.directory) continue;
    const name = prefix + entry.filename;
    if (/\.zip$/i.test(entry.filename) && !entry.encrypted) {
      await verifyTree(await entryToBuffer(entry), passwords, failures, `${name}!`);
      continue;
    }
    if (entry.encrypted && /STAGE_(\d{2})\.zip/i.test(entry.filename)) {
      const m = entry.filename.match(/STAGE_(\d{2})\.zip/i);
      const stageNum = m ? Number(m[1]) : null;
      const pw = stageNum != null ? passwords[String(stageNum)] : null;
      if (!pw) {
        failures.push({ where: name, stage: stageNum, error: 'missing JSON password' });
        continue;
      }
      try {
        const nested = await entryToBuffer(entry, pw);
        await verifyTree(nested, passwords, failures, `${name}!`);
      } catch (e) {
        failures.push({ where: name, stage: stageNum, password: pw, error: e.message || String(e) });
      }
    }
  }
  await reader.close();
}

function loadKeyFile() {
  const main = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'apps/web/data/PASSWORD_KEY.json'), 'utf8')
  );
  const chakPath = path.join(ROOT, 'apps/web/data/chakravyuh-password-key.json');
  if (fs.existsSync(chakPath)) {
    const chak = JSON.parse(fs.readFileSync(chakPath, 'utf8'));
    const seen = new Set((main.packs || []).map((p) => p.folder));
    for (const p of chak.packs || []) {
      if (p.folder && !seen.has(p.folder)) main.packs.unshift(p);
    }
  }
  return main;
}

/** Chakravyuh packs: STAGE_02.zip is plain at root; stage-2 password decrypts inner files (not nested STAGE_03 with stage-3 key). */
async function verifyChakravyuhChain(buffer, passwords, failures, poolKey) {
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));
  const pw2 = passwords['2'];
  if (!pw2) {
    failures.push({ poolKey, error: 'missing stage 2 password in JSON' });
    await reader.close();
    return;
  }
  for (const entry of await reader.getEntries()) {
    if (entry.directory || !/STAGE_02\.zip/i.test(entry.filename)) continue;
    const stage2Buf = await entryToBuffer(entry);
    const inner = new ZipReader(new BlobReader(new Blob([stage2Buf])));
    let checked = 0;
    for (const e2 of await inner.getEntries()) {
      if (e2.directory || !e2.encrypted || /\.zip$/i.test(e2.filename)) continue;
      try {
        await entryToBuffer(e2, pw2);
        checked++;
        break;
      } catch (e) {
        failures.push({ poolKey, where: e2.filename, password: pw2, error: e.message || String(e) });
      }
    }
    if (checked === 0) {
      failures.push({ poolKey, error: 'no encrypted stage-2 files verified inside STAGE_02.zip' });
    }
    await inner.close();
    break;
  }
  await reader.close();
}

async function main() {
  const keys = loadKeyFile();
  const report = { verified_at: new Date().toISOString(), packs: [], failures: [] };

  for (const { poolKey, file, chainFormat } of PACK_FILES) {
    const folder = POOL_KEY_TO_FOLDER[poolKey];
    const pack = keys.packs.find((p) => p.folder === folder);
    if (!pack) {
      report.failures.push({ poolKey, error: 'no PASSWORD_KEY pack entry' });
      continue;
    }
    if (!file || !fs.existsSync(file)) {
      report.failures.push({ poolKey, file: file || null, error: 'missing zip file' });
      continue;
    }
    const before = report.failures.length;
    if (chainFormat) {
      await verifyChakravyuhChain(fs.readFileSync(file), pack.passwords, report.failures, poolKey);
    } else {
      await verifyTree(fs.readFileSync(file), pack.passwords, report.failures);
    }
    report.packs.push({
      poolKey,
      title: pack.title,
      folder,
      passwords: pack.passwords,
      ok: report.failures.length === before,
    });
  }

  const outPath = path.join(ROOT, 'apps/web/data/PASSWORD_KEY.test-report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`Verified ${report.packs.filter((p) => p.ok).length}/${report.packs.length} packs`);
  if (report.failures.length) {
    console.error('Failures:', JSON.stringify(report.failures, null, 2));
    process.exit(1);
  }
  console.log('All case-study passwords match ZIP encryption.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
