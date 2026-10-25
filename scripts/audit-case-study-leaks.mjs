/**
 * Scans all 10 pool case-study ZIPs (including nested STAGE_XX.zip) for plaintext unlock leaks.
 * Exit 1 if any forbidden pattern or known password appears in team-facing entries.
 *
 * Usage: node scripts/audit-case-study-leaks.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  BlobReader,
  BlobWriter,
  ZipReader,
  TextWriter,
} from '../apps/web/node_modules/@zip.js/zip.js/index.js';

async function entryToBuffer(entry, password) {
  const blob = await entry.getData(new BlobWriter('application/zip'), password ? { password } : undefined);
  return Buffer.from(await blob.arrayBuffer());
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PACKS = [
  path.join(ROOT, '../docs/chakravyuh/Chakravyuh_Case_Study_01.zip'),
  path.join(ROOT, 'apps/web/public/case-study-archive.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_03_Helix_Grid.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_04_Mumbai_Mint.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_05_Packet_Forge.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_06_Satellite_Kite.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_07_BioLab_Delta.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_08_TradeWind.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_09_CloudCastle.zip'),
  path.join(ROOT, 'examples/case-studies/packs/Case_Study_10_Ridge_Protocol.zip'),
];

const keyPath = path.join(ROOT, 'examples/case-studies/PASSWORD_KEY.json');

const FORBIDDEN = [
  /\btoken\s*=\s*[A-Z0-9-]+/i,
  /"token"\s*:\s*"[A-Z0-9-]+"/i,
  /\bstring\s*=\s*[A-Z0-9-]+/i,
  /\bthe password is\b/i,
  /Flag:\s*`[A-Z0-9-]+`/i,
  /Finale token:\s*`[A-Z0-9-]+`/i,
];

function finaleTokensForPack(pack) {
  const p12 = pack?.passwords?.['12'] ?? pack?.passwords?.[12];
  return p12 ? [p12] : [];
}

async function readEntryText(entry) {
  const tw = new TextWriter();
  await entry.getData(tw);
  return tw.getData();
}

async function scanZip(buffer, opts, depth = 0, prefix = '') {
  const { zipPath, stagePasswords, finalePasswords } = opts;
  const issues = [];
  const reader = new ZipReader(new BlobReader(new Blob([buffer])));
  const entries = await reader.getEntries();
  for (const entry of entries) {
    if (entry.directory) continue;
    const name = `${prefix}${entry.filename}`;
    if (/\.zip$/i.test(entry.filename) && !entry.encrypted) {
      const nestedBuf = await entryToBuffer(entry);
      issues.push(...(await scanZip(nestedBuf, opts, depth + 1, `${name}!`)));
      continue;
    }
    if (entry.encrypted) {
      const stageMatch = entry.filename.match(/STAGE_(\d{2})\.zip/i);
      const stageNum = stageMatch ? Number(stageMatch[1]) : null;
      const pw =
        stageNum != null
          ? stagePasswords?.[String(stageNum)] ?? stagePasswords?.[stageNum]
          : null;
      if (!pw) {
        if (depth === 0) {
          issues.push({ zip: zipPath, entry: name, reason: 'encrypted nested zip without password map' });
        }
        continue;
      }
      const nestedBuf = await entryToBuffer(entry, pw);
      issues.push(...(await scanZip(nestedBuf, opts, depth + 1, `${name}!`)));
      continue;
    }
    let text;
    try {
      text = await readEntryText(entry);
    } catch {
      continue;
    }
    if (typeof text !== 'string') continue;
    for (const re of FORBIDDEN) {
      if (re.test(text)) {
        issues.push({ zip: zipPath, entry: name, reason: `forbidden pattern ${re}` });
        break;
      }
    }
    for (const pw of finalePasswords) {
      if (text.includes(pw)) {
        issues.push({ zip: zipPath, entry: name, reason: `finale token plaintext: ${pw}` });
        break;
      }
    }
  }
  await reader.close();
  return issues;
}

function passwordsForFile(zipPath, allKeys) {
  const base = path.basename(zipPath);
  const pack = allKeys.packs.find((p) => p.file === base || zipPath.endsWith(p.file));
  if (pack?.passwords) return pack.passwords;
  if (base.includes('Chakravyuh_Case_Study_01')) {
    return allKeys.packs.find((p) => p.folder?.includes('01'))?.passwords;
  }
  if (base === 'case-study-archive.zip') {
    return allKeys.packs.find((p) => p.folder?.includes('02') || p.file?.includes('02'))?.passwords;
  }
  return null;
}

async function main() {
  const allKeys = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
  const allIssues = [];

  for (const zipPath of PACKS) {
    if (!fs.existsSync(zipPath)) {
      console.warn(`SKIP missing ${zipPath}`);
      continue;
    }
    const packMeta = allKeys.packs.find(
      (p) =>
        zipPath.endsWith(p.file) ||
        (p.folder && zipPath.includes(p.folder)),
    );
    const pwMap = passwordsForFile(zipPath, allKeys) ?? packMeta?.passwords;
    const buf = fs.readFileSync(zipPath);
    const issues = await scanZip(buf, {
      zipPath,
      stagePasswords: pwMap,
      finalePasswords: finaleTokensForPack(packMeta ?? { passwords: pwMap }),
    });
    allIssues.push(...issues);
    if (!pwMap) {
      console.warn(`WARN no password map for ${zipPath} — nested encrypted entries may be skipped`);
    }
  }

  if (allIssues.length === 0) {
    console.log('OK — no plaintext unlock leaks detected in pool ZIPs.');
    return;
  }
  console.error(`FAIL — ${allIssues.length} issue(s):`);
  for (const i of allIssues) {
    console.error(`  ${i.entry}: ${i.reason}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
