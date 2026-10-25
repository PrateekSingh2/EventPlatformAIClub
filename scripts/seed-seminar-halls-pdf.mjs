/**
 * Seeds seminar_hall_assignments from the 2026-10-25 PDF baseline + current form merge match.
 * Run migration 011 first (or this script will print the SQL error).
 *
 * Usage: node scripts/seed-seminar-halls-pdf.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { spawnSync } from 'child_process';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

/** PDF export 2026-10-25 — authoritative hall per merged/solo label. */
const PDF_HALL_ROWS = [
  ['SH3', '404 Not Found'],
  ['SH3', 'BACARDÍ X Ananya Pandey X Palak Sharma X rajeev sharma'],
  ['SH3', 'Black cover'],
  ['SH3', 'Celsia X PromptX'],
  ['SH3', 'Chambal ke Daku X Bit by bit'],
  ['SH3', 'Cipher syndicate'],
  ['SH3', 'Clan X Solo X Go Solo X Code slayer'],
  ["SH3", "CRAFTER's"],
  ['SH3', 'Duo X GPU KE GUNDE'],
  ['SH3', 'Foundation x X dual bytes'],
  ['SH3', 'GPU Ke Gunde X CodeLobsters'],
  ['SH3', 'HackAI X Clavicle'],
  ['SH3', 'Lol X Brainbyte'],
  ['SH3', 'Mech X Honeycomb'],
  ['SH3', 'One piece X Squad busters'],
  ['SH3', 'Out of options'],
  ['SH3', 'Pixelverse X Thunder byte'],
  ['SH3', 'Punisher X Team End'],
  ['SH3', 'Skypixel'],
  ['SH3', 'SOMYA'],
  ['SH3', 'Team Horizon X TEAM DUALITY'],
  ['SH3', 'Team kannu X Tech coder X TeamDevelopers X Rcb'],
  ['SH3', 'Team rocket X Paradox'],
  ['SH3', 'Team Spartan X Chambal ke cheete X Scouts regiment'],
  ['SH3', 'Technicia'],
  ['SH3', 'THE DOMAIN EXPLORERS'],
  ['SH3', 'tic tac toe X Mahak lauvanshi X Random X PIXELS'],
  ['SH3', 'Warriors X Shreyansh Thapak'],
  ['SH3', 'Xyz X RCB'],
  ['SH7', 'Prompt Pioneers'],
  ['SH7', 'Avengers X Brazzers'],
  ['SH7', 'Black clover X Default'],
  ['SH7', 'Bro Code'],
  ['SH7', 'Chalu Pandey'],
  ['SH7', 'Chita X Team Vanta'],
  ['SH7', 'CIPHER SYNDICATE'],
  ['SH7', 'Codex X The wizard'],
  ['SH7', 'DECODER'],
  ['SH7', 'Et squad'],
  ['SH7', 'free fire X The firebolts'],
  ['SH7', 'Hack titans X Team alpha'],
  ['SH7', 'LOL'],
  ['SH7', 'Loop X X Lobsters-codes🦀'],
  ['SH7', 'Nutri Scan AI X Gungun Sharma, Gauri Bhadouriya'],
  ['SH7', 'Orion'],
  ['SH7', 'PARADOX X Project vanta'],
  ['SH7', 'Pushpendra X Rangers'],
  ['SH7', 'SOLVANTA X Scylla'],
  ['SH7', 'Synapse Squad'],
  ['SH7', 'Team innovators'],
  ['SH7', 'Team Phoenix'],
  ['SH7', 'Team Rocket X Void coders'],
  ['SH7', 'Tech builders'],
  ['SH7', 'THE SCAVENGERS'],
  ['SH7', 'Tom and Jerry X Average'],
  ["SH7", "Web maker X 5'5 X Parallax X Naitik"],
];

function loadEnv() {
  const paths = [
    path.join(ROOT, '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, 'apps/web/.env.local'),
  ];
  const env = {};
  for (const envPath of paths) {
    if (!fs.existsSync(envPath)) continue;
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!val || val.includes('your-project-id') || val.includes('placeholder')) continue;
      env[m[1]] = val;
    }
  }
  return env;
}

function labelToSourceNames(label) {
  return label
    .split(/\s+X\s+/i)
    .map((p) => p.replace(/^•\s*/, '').trim())
    .filter(Boolean);
}

function buildAssignmentKeyFromNames(names) {
  return names
    .map((n) => n.replace(/^•\s*/, '').replace(/\s+/g, ' ').trim().toLowerCase())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .join('|');
}

async function main() {
  const compute = spawnSync('npx', ['--yes', 'tsx', path.join(ROOT, 'scripts/_seminar-seed-compute.ts')], {
    cwd: path.join(ROOT, 'apps/web'),
    encoding: 'utf8',
  });
  if (compute.status !== 0) {
    console.error(compute.stderr || compute.stdout);
    process.exit(1);
  }
  const { groups } = JSON.parse(compute.stdout.trim());

  function findGroup(label) {
    const parts = labelToSourceNames(label)
      .map((p) => p.toLowerCase())
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return groups.find((g) => {
      const sn = [...g.teamNames].map((n) => n.trim().toLowerCase()).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return sn.length === parts.length && sn.every((n, i) => n === parts[i]);
    });
  }

  const PDF_LABEL_ALIASES = new Map([
    ['Foundation x X dual bytes', 'dual bytes X Foundation x'],
    ['LOL', 'LOL X warriors 3'],
    ['Loop X X Lobsters-codes🦀', 'Lobsters-codes🦀 X Loop X'],
  ]);

  const assignments = [];
  const missing = [];
  for (const [hall, label] of PDF_HALL_ROWS) {
    const lookupLabel = PDF_LABEL_ALIASES.get(label) ?? label;
    const g = findGroup(lookupLabel) ?? findGroup(label);
    const sourceNames = labelToSourceNames(label);
    const assignment_key = g?.assignmentKey ?? buildAssignmentKeyFromNames(sourceNames);
    if (!g) {
      missing.push({ hall, label });
    }
    assignments.push({
      assignment_key,
      seminar_hall: hall,
      merged_team_name: g?.mergedTeamName ?? lookupLabel,
      source_team_names: g?.teamNames ?? sourceNames,
      submission_ids: g?.submissionIds ?? [],
    });
  }

  if (missing.length) {
    console.warn(`Note: ${missing.length} PDF row(s) stored by team-name key only (no submission_ids yet):`);
    for (const m of missing) console.warn(`  ${m.hall}: ${m.label}`);
  }

  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);

  const { error: delErr } = await supabase.from('seminar_hall_assignments').delete().gte('assignment_key', '');
  if (delErr) {
    console.error('Delete failed (run migration 011?):', delErr.message);
    process.exit(1);
  }

  const { error: insErr } = await supabase.from('seminar_hall_assignments').insert(
    assignments.map((a) => ({
      ...a,
      updated_at: new Date().toISOString(),
    }))
  );
  if (insErr) {
    console.error('Insert failed:', insErr.message);
    process.exit(1);
  }

  console.log(`Stored ${assignments.length} seminar hall row(s) in DB (PDF baseline).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
