/**
 * Remove participant users + token archive rows that are not on the registration form roster.
 * Does NOT modify team_registration_submissions.
 *
 * Usage:
 *   node scripts/prune-participants-not-in-form.mjs           # dry-run
 *   node scripts/prune-participants-not-in-form.mjs --execute   # apply deletes
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

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

function collectFormEmails(submissions) {
  const emails = new Set();
  for (const sub of submissions || []) {
    const members = Array.isArray(sub.members) ? sub.members : [];
    for (const m of members) {
      const email = String(m?.email || '')
        .trim()
        .toLowerCase();
      if (email.includes('@')) emails.add(email);
    }
  }
  return emails;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }

  const supabase = createClient(url, key);

  const { data: submissions, error: formErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members');
  if (formErr) throw formErr;

  const formEmails = collectFormEmails(submissions);
  console.log(`Form roster emails: ${formEmails.size} (from ${submissions?.length ?? 0} teams)`);

  const { data: users, error: userErr } = await supabase
    .from('users')
    .select('id, email, name, access_token, team_name, role')
    .eq('role', 'participant');
  if (userErr) throw userErr;

  const orphanUsers = (users || []).filter((u) => {
    const email = String(u.email || '')
      .trim()
      .toLowerCase();
    return !formEmails.has(email);
  });

  const allowedTokens = new Set(
    (users || [])
      .filter((u) => {
        const email = String(u.email || '')
          .trim()
          .toLowerCase();
        return formEmails.has(email);
      })
      .map((u) => String(u.access_token || '').trim().toUpperCase())
      .filter((t) => t && !t.startsWith('PENDING'))
  );

  const { data: archives, error: archErr } = await supabase
    .from('token_archives')
    .select('id, access_token, storage_path');
  if (archErr) throw archErr;

  const orphanArchives = (archives || []).filter((a) => {
    const token = String(a.access_token || '').trim().toUpperCase();
    return !allowedTokens.has(token);
  });

  console.log('\n--- Users to remove (not on form) ---');
  for (const u of orphanUsers) {
    console.log(`  ${u.email} | ${u.access_token} | ${u.team_name || '-'}`);
  }

  console.log('\n--- Token archives to remove (token not on form roster) ---');
  for (const a of orphanArchives) {
    console.log(`  ${a.access_token} | ${a.storage_path}`);
  }

  if (!execute) {
    console.log('\nDry-run only. Re-run with --execute to apply deletes.');
    return;
  }

  for (const u of orphanUsers) {
    await supabase.from('stage_telemetry').delete().eq('user_id', u.id);
    const { error } = await supabase.from('users').delete().eq('id', u.id);
    if (error) throw error;
  }

  for (const a of orphanArchives) {
    try {
      await supabase.from('stage_passwords').delete().eq('token_archive_id', a.id);
    } catch {
      /* optional */
    }
    const { error } = await supabase.from('token_archives').delete().eq('id', a.id);
    if (error) throw error;
  }

  console.log(
    `\nDone. Removed ${orphanUsers.length} user(s) and ${orphanArchives.length} token archive(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
