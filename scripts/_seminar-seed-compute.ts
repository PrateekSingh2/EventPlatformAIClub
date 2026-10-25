import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

import {
  buildManualGroupMapAllSquadsOfFour,
  buildManualMergeGroups,
  formatMergedTeamName,
  type TeamSubmission,
} from '../apps/web/src/lib/team-merger';
import { buildAssignmentKey } from '../apps/web/src/lib/seminar-halls';

function loadEnv() {
  const ROOT = path.resolve(__dirname, '..');
  const env: Record<string, string> = {};
  for (const p of [
    path.join(ROOT, '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, 'apps/web/.env.local'),
  ]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const v = m[2].replace(/^["']|["']$/g, '');
      if (v && !v.includes('placeholder') && !v.includes('your-project-id')) env[m[1]] = v;
    }
  }
  return env;
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const { data: submissions, error } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members, squad_merge_opt_in, created_at');
  if (error) throw error;

  const subs = (submissions ?? []) as TeamSubmission[];
  const map = buildManualGroupMapAllSquadsOfFour(subs);
  const groups = buildManualMergeGroups(subs, map).map((g) => ({
    submissionIds: g.submissionIds,
    teamNames: g.teamNames,
    mergedTeamName: formatMergedTeamName(g.teamNames),
    assignmentKey: buildAssignmentKey(g.teamNames),
  }));

  console.log(JSON.stringify({ groups }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
