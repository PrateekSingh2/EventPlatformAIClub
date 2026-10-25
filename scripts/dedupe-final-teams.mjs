#!/usr/bin/env node
/**
 * Deduplicate final_teams:
 * 1) Same roster (enrollment/email fingerprint) → one row, team_name = platform source_team_names[0]
 * 2) Each participant at most one squad (higher-priority team wins)
 *
 * Usage: node scripts/dedupe-final-teams.mjs [--dry-run]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const dryRun = process.argv.includes('--dry-run');

function loadEnv() {
  const env = {};
  for (const p of ['.env', '.env.local', 'apps/web/.env.local']) {
    const fp = path.join(repoRoot, p);
    if (!fs.existsSync(fp)) continue;
    for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const val = m[2].replace(/^["']|["']$/g, '');
      if (!val || val.includes('your-project-id')) continue;
      env[m[1]] = val;
    }
  }
  return env;
}

function cleanLabel(n) {
  return String(n ?? '').replace(/^[\s•·]+/, '').trim();
}

function normEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.acin$/, '.ac.in');
}

export function memberIdentityKey(member) {
  const email = normEmail(member.email);
  if (email.includes('@')) return `email:${email}`;
  const enrollment = String(member.enrollment_number ?? '').trim().toLowerCase();
  if (enrollment) return `enroll:${enrollment}`;
  return null;
}

function rosterFingerprint(members) {
  const keys = (members ?? [])
    .map((m) => memberIdentityKey(m))
    .filter(Boolean)
    .sort();
  return keys.join('|');
}

function platformTeamName(row) {
  const sources = (row.source_team_names ?? []).map(cleanLabel).filter(Boolean);
  if (sources.length >= 1) return sources[0];
  return cleanLabel(row.team_name);
}

function keepPriority(row) {
  let score = 0;
  score += (row.members?.length ?? 0) * 5;
  const sourceCount = (row.source_team_names ?? []).length;
  if (sourceCount === 1) score += 80;
  if (sourceCount >= 2) score -= sourceCount * 5;
  const label = cleanLabel(row.team_name);
  if (!label.includes(' X ')) score += 40;
  if (platformTeamName(row).toLowerCase() === 'test') score -= 10_000;
  score += Math.max(0, 500 - Number(row.sort_order ?? 0));
  return score;
}

function mergeMemberRows(rows) {
  const byKey = new Map();
  for (const row of rows) {
    for (const m of row.members ?? []) {
      const key = memberIdentityKey(m);
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, m);
        continue;
      }
      const cur = byKey.get(key);
      const preferNew =
        normEmail(m.email).includes('@mitsgwl') &&
        !normEmail(cur.email).includes('@mitsgwl');
      if (preferNew) byKey.set(key, m);
    }
  }
  return [...byKey.values()].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

export function dedupeFinalTeamRows(rows) {
  const input = rows.map((r) => ({
    ...r,
    members: Array.isArray(r.members) ? r.members : [],
    source_team_names: Array.isArray(r.source_team_names) ? r.source_team_names : [],
    submission_ids: Array.isArray(r.submission_ids) ? r.submission_ids : [],
  }));

  const byRoster = new Map();
  for (const row of input) {
    const fp = rosterFingerprint(row.members);
    if (!fp) continue;
    if (!byRoster.has(fp)) byRoster.set(fp, []);
    byRoster.get(fp).push(row);
  }

  const afterRoster = [];
  const rosterRemoved = [];

  for (const group of byRoster.values()) {
    group.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    const winner = { ...group[0] };
    winner.team_name = platformTeamName(winner);
    winner.members = mergeMemberRows(group);
    const submissionIds = new Set(winner.submission_ids ?? []);
    for (const other of group.slice(1)) {
      rosterRemoved.push({
        removed: platformTeamName(other),
        token: other.access_token,
        kept: winner.team_name,
        keptToken: winner.access_token,
      });
      for (const id of other.submission_ids ?? []) submissionIds.add(id);
    }
    winner.submission_ids = [...submissionIds];
    afterRoster.push(winner);
  }

  afterRoster.sort((a, b) => keepPriority(b) - keepPriority(a));
  const claimed = new Set();
  const kept = [];
  const memberConflictRemoved = [];

  for (const row of afterRoster) {
    const keys = (row.members ?? []).map((m) => memberIdentityKey(m)).filter(Boolean);
    const conflict = keys.some((k) => claimed.has(k));
    if (conflict) {
      memberConflictRemoved.push({
        removed: platformTeamName(row),
        token: row.access_token,
      });
      continue;
    }
    for (const k of keys) claimed.add(k);
    kept.push(row);
  }

  kept.sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
  kept.forEach((row, index) => {
    row.sort_order = index;
    row.team_name = platformTeamName(row);
  });

  return {
    kept,
    rosterRemoved,
    memberConflictRemoved,
    stats: {
      input: input.length,
      afterRosterDedupe: afterRoster.length,
      output: kept.length,
    },
  };
}

async function main() {
  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data, error } = await supabase.from('final_teams').select('*').order('sort_order');
  if (error) throw error;

  const result = dedupeFinalTeamRows(data ?? []);
  console.log(JSON.stringify(result.stats, null, 2));
  console.log('\nRoster duplicates removed:', result.rosterRemoved.length);
  for (const r of result.rosterRemoved) {
    console.log(`  - ${r.removed} (${r.token}) → kept ${r.kept} (${r.keptToken})`);
  }
  console.log('\nMember-overlap squads removed:', result.memberConflictRemoved.length);
  for (const r of result.memberConflictRemoved) {
    console.log(`  - ${r.removed} (${r.token})`);
  }

  if (dryRun) {
    console.log('\n--dry-run: no DB write');
    return;
  }

  const payload = result.kept.map((t, index) => ({
    team_key: t.team_key,
    team_name: cleanLabel(t.team_name),
    team_size: t.team_size,
    access_token: String(t.access_token).trim().toUpperCase(),
    members: t.members,
    source_team_names: t.source_team_names,
    submission_ids: t.submission_ids,
    seminar_hall: t.seminar_hall,
    sort_order: index,
    updated_at: new Date().toISOString(),
  }));

  const { error: delErr } = await supabase.from('final_teams').delete().gte('team_key', '');
  if (delErr) throw delErr;

  if (payload.length > 0) {
    const { error: insErr } = await supabase.from('final_teams').insert(payload);
    if (insErr) throw insErr;
  }

  await supabase
    .from('final_teams_config')
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  console.log('\nUpdated final_teams:', payload.length, 'rows');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
