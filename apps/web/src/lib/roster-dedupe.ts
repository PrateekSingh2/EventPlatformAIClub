import type { TeamMemberPayload } from '@/lib/team-registration-form';

export function cleanPlatformLabel(value: string): string {
  return value.replace(/^[\s•·]+/, '').trim();
}

export function normalizeTeamName(value: string): string {
  return cleanPlatformLabel(value).toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeMemberEmail(email: string): string {
  return email.trim().toLowerCase().replace(/\.acin$/, '.ac.in');
}

/** Stable member key for duplicate detection (email preferred). */
export function rosterMemberKey(member: Pick<TeamMemberPayload, 'email' | 'enrollment_number' | 'name'>): string | null {
  const email = normalizeMemberEmail(member.email || '');
  if (email.includes('@')) return `email:${email}`;
  const enrollment = (member.enrollment_number || '').trim().toUpperCase();
  if (enrollment) return `enroll:${enrollment}`;
  const name = (member.name || '').trim().toLowerCase();
  if (name) return `name:${name}`;
  return null;
}

export function rosterFingerprint(members: TeamMemberPayload[]): string {
  const keys = members
    .map((m) => rosterMemberKey(m))
    .filter((k): k is string => Boolean(k))
    .sort();
  return keys.join('|');
}

/** Duplicate = same normalized team name + same member roster. */
export function teamNameAndRosterKey(teamName: string, members: TeamMemberPayload[]): string | null {
  const fp = rosterFingerprint(members);
  if (!fp) return null;
  return `${normalizeTeamName(teamName)}||${fp}`;
}

export function isDuplicateTeamRegistration(
  existing: Array<{ team_name: string; members: TeamMemberPayload[] }>,
  candidate: { team_name: string; members: TeamMemberPayload[] }
): boolean {
  const key = teamNameAndRosterKey(candidate.team_name, candidate.members);
  if (!key) return false;
  return existing.some((row) => teamNameAndRosterKey(row.team_name, row.members || []) === key);
}

export type SubmissionRow = {
  id: string;
  team_name: string;
  members: TeamMemberPayload[];
  created_at?: string;
};

/** IDs to delete (newer duplicates) when team name + roster match. */
export function submissionIdsToRemoveAsDuplicates(submissions: SubmissionRow[]): Set<string> {
  const groups = new Map<string, SubmissionRow[]>();
  for (const row of submissions) {
    const key = teamNameAndRosterKey(row.team_name, row.members || []);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const remove = new Set<string>();
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')));
    for (const dup of list.slice(1)) remove.add(dup.id);
  }
  return remove;
}
