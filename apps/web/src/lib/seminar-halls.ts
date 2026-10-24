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
