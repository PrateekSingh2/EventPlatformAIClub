export const DEFAULT_SEMINAR_HALLS = [
  'SH1',
  'SH2',
  'SH3',
  'SH4',
  'SH5',
  'SH6',
  'SH7',
  'SH8',
  'SH9',
  'SH10',
];

export type SeminarHallTeam = {
  teamKey: string;
  teamName: string;
  memberCount: number;
  memberEmails: string[];
};

export type SeminarHallAssignmentRow = {
  seminar_hall: string;
  merged_team_name: string;
  team_size: number;
  member_names: string;
  member_emails: string;
  team_key: string;
};

export type StoredSeminarHallRow = {
  assignment_key: string;
  seminar_hall: string;
  merged_team_name: string;
  source_team_names?: string[];
  submission_ids?: string[];
};

export function normalizeTeamLabel(name: string): string {
  return name
    .replace(/^•\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Stable key from original registration team names (order-independent). */
export function buildAssignmentKey(teamNames: string[]): string {
  return Array.from(new Set(teamNames.map((n) => normalizeTeamLabel(n)).filter(Boolean)))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .join('|');
}

export function storedHallMap(rows: StoredSeminarHallRow[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = row.assignment_key || buildAssignmentKey(row.source_team_names ?? []);
    const hall = row.seminar_hall?.trim().toUpperCase();
    if (key && hall) map.set(key, hall);
  }
  return map;
}

/**
 * Prefer DB-backed halls (PDF baseline); round-robin only for squads with no stored row.
 */
export function resolveHallAssignments(
  teams: SeminarHallTeam[],
  teamNamesByKey: Map<string, string[]>,
  stored: Map<string, string>,
  fallbackHalls: string[]
): Map<string, string> {
  const result = new Map<string, string>();
  const unassigned: SeminarHallTeam[] = [];

  for (const team of teams) {
    const names = teamNamesByKey.get(team.teamKey) ?? [team.teamName];
    const key = buildAssignmentKey(names);
    const hall = stored.get(key);
    if (hall) {
      result.set(team.teamKey, hall);
    } else {
      unassigned.push(team);
    }
  }

  const rr = assignTeamsToSeminarHalls(unassigned, fallbackHalls);
  for (const [teamKey, hall] of rr) {
    result.set(teamKey, hall);
  }
  return result;
}

/** Round-robin merged teams across selected halls (stable sort by team name). */
export function assignTeamsToSeminarHalls(
  teams: SeminarHallTeam[],
  halls: string[]
): Map<string, string> {
  const cleanHalls = halls.map((h) => h.trim().toUpperCase()).filter(Boolean);
  if (cleanHalls.length === 0 || teams.length === 0) return new Map();

  const sorted = [...teams].sort((a, b) => a.teamName.localeCompare(b.teamName, undefined, { sensitivity: 'base' }));
  const map = new Map<string, string>();
  sorted.forEach((team, index) => {
    map.set(team.teamKey, cleanHalls[index % cleanHalls.length]);
  });
  return map;
}

export function buildSeminarHallExportRows(
  teams: SeminarHallTeam[],
  hallByTeamKey: Map<string, string>
): SeminarHallAssignmentRow[] {
  return teams
    .map((team) => ({
      seminar_hall: hallByTeamKey.get(team.teamKey) || '',
      merged_team_name: team.teamName,
      team_size: team.memberCount,
      member_names: team.memberEmails.join('; '),
      member_emails: team.memberEmails.join('; '),
      team_key: team.teamKey,
    }))
    .filter((r) => r.seminar_hall)
    .sort((a, b) => {
      const h = a.seminar_hall.localeCompare(b.seminar_hall);
      if (h !== 0) return h;
      return a.merged_team_name.localeCompare(b.merged_team_name);
    });
}
