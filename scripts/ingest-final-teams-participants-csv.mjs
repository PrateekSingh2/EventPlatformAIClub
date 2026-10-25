#!/usr/bin/env node
/**
 * Replace final_teams from scripts/data/final-teams-participants.csv (canonical roster).
 *
 * Usage: node scripts/ingest-final-teams-participants-csv.mjs [csv-path]
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('../apps/web/node_modules/@supabase/supabase-js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

function loadEnv() {
  const envPath = path.join(ROOT, 'apps/web/.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseParticipant(cell) {
  const raw = String(cell ?? '').trim();
  if (!raw) return null;
  const m = raw.match(/^(.+?)\s*\(([^)]+)\)\s*$/);
  if (!m) {
    return { name: raw, enrollment_number: '', email: '', branch: '', year: '' };
  }
  return {
    name: m[1].trim(),
    enrollment_number: m[2].trim(),
    email: '',
    branch: '',
    year: '',
  };
}

function normEnroll(value) {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

function normTeamName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function generateToken(existing) {
  while (true) {
    const b1 = LETTERS[Math.floor(Math.random() * 26)] + LETTERS[Math.floor(Math.random() * 26)];
    let b2 = '';
    for (let i = 0; i < 4; i++) b2 += LETTERS[Math.floor(Math.random() * 26)];
    let b3 = '';
    for (let i = 0; i < 4; i++) b3 += DIGITS[Math.floor(Math.random() * 10)];
    const token = `${b1}-${b2}-${b3}`;
    if (!existing.has(token)) {
      existing.add(token);
      return token;
    }
  }
}

function rosterKey(members) {
  const keys = members
    .map((m) => normEnroll(m.enrollment_number))
    .filter(Boolean)
    .sort();
  if (keys.length) return keys.join('|');
  return members.map((m) => m.name.toLowerCase()).join('|');
}

function buildSubmissionMemberIndex(submissions) {
  const byEnroll = new Map();
  const byEmail = new Map();
  for (const sub of submissions) {
    for (const m of sub.members || []) {
      const en = normEnroll(m.enrollment_number);
      if (en && !byEnroll.has(en)) byEnroll.set(en, m);
      const email = String(m.email || '')
        .trim()
        .toLowerCase();
      if (email.includes('@') && !byEmail.has(email)) byEmail.set(email, m);
    }
  }
  return { byEnroll, byEmail };
}

function enrichMember(base, index, lookup) {
  const en = normEnroll(base.enrollment_number);
  const fromForm = en ? lookup.byEnroll.get(en) : null;
  if (!fromForm) {
    return {
      slot: index + 1,
      name: base.name,
      enrollment_number: base.enrollment_number,
      email: base.email || '',
      branch: base.branch || '',
      year: base.year || '',
    };
  }
  return {
    slot: index + 1,
    name: base.name || fromForm.name || '',
    enrollment_number: base.enrollment_number || fromForm.enrollment_number || '',
    email: fromForm.email || '',
    branch: fromForm.branch || '',
    year: fromForm.year || '',
  };
}

async function main() {
  const csvPath =
    process.argv[2] || path.join(ROOT, 'scripts/data/final-teams-participants.csv');
  if (!fs.existsSync(csvPath)) throw new Error(`CSV not found: ${csvPath}`);

  const env = loadEnv();
  const supabase = createClient(
    env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const text = fs.readFileSync(csvPath, 'utf8').trim();
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });

  const { data: existingRows, error: exErr } = await supabase.from('final_teams').select('*');
  if (exErr) throw exErr;

  const tokenByTeamName = new Map();
  const tokenByRoster = new Map();
  for (const t of existingRows || []) {
    const name = normTeamName(t.team_name);
    if (name && t.access_token) tokenByTeamName.set(name, String(t.access_token).trim().toUpperCase());
    tokenByRoster.set(rosterKey(t.members || []), String(t.access_token).trim().toUpperCase());
  }

  const { data: submissions, error: subErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members');
  if (subErr) throw subErr;
  const lookup = buildSubmissionMemberIndex(submissions || []);

  const usedTokens = new Set(
    (existingRows || []).map((t) => String(t.access_token || '').trim().toUpperCase()).filter(Boolean)
  );

  const teams = rows.map((row, sort_order) => {
    const team_name = String(row.team_name_merged ?? row.team_name ?? '').trim();
    const team_size = String(row.team_size ?? 'Solo').trim() || 'Solo';
    const participantCells = [
      row.participant1,
      row.participant2,
      row.participant3,
      row.participant4,
    ];
    const parsed = participantCells.map(parseParticipant).filter(Boolean);
    const members = parsed.map((p, i) => enrichMember(p, i, lookup));
    const rKey = rosterKey(members);
    const nName = normTeamName(team_name);
    let access_token =
      tokenByRoster.get(rKey) ||
      tokenByTeamName.get(nName) ||
      generateToken(usedTokens);

    const submission_ids = [];
    for (const m of members) {
      const en = normEnroll(m.enrollment_number);
      if (!en) continue;
      for (const sub of submissions || []) {
        const hit = (sub.members || []).some((sm) => normEnroll(sm.enrollment_number) === en);
        if (hit && !submission_ids.includes(sub.id)) submission_ids.push(sub.id);
      }
    }
    submission_ids.sort();

    // team_key must be unique per CSV row (merged squads can share submission id sets).
    const team_key = `final-csv:${String(sort_order).padStart(4, '0')}:${rKey || nName}`;

    return {
      team_key,
      team_name,
      team_size,
      access_token,
      members,
      source_team_names: [team_name],
      submission_ids,
      seminar_hall: null,
      sort_order,
      updated_at: new Date().toISOString(),
    };
  });

  const { error: delErr } = await supabase.from('final_teams').delete().gte('team_key', '');
  if (delErr) throw delErr;

  const { error: insErr } = await supabase.from('final_teams').insert(teams);
  if (insErr) throw insErr;

  await supabase
    .from('final_teams_config')
    .upsert({ id: 1, updated_at: new Date().toISOString() }, { onConflict: 'id' });

  console.log(`Ingested ${teams.length} teams from ${path.basename(csvPath)} into final_teams`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
