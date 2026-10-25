import { generateAccessToken } from '@/lib/auth';
import type { FinalTeamMember, FinalTeamRecord } from '@/lib/final-teams';
import { teamSizeLabelFromMemberCount } from '@/lib/team-merger';
import crypto from 'crypto';

/** Pixel & Anomaly Round 2 PDF shortlist (15 teams, seminar hall 7). */
export const PIXEL_ANOMALY_R2_PDF_TEAMS: { sort_order: number; team_name: string; seminar_hall: string }[] = [
  { sort_order: 1, team_name: 'Technicia', seminar_hall: '7' },
  { sort_order: 2, team_name: '404 Not Found', seminar_hall: '7' },
  { sort_order: 3, team_name: 'Team Phoenix', seminar_hall: '7' },
  { sort_order: 4, team_name: 'Tech builders', seminar_hall: '7' },
  { sort_order: 5, team_name: 'free fire X The firebolts', seminar_hall: '7' },
  { sort_order: 6, team_name: 'Lobsters-codes X Loop X', seminar_hall: '7' },
  { sort_order: 7, team_name: 'Prompt Pioneers', seminar_hall: '7' },
  { sort_order: 8, team_name: 'dual bytes X Team Vanta', seminar_hall: '7' },
  { sort_order: 9, team_name: 'THE DOMAIN EXPLORERS', seminar_hall: '7' },
  { sort_order: 10, team_name: 'Rcb X Paradox', seminar_hall: '7' },
  { sort_order: 11, team_name: 'SOMYA X team rocket X Khushi verma', seminar_hall: '7' },
  { sort_order: 12, team_name: 'pixels X scouts regiments X Xyz', seminar_hall: '7' },
  { sort_order: 13, team_name: 'Double lol', seminar_hall: '7' },
  { sort_order: 14, team_name: 'Bro Code', seminar_hall: '7' },
  { sort_order: 15, team_name: 'cypher syndicate X tom and jerry', seminar_hall: '7' },
];

export type Round2DraftMember = FinalTeamMember & { member_id?: string };

export type Round2DraftTeam = {
  team_key: string;
  team_name: string;
  seminar_hall: string;
  sort_order: number;
  access_token: string | null;
  members: Round2DraftMember[];
  selected: boolean;
  pdf_label?: string;
  linked_final_team_key?: string | null;
};

export type Round2DraftRoster = {
  version: 1;
  source: 'pixel-anomaly-pdf';
  updated_at: string;
  teams: Round2DraftTeam[];
};

export type RosterPickRow = {
  pick_key: string;
  name: string;
  email: string;
  team_name: string;
  enrollment_id?: string;
};

export type Round2WorkflowPhase = 'edit' | 'tokens_ready' | 'ops';

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchScore(pdfName: string, finalName: string): number {
  const a = normName(pdfName);
  const b = normName(finalName);
  if (a === b) return 100;
  if (b.includes(a) || a.includes(b)) return 85;
  const aParts = a.split(' ').filter((p) => p.length > 2);
  const bParts = new Set(b.split(' ').filter((p) => p.length > 2));
  let hits = 0;
  for (const p of aParts) if (bParts.has(p)) hits += 1;
  if (hits === 0) return 0;
  return Math.min(80, 40 + hits * 12);
}

export function findBestFinalTeamMatch(
  pdfTeamName: string,
  finalTeams: FinalTeamRecord[]
): FinalTeamRecord | null {
  let best: FinalTeamRecord | null = null;
  let bestScore = 0;
  for (const t of finalTeams) {
    const score = Math.max(
      matchScore(pdfTeamName, t.team_name),
      ...t.source_team_names.map((n) => matchScore(pdfTeamName, n))
    );
    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }
  return bestScore >= 40 ? best : null;
}

export function buildDraftFromPixelAnomalyPdf(finalTeams: FinalTeamRecord[]): Round2DraftRoster {
  const usedKeys = new Set<string>();
  const teams: Round2DraftTeam[] = PIXEL_ANOMALY_R2_PDF_TEAMS.map((row) => {
    const match = findBestFinalTeamMatch(row.team_name, finalTeams.filter((t) => !usedKeys.has(t.team_key)));
    if (match) usedKeys.add(match.team_key);

    const members: Round2DraftMember[] = match
      ? match.members.map((m) => ({
          ...m,
          member_id: crypto.randomUUID(),
        }))
      : [];

    const team_key = match?.team_key ?? `draft:${crypto.randomUUID()}`;

    return {
      team_key,
      team_name: match?.team_name ?? row.team_name,
      seminar_hall: row.seminar_hall,
      sort_order: row.sort_order,
      access_token: match?.access_token?.trim().toUpperCase() ?? null,
      members,
      selected: true,
      pdf_label: row.team_name,
      linked_final_team_key: match?.team_key ?? null,
    };
  });

  return {
    version: 1,
    source: 'pixel-anomaly-pdf',
    updated_at: new Date().toISOString(),
    teams,
  };
}

export function draftTeamToFinalRecord(team: Round2DraftTeam): FinalTeamRecord {
  const active = team.members.filter((m) => (m.email || m.name || '').trim());
  const count = active.length || team.members.length;
  return {
    team_key: team.team_key,
    team_name: team.team_name.trim(),
    team_size: teamSizeLabelFromMemberCount(count || 1),
    access_token: (team.access_token || '').trim().toUpperCase(),
    members: team.members,
    source_team_names: team.pdf_label ? [team.pdf_label] : [team.team_name],
    submission_ids: team.linked_final_team_key ? [] : [],
    seminar_hall: team.seminar_hall,
    sort_order: team.sort_order,
  };
}

export function draftRosterToFinalTeams(
  roster: Round2DraftRoster,
  selectedOnly = true
): FinalTeamRecord[] {
  const list = selectedOnly ? roster.teams.filter((t) => t.selected) : roster.teams;
  return list.slice().sort((a, b) => a.sort_order - b.sort_order).map(draftTeamToFinalRecord);
}

export function buildRosterPickList(finalTeams: FinalTeamRecord[]): RosterPickRow[] {
  const seen = new Set<string>();
  const rows: RosterPickRow[] = [];
  for (const team of finalTeams) {
    for (const m of team.members) {
      const email = (m.email || '').trim().toLowerCase();
      const key = email || `${team.team_key}:${(m.name || '').trim().toLowerCase()}`;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      rows.push({
        pick_key: key,
        name: (m.name || '').trim(),
        email,
        team_name: team.team_name,
        enrollment_id: m.enrollment_number,
      });
    }
  }
  rows.sort((a, b) => a.name.localeCompare(b.name) || a.email.localeCompare(b.email));
  return rows;
}

export function validateDraftForTokenGeneration(roster: Round2DraftRoster): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const selected = roster.teams.filter((t) => t.selected);
  if (selected.length !== 15) {
    errors.push(`Exactly 15 teams must be selected (currently ${selected.length}).`);
  }
  for (const t of selected) {
    const withEmail = t.members.filter((m) => (m.email || '').includes('@'));
    if (withEmail.length === 0) {
      errors.push(`"${t.team_name}" has no member with a valid email.`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function applyTokensToDraft(roster: Round2DraftRoster): Round2DraftRoster {
  const teams = roster.teams.map((t) => {
    if (!t.selected) return t;
    const token = (t.access_token || generateAccessToken()).trim().toUpperCase();
    return { ...t, access_token: token };
  });
  return { ...roster, teams, updated_at: new Date().toISOString() };
}

export function parseDraftRoster(raw: unknown): Round2DraftRoster | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Round2DraftRoster;
  if (o.version !== 1 || !Array.isArray(o.teams)) return null;
  return o;
}
