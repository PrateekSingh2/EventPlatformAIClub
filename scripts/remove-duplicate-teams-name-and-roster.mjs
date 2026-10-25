#!/usr/bin/env node
/**
 * Remove duplicates where normalized team_name + member roster match.
 * Affects: team_registration_submissions, final_teams, seminar_hall_assignments (submission_ids).
 *
 * Keeps the oldest submission (created_at) in each duplicate group.
 *
 * Usage: node scripts/remove-duplicate-teams-name-and-roster.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const envPath = path.join(ROOT, 'apps/web/.env.local');
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function normName(n) {
  return String(n ?? '')
    .replace(/^[\s•·]+/, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function normEmail(e) {
  return String(e ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.acin$/, '.ac.in');
}

function memberKey(m) {
  const e = normEmail(m.email);
  if (e.includes('@')) return `e:${e}`;
  const en = String(m.enrollment_number ?? '')
    .trim()
    .toUpperCase();
  if (en) return `n:${en}`;
  return null;
}

function rosterFp(members) {
  return (members ?? [])
    .map((m) => memberKey(m))
    .filter(Boolean)
    .sort()
    .join('|');
}

function dupKey(teamName, members) {
  const fp = rosterFp(members);
  if (!fp) return null;
  return `${normName(teamName)}||${fp}`;
}

function pickSubmissionIdsToRemove(submissions) {
  const groups = new Map();
  for (const s of submissions) {
    const k = dupKey(s.team_name, s.members);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const removeIds = new Set();
  const kept = [];
  for (const [, list] of groups) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    kept.push(list[0]);
    for (const dup of list.slice(1)) removeIds.add(dup.id);
  }
  return { removeIds, kept, groupCount: [...groups.values()].filter((l) => l.length > 1).length };
}

function dedupeFinalRows(rows) {
  const sorted = [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const seen = new Set();
  const kept = [];
  const removed = [];
  for (const t of sorted) {
    const k = dupKey(t.team_name, t.members);
    if (!k) {
      kept.push(t);
      continue;
    }
    if (seen.has(k)) {
      removed.push(t);
      continue;
    }
    seen.add(k);
    kept.push(t);
  }
  kept.forEach((t, i) => {
    t.sort_order = i;
  });
  return { kept, removed };
}

async function main() {
  const supabase = createClient(
    loadEnv().NEXT_PUBLIC_SUPABASE_URL,
    loadEnv().SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: submissions, error: subErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members, created_at')
    .order('created_at', { ascending: true });
  if (subErr) throw subErr;

  const { removeIds, groupCount } = pickSubmissionIdsToRemove(submissions ?? []);
  console.log('Duplicate submission groups:', groupCount);
  console.log('Submission rows to delete:', removeIds.size);
  for (const id of removeIds) {
    const s = submissions.find((x) => x.id === id);
    console.log('  delete', s?.team_name, id);
  }

  const { data: finalRows, error: finErr } = await supabase
    .from('final_teams')
    .select('*')
    .order('sort_order');
  if (finErr) throw finErr;

  const { kept: finalKept, removed: finalRemoved } = dedupeFinalRows(finalRows ?? []);
  console.log('Final teams:', finalRows?.length, '→', finalKept.length, '(remove', finalRemoved.length, ')');
  for (const t of finalRemoved) {
    console.log('  final remove', t.team_name, t.access_token);
  }

  if (dryRun) {
    console.log('\n--dry-run: no writes');
    return;
  }

  if (removeIds.size > 0) {
    const { error: delSubErr } = await supabase
      .from('team_registration_submissions')
      .delete()
      .in('id', [...removeIds]);
    if (delSubErr) throw delSubErr;
  }

  const { data: halls, error: hallErr } = await supabase
    .from('seminar_hall_assignments')
    .select('*');
  if (hallErr && !String(hallErr.message).includes('does not exist')) throw hallErr;

  if (Array.isArray(halls) && halls.length > 0) {
    for (const row of halls) {
      const ids = (row.submission_ids ?? []).filter((id) => !removeIds.has(id));
      const names = (row.source_team_names ?? []).filter(Boolean);
      if (ids.length === 0 && names.length === 0) {
        await supabase.from('seminar_hall_assignments').delete().eq('assignment_key', row.assignment_key);
        continue;
      }
      await supabase
        .from('seminar_hall_assignments')
        .update({
          submission_ids: ids,
          updated_at: new Date().toISOString(),
        })
        .eq('assignment_key', row.assignment_key);
    }
  }

  const finalPayload = finalKept.map((t) => {
    const submission_ids = (t.submission_ids ?? []).filter((id) => !removeIds.has(id));
    return {
      team_key: t.team_key,
      team_name: t.team_name,
      team_size: t.team_size,
      access_token: String(t.access_token).trim().toUpperCase(),
      members: t.members,
      source_team_names: t.source_team_names,
      submission_ids,
      seminar_hall: t.seminar_hall,
      sort_order: t.sort_order,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: delFinErr } = await supabase.from('final_teams').delete().gte('team_key', '');
  if (delFinErr) throw delFinErr;
  if (finalPayload.length > 0) {
    const { error: insFinErr } = await supabase.from('final_teams').insert(finalPayload);
    if (insFinErr) throw insFinErr;
  }

  await supabase
    .from('final_teams_config')
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  const { count } = await supabase
    .from('team_registration_submissions')
    .select('*', { count: 'exact', head: true });
  console.log('\nDone. Submissions now:', count, '| final_teams:', finalPayload.length);
  console.log(
    'Team Merger manual groups live in browser localStorage (eventPlatform.teamMerger.manualGroups) — clear in admin if stale IDs appear.'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
