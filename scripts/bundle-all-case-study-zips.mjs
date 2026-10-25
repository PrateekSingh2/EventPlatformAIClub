/**
 * Bundles all 10 canonical case-study pool ZIPs into one download archive.
 *
 * Usage: node scripts/bundle-all-case-study-zips.mjs
 * Output:
 *   - apps/web/public/downloads/case-study-pool-all-10.zip (site download)
 *   - ~/Downloads/case-study-pool-all-10.zip (local)
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import {
  ZipWriter,
  BlobWriter,
  BlobReader,
  TextReader,
} from '../apps/web/node_modules/@zip.js/zip.js/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PACKS = [
  { key: 'chakravyuh_case_study_01', file: path.join(ROOT, '../docs/chakravyuh/Chakravyuh_Case_Study_01.zip') },
  { key: 'chakravyuh_case_study_02', file: path.join(ROOT, 'apps/web/public/case-study-archive.zip') },
  { key: 'case_study_03_helix_grid', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_03_Helix_Grid.zip') },
  { key: 'case_study_04_mumbai_mint', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_04_Mumbai_Mint.zip') },
  { key: 'case_study_05_packet_forge', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_05_Packet_Forge.zip') },
  { key: 'case_study_06_satellite_kite', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_06_Satellite_Kite.zip') },
  { key: 'case_study_07_biolab_delta', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_07_BioLab_Delta.zip') },
  { key: 'case_study_08_tradewind', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_08_TradeWind.zip') },
  { key: 'case_study_09_cloudcastle', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_09_CloudCastle.zip') },
  { key: 'case_study_10_ridge_protocol', file: path.join(ROOT, 'examples/case-studies/packs/Case_Study_10_Ridge_Protocol.zip') },
];

const OUT_NAME = 'case-study-pool-all-10.zip';
const PUBLIC_DIR = path.join(ROOT, 'apps/web/public/downloads');

async function main() {
  const missing = PACKS.filter((p) => !fs.existsSync(p.file));
  if (missing.length) {
    console.error('Missing source ZIP(s):');
    for (const m of missing) console.error(`  - ${m.key}: ${m.file}`);
    process.exit(1);
  }

  const zw = new ZipWriter(new BlobWriter('application/zip'));
  const manifest = [`Case study pool bundle — ${PACKS.length} archives`, `Generated: ${new Date().toISOString()}`, ''];

  for (const pack of PACKS) {
    const buf = fs.readFileSync(pack.file);
    const innerName = path.basename(pack.file);
    const entryName = `pool/${pack.key}/${innerName}`;
    await zw.add(entryName, new BlobReader(new Blob([buf])));
    manifest.push(`${pack.key} → pool/${pack.key}/${innerName} (${buf.length} bytes)`);
  }

  manifest.push('', 'Upload individual files via Admin → Challenge Stages → pool, or use upload-case-study-pool.mjs.');
  await zw.add('README.txt', new TextReader(manifest.join('\n')));

  const blob = await zw.close();
  const buffer = Buffer.from(await blob.arrayBuffer());

  fs.mkdirSync(PUBLIC_DIR, { recursive: true });
  const publicPath = path.join(PUBLIC_DIR, OUT_NAME);
  fs.writeFileSync(publicPath, buffer);

  const downloadsPath = path.join(os.homedir(), 'Downloads', OUT_NAME);
  fs.writeFileSync(downloadsPath, buffer);

  console.log(`Wrote ${publicPath} (${buffer.length} bytes)`);
  console.log(`Wrote ${downloadsPath}`);
  console.log(`Download URL (after deploy): /downloads/${OUT_NAME}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
