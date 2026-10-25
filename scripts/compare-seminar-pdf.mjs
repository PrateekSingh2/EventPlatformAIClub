/**
 * Compare seminar hall PDF export vs current form + Team Merger logic.
 * Usage: node scripts/compare-seminar-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// Dynamic import TS merger (via tsx subprocess) — use compiled approach: shell tsx file
import { spawnSync } from 'child_process';

const pdfTeams = {
  SH3: `404 Not Found
BACARDÍ X Ananya Pandey X Palak Sharma X rajeev sharma
Black cover
Celsia X PromptX
Chambal ke Daku X Bit by bit
Cipher syndicate
Clan X Solo X Go Solo X Code slayer
CRAFTER's
Duo X GPU KE GUNDE
Foundation x X dual bytes
GPU Ke Gunde X CodeLobsters
HackAI X Clavicle
Lol X Brainbyte
Mech X Honeycomb
One piece X Squad busters
Out of options
Pixelverse X Thunder byte
Punisher X Team End
Skypixel
SOMYA
Team Horizon X TEAM DUALITY
Team kannu X Tech coder X TeamDevelopers X Rcb
Team rocket X Paradox
Team Spartan X Chambal ke cheete X Scouts regiment
Technicia
THE DOMAIN EXPLORERS
tic tac toe X Mahak lauvanshi X Random X PIXELS
Warriors X Shreyansh Thapak
Xyz X RCB`
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
  SH7: `Prompt Pioneers
Avengers X Brazzers
Black clover X Default
Bro Code
Chalu Pandey
Chita X Team Vanta
CIPHER SYNDICATE
Codex X The wizard
DECODER
Et squad
free fire X The firebolts
Hack titans X Team alpha
LOL
Loop X X Lobsters-codes🦀
Nutri Scan AI X Gungun Sharma, Gauri Bhadouriya
Orion
PARADOX X Project vanta
Pushpendra X Rangers
SOLVANTA X Scylla
Synapse Squad
Team innovators
Team Phoenix
Team Rocket X Void coders
Tech builders
THE SCAVENGERS
Tom and Jerry X Average
Web maker X 5'5 X Parallax X Naitik`
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean),
};

function norm(s) {
  return s
    .replace(/^•\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function diffHall(label, computed, expected) {
  const cn = new Set(computed.map(norm));
  const missing = expected.filter((t) => !cn.has(norm(t)));
  const extra = computed.filter((t) => !expected.map(norm).includes(norm(t)));
  console.log(`\n=== ${label} ===`);
  console.log(`PDF: ${expected.length} teams | Computed: ${computed.length}`);
  if (missing.length === 0 && extra.length === 0) {
    console.log('MATCH (names align after normalize)');
    return true;
  }
  if (missing.length) {
    console.log(`Missing from computed (${missing.length}):`);
    for (const m of missing) console.log(`  - ${m}`);
  }
  if (extra.length) {
    console.log(`Extra in computed (${extra.length}):`);
    for (const e of extra) console.log(`  + ${e}`);
  }
  return false;
}

const runner = path.join(ROOT, 'scripts', '_seminar-hall-compute.ts');
const out = spawnSync(
  'npx',
  ['--yes', 'tsx', runner],
  { cwd: path.join(ROOT, 'apps/web'), encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }
);
if (out.status !== 0) {
  console.error(out.stderr || out.stdout);
  process.exit(1);
}
const computed = JSON.parse(out.stdout.trim());

console.log('Form submissions:', computed.submissionCount);
console.log('Merge groups (pack-all-4 manual):', computed.groupCount);

diffHall('SH3', computed.byHall.SH3, pdfTeams.SH3);
diffHall('SH7', computed.byHall.SH7, pdfTeams.SH7);

const allPdf = [...pdfTeams.SH3, ...pdfTeams.SH7];
const allComp = [...computed.byHall.SH3, ...computed.byHall.SH7];
const pdfSet = new Set(allPdf.map(norm));
const compSet = new Set(allComp.map(norm));
console.log('\n=== Overall ===');
console.log('PDF total rows:', allPdf.length, '| Computed:', allComp.length);
console.log('In PDF not in pack4 export:', allPdf.filter((t) => !compSet.has(norm(t))).length);
console.log('In pack4 export not in PDF:', allComp.filter((t) => !pdfSet.has(norm(t))).length);

if (computed.autoVsPack) {
  console.log('\nNote: auto-merge group count:', computed.autoVsPack.autoGroups);
}
