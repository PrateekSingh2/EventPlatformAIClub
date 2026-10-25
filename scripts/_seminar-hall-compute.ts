import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

import {
  buildManualGroupMapAllSquadsOfFour,
  buildManualMergeGroups,
  computeAutoMergeGroups,
  filterMergerEligibleSubmissions,
  type TeamSubmission,
} from '../apps/web/src/lib/team-merger';
import { assignTeamsToSeminarHalls } from '../apps/web/src/lib/seminar-halls';

function loadEnv() {
  const ROOT = path.resolve(__dirname, '..');
  const paths = [
    path.join(ROOT, '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, 'apps/web/.env.local'),
  ];
  const env: Record<string, string> = {};
  for (const p of paths) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, '');
      if (!v || v.includes('your-project-id') || v.includes('placeholder')) continue;
      env[m[1]] = v;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(url, key);
  const { data: submissions, error } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members, squad_merge_opt_in, created_at');
  if (error) throw error;

  const subs = (submissions ?? []) as TeamSubmission[];
  const map = buildManualGroupMapAllSquadsOfFour(subs);
  const groups = buildManualMergeGroups(subs, map);
  const teams = groups.map((g) => ({
    teamKey: g.submissionIds.slice().sort().join('|'),
    teamName: g.mergedTeamName,
    memberCount: g.members.filter((m) => (m.email || m.name || '').trim()).length || g.members.length,
    memberEmails: g.members.map((m) => m.email).filter(Boolean),
  }));
  const halls = assignTeamsToSeminarHalls(teams, ['SH3', 'SH7']);
  const byHall: Record<string, string[]> = { SH3: [], SH7: [] };
  for (const t of teams) {
    const h = halls.get(t.teamKey);
    if (h === 'SH3' || h === 'SH7') byHall[h].push(t.teamName);
  }
  for (const h of ['SH3', 'SH7'] as const) {
    byHall[h].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }

  const autoGroups = computeAutoMergeGroups(filterMergerEligibleSubmissions(subs)).length;

  const pdf = {
    SH3: [
      '404 Not Found',
      'BACARDÍ X Ananya Pandey X Palak Sharma X rajeev sharma',
      'Black cover',
      'Celsia X PromptX',
      'Chambal ke Daku X Bit by bit',
      'Cipher syndicate',
      'Clan X Solo X Go Solo X Code slayer',
      "CRAFTER's",
      'Duo X GPU KE GUNDE',
      'Foundation x X dual bytes',
      'GPU Ke Gunde X CodeLobsters',
      'HackAI X Clavicle',
      'Lol X Brainbyte',
      'Mech X Honeycomb',
      'One piece X Squad busters',
      'Out of options',
      'Pixelverse X Thunder byte',
      'Punisher X Team End',
      'Skypixel',
      'SOMYA',
      'Team Horizon X TEAM DUALITY',
      'Team kannu X Tech coder X TeamDevelopers X Rcb',
      'Team rocket X Paradox',
      'Team Spartan X Chambal ke cheete X Scouts regiment',
      'Technicia',
      'THE DOMAIN EXPLORERS',
      'tic tac toe X Mahak lauvanshi X Random X PIXELS',
      'Warriors X Shreyansh Thapak',
      'Xyz X RCB',
    ],
    SH7: [
      'Prompt Pioneers',
      'Avengers X Brazzers',
      'Black clover X Default',
      'Bro Code',
      'Chalu Pandey',
      'Chita X Team Vanta',
      'CIPHER SYNDICATE',
      'Codex X The wizard',
      'DECODER',
      'Et squad',
      'free fire X The firebolts',
      'Hack titans X Team alpha',
      'LOL',
      'Loop X X Lobsters-codes🦀',
      'Nutri Scan AI X Gungun Sharma, Gauri Bhadouriya',
      'Orion',
      'PARADOX X Project vanta',
      'Pushpendra X Rangers',
      'SOLVANTA X Scylla',
      'Synapse Squad',
      'Team innovators',
      'Team Phoenix',
      'Team Rocket X Void coders',
      'Tech builders',
      'THE SCAVENGERS',
      'Tom and Jerry X Average',
      "Web maker X 5'5 X Parallax X Naitik",
    ],
  };

  function sourceKey(teamNames: string[]): string {
    return teamNames
      .map((n) => n.trim().toLowerCase())
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .join('|');
  }

  function findGroupByPdfLabel(label: string) {
    const parts = label
      .split(/\s+X\s+/i)
      .map((p) => p.trim().toLowerCase())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    return groups.find((g) => {
      const sn = g.teamNames
        .map((n) => n.trim().toLowerCase())
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      return sn.length === parts.length && sn.every((n, i) => n === parts[i]);
    });
  }

  const wrongHall: string[] = [];
  const notInForm: string[] = [];
  for (const h of ['SH3', 'SH7'] as const) {
    for (const label of pdf[h]) {
      const g = findGroupByPdfLabel(label);
      if (!g) {
        notInForm.push(`${h}: ${label}`);
        continue;
      }
      const key = g.submissionIds.slice().sort().join('|');
      const got = halls.get(key);
      if (got !== h) wrongHall.push(`${label} (PDF ${h}) → computed ${got ?? 'none'}`);
    }
  }

  const pdfKeys = new Set(
    [...pdf.SH3, ...pdf.SH7].flatMap((l) =>
      l
        .split(/\s+X\s+/i)
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean)
    )
  );
  const extraGroups = groups.filter((g) => {
    const names = g.teamNames.map((n) => n.trim().toLowerCase());
    return !names.every((n) => pdfKeys.has(n)) && g.teamNames.some((n) => !pdfKeys.has(n.trim().toLowerCase()));
  });

  console.log(
    JSON.stringify({
      submissionCount: subs.length,
      groupCount: groups.length,
      byHall,
      autoVsPack: { autoGroups },
      consistency: {
        pdfNotFoundInMerge: notInForm,
        pdfWrongHallVsPackAll4: wrongHall,
        computedGroupsNotMatchingPdfRoster: extraGroups.map((g) => ({
          mergedTeamName: g.mergedTeamName,
          teamNames: g.teamNames,
          hall: halls.get(g.submissionIds.slice().sort().join('|')),
        })),
      },
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
