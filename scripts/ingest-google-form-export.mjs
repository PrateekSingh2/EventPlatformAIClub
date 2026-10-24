/**
 * Ingest Google Form TSV into team_registration_submissions (Supabase).
 *
 * Usage:
 *   node scripts/ingest-google-form-export.mjs [path/to/export.tsv]
 *
 * Loads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from apps/web/.env.local
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
  const envPath = path.join(ROOT, 'apps/web/.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`Missing ${envPath}`);
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

// Mirror apps/web/src/lib/google-form-import.ts (keep in sync)
const COL = {
  timestamp: 0,
  teamName: 1,
  mode: 2,
  solo: { name: 3, enrollment: 5, email: 6, year: 7, branch: 8 },
  duo: [
    { name: 11, enrollment: 13, email: 14, branch: 15, year: 16 },
    { name: 17, enrollment: 19, email: 20, branch: 21, year: 22 },
  ],
  squad: [
    { name: 25, enrollment: 27, email: 28, branch: 29, year: 30 },
    { name: 31, enrollment: 33, email: 34, branch: 35, year: 36 },
    { name: 37, enrollment: 39, email: 40, branch: 41, year: 42 },
    { name: 43, enrollment: 45, email: 46, branch: 47, year: 48 },
  ],
};

function cell(cells, i) {
  return (cells[i] ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeYear(raw) {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v.startsWith('1')) return '1st';
  if (v.startsWith('2')) return '2nd';
  if (v.startsWith('3')) return '3rd';
  return '';
}

function normalizeEmail(raw, enrollment) {
  let email = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!email) return '';
  email = email.replace('mitsqwl', 'mitsgwl');
  if (!email.includes('@')) {
    if (email.endsWith('mitsgwl.ac.in')) {
      email = `${email.replace(/@?mitsgwl\.ac\.in$/i, '')}@mitsgwl.ac.in`;
    } else if (/^[a-z0-9._-]+$/i.test(email)) {
      email = `${email}@mitsgwl.ac.in`;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const enroll = enrollment.trim().toLowerCase().replace(/\s+/g, '');
    if (enroll) return `${enroll}@mitsgwl.ac.in`;
  }
  return email;
}

function memberFromCells(cells, cols) {
  const enrollment = cell(cells, cols.enrollment);
  return {
    name: cell(cells, cols.name),
    enrollment_number: enrollment,
    email: normalizeEmail(cell(cells, cols.email), enrollment),
    branch: cell(cells, cols.branch),
    year: normalizeYear(cell(cells, cols.year)),
  };
}

function isEmpty(m) {
  return !m.name && !m.enrollment_number && !m.email && !m.branch && !m.year;
}

function isComplete(m) {
  return !!(m.name && m.enrollment_number && m.email && m.branch && m.year);
}

function parseTimestamp(raw) {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, sec] = m;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${sec}+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function parseTsv(content) {
  const lines = content.split(/\r?\n/).filter((l) => l.trim());
  const byTeam = new Map();

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cells = lines[lineIdx].split('\t');
    const team_name = cell(cells, COL.teamName);
    if (!team_name) continue;

    const mode = cell(cells, COL.mode).toLowerCase();
    let fields = [];
    if (mode === 'solo') fields = [memberFromCells(cells, COL.solo)];
    else if (mode === 'duo') fields = COL.duo.map((c) => memberFromCells(cells, c));
    else if (mode === 'squad') fields = COL.squad.map((c) => memberFromCells(cells, c));
    else continue;

    const members = [];
    for (let i = 0; i < fields.length; i++) {
      const m = fields[i];
      if (isEmpty(m)) continue;
      members.push({ slot: members.length + 1, ...m });
    }
    if (!members.length || !isComplete(members[0])) continue;

    const submitted_at = parseTimestamp(cell(cells, COL.timestamp));
    const row = { team_name, members, squad_merge_opt_in: null, submitted_at };
    const key = team_name.toLowerCase();
    const prev = byTeam.get(key);
    if (!prev || (submitted_at && prev.submitted_at && submitted_at >= prev.submitted_at)) {
      byTeam.set(key, row);
    }
  }
  return [...byTeam.values()];
}

async function main() {
  const tsvPath =
    process.argv[2] || path.join(ROOT, 'scripts/data/google-form-export.tsv');
  if (!fs.existsSync(tsvPath)) {
    console.error('TSV not found:', tsvPath);
    process.exit(1);
  }

  const env = loadEnv();
  const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase URL/service role missing in .env.local');

  const rows = parseTsv(fs.readFileSync(tsvPath, 'utf8'));
  console.log(`Parsed ${rows.length} unique teams from ${tsvPath}`);

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let inserted = 0;
  let updated = 0;
  for (const row of rows) {
    const payload = {
      team_name: row.team_name,
      members: row.members,
      squad_merge_opt_in: row.squad_merge_opt_in,
      ...(row.submitted_at ? { created_at: row.submitted_at } : {}),
    };

    const { data: existing } = await supabase
      .from('team_registration_submissions')
      .select('id')
      .eq('team_name', row.team_name)
      .maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from('team_registration_submissions').update(payload).eq('id', existing.id);
      if (error) console.error('UPDATE', row.team_name, error.message);
      else updated++;
    } else {
      const { error } = await supabase.from('team_registration_submissions').insert(payload);
      if (error) console.error('INSERT', row.team_name, error.message);
      else inserted++;
    }
  }

  console.log(`Done. inserted=${inserted} updated=${updated}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
