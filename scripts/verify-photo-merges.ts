import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { PINNED_SEMINAR_MERGE_GROUPS } from '../apps/web/src/lib/photo-seminar-merges.ts';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');

function norm(e: string) {
  return e.replace(/\s/g, '').toUpperCase();
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: teams } = await sb.from('final_teams').select('team_name, members, submission_ids, seminar_hall');
  for (const spec of PINNED_SEMINAR_MERGE_GROUPS) {
    const target = new Set(spec.enrollments.map(norm));
    console.log('\n===', spec.label, '===');
    for (const t of teams || []) {
      const es = (t.members || []).map((m: { enrollment_number?: string }) => norm(m.enrollment_number || ''));
      const hit = spec.enrollments.filter((e) => es.includes(norm(e)));
      if (hit.length >= 2) {
        console.log(' ', t.team_name, '| hall', t.seminar_hall, '| matched enrolls', hit.length, hit);
        console.log('   subs', (t.submission_ids || []).length);
      }
    }
  }
}

main().catch(console.error);
