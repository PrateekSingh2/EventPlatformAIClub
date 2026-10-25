import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(path.join(path.dirname(fileURLToPath(import.meta.url)), '../apps/web/package.json'));
const { createClient } = require('@supabase/supabase-js');

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('missing env');
  const sb = createClient(url, key);
  const { data: all, count } = await sb
    .from('team_registration_submissions')
    .select('team_name, members', { count: 'exact' });
  console.log('submissions', count);
  const needles = ['1014', '1013', '1131', '1074', '1032', '1030', '1026', '1023', '1057', '1016', '1079', '1130'];
  for (const n of needles) {
    let c = 0;
    for (const s of all || []) {
      if ((s.members || []).some((m: { enrollment_number?: string }) => (m.enrollment_number || '').includes(n)))
        c++;
    }
    console.log(n, 'hits', c);
  }
}

main().catch(console.error);
