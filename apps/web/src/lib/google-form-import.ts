import type { TeamMemberPayload } from '@/lib/team-registration-form';
import { isMemberComplete, isMemberEmpty, type TeamMemberFormFields } from '@/lib/team-registration-form';

/** Column layout from Google Forms export (51 columns). */
export const GOOGLE_FORM_COLUMN = {
  timestamp: 0,
  teamName: 1,
  mode: 2,
  solo: { name: 3, mobile: 4, enrollment: 5, email: 6, year: 7, branch: 8 },
  duo: [
    { name: 11, mobile: 12, enrollment: 13, email: 14, branch: 15, year: 16 },
    { name: 17, mobile: 18, enrollment: 19, email: 20, branch: 21, year: 22 },
  ],
  squad: [
    { name: 25, mobile: 26, enrollment: 27, email: 28, branch: 29, year: 30 },
    { name: 31, mobile: 32, enrollment: 33, email: 34, branch: 35, year: 36 },
    { name: 37, mobile: 38, enrollment: 39, email: 40, branch: 41, year: 42 },
    { name: 43, mobile: 44, enrollment: 45, email: 46, branch: 47, year: 48 },
  ],
} as const;

export type GoogleFormImportRow = {
  team_name: string;
  members: TeamMemberPayload[];
  squad_merge_opt_in: boolean | null;
  submitted_at: string | null;
  source_line: number;
  warnings: string[];
};

function cell(cells: string[], index: number): string {
  return (cells[index] ?? '').trim().replace(/\s+/g, ' ');
}

function normalizeYear(raw: string): string {
  const v = raw.trim().toLowerCase();
  if (!v) return '';
  if (v.startsWith('1')) return '1st';
  if (v.startsWith('2')) return '2nd';
  if (v.startsWith('3')) return '3rd';
  if (v === '1st' || v === '2nd' || v === '3rd') return v;
  return '';
}

function normalizeEmail(raw: string, enrollment: string): string {
  let email = raw.trim().toLowerCase().replace(/\s+/g, '');
  if (!email) return '';

  email = email.replace('mitsqwl', 'mitsgwl');

  if (!email.includes('@')) {
    if (/@?mitsgwl\.ac\.in$/i.test(email) || email.endsWith('mitsgwl.ac.in')) {
      const local = email.replace(/@?mitsgwl\.ac\.in$/i, '');
      email = `${local}@mitsgwl.ac.in`;
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

function memberFromCells(
  cells: string[],
  cols: { name: number; enrollment: number; email: number; branch: number; year: number }
): TeamMemberFormFields {
  const enrollment = cell(cells, cols.enrollment);
  return {
    name: cell(cells, cols.name),
    enrollment_number: enrollment,
    email: normalizeEmail(cell(cells, cols.email), enrollment),
    branch: cell(cells, cols.branch),
    year: normalizeYear(cell(cells, cols.year)),
  };
}

function parseTimestamp(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const [, dd, mm, yyyy, hh, min, sec] = m;
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}T${hh.padStart(2, '0')}:${min}:${sec}+05:30`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function cleanTeamName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 120);
}

export function parseGoogleFormTsv(content: string): GoogleFormImportRow[] {
  const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const results: GoogleFormImportRow[] = [];
  const byTeam = new Map<string, GoogleFormImportRow>();

  for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
    const cells = lines[lineIdx].split('\t');
    const warnings: string[] = [];
    const team_name = cleanTeamName(cell(cells, GOOGLE_FORM_COLUMN.teamName));
    if (!team_name) {
      warnings.push('Missing team name — skipped');
      continue;
    }

    const mode = cell(cells, GOOGLE_FORM_COLUMN.mode).toLowerCase();
    let memberFields: TeamMemberFormFields[] = [];

    if (mode === 'solo') {
      memberFields = [memberFromCells(cells, GOOGLE_FORM_COLUMN.solo)];
    } else if (mode === 'duo') {
      memberFields = GOOGLE_FORM_COLUMN.duo.map((cols) => memberFromCells(cells, cols));
    } else if (mode === 'squad') {
      memberFields = GOOGLE_FORM_COLUMN.squad.map((cols) => memberFromCells(cells, cols));
    } else {
      warnings.push(`Unknown mode "${mode}" — skipped`);
      continue;
    }

    const members: TeamMemberPayload[] = [];
    for (let i = 0; i < memberFields.length; i++) {
      const m = memberFields[i];
      if (isMemberEmpty(m)) continue;
      if (!isMemberComplete(m)) {
        warnings.push(`Member ${i + 1} incomplete — kept partial fields`);
      }
      members.push({ slot: i + 1, ...m });
    }

    if (members.length === 0 || !isMemberComplete(members[0])) {
      warnings.push('No valid team lead — skipped');
      continue;
    }

    const filled = members.filter((m) => isMemberComplete(m)).length;
    let squad_merge_opt_in: boolean | null = null;
    if (mode === 'squad' && filled === 3) {
      squad_merge_opt_in = null;
    }

    const submitted_at = parseTimestamp(cell(cells, GOOGLE_FORM_COLUMN.timestamp));

    const row: GoogleFormImportRow = {
      team_name,
      members: members.map((m, idx) => ({ ...m, slot: idx + 1 })),
      squad_merge_opt_in,
      submitted_at,
      source_line: lineIdx + 1,
      warnings,
    };

    const key = team_name.toLowerCase();
    const prev = byTeam.get(key);
    if (!prev) {
      byTeam.set(key, row);
      continue;
    }
    const prevTs = prev.submitted_at ? Date.parse(prev.submitted_at) : 0;
    const nextTs = row.submitted_at ? Date.parse(row.submitted_at) : 0;
    if (nextTs >= prevTs) {
      row.warnings.push(`Duplicate team name — replaced earlier row (line ${prev.source_line})`);
      byTeam.set(key, row);
    } else {
      warnings.push(`Duplicate team name — kept newer row (line ${prev.source_line})`);
      byTeam.set(key, prev);
    }
  }

  results.push(...byTeam.values());
  results.sort((a, b) => {
    const ta = a.submitted_at ? Date.parse(a.submitted_at) : 0;
    const tb = b.submitted_at ? Date.parse(b.submitted_at) : 0;
    return tb - ta;
  });

  return results;
}

export function googleFormRowsToDbPayload(rows: GoogleFormImportRow[]) {
  return rows.map((r) => ({
    team_name: r.team_name,
    members: r.members,
    squad_merge_opt_in: r.squad_merge_opt_in,
    ...(r.submitted_at ? { created_at: r.submitted_at } : {}),
  }));
}
