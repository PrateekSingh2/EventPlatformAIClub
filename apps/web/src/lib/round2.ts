import type { FinalTeamRecord } from '@/lib/final-teams';
import { passwordArrayForPoolKey } from '@/lib/case-study-password-keys';

export function filterFinalTeamsByKeys(
  teams: FinalTeamRecord[],
  teamKeys: string[]
): FinalTeamRecord[] {
  const set = new Set(teamKeys.map(String));
  return teams.filter((t) => set.has(t.team_key));
}

export function finalTeamsToParticipantPayload(teams: FinalTeamRecord[]) {
  const rows: Array<{
    email: string;
    name: string;
    team_name: string;
    team_size: string;
    access_token: string;
  }> = [];

  for (const team of teams) {
    const token = team.access_token.trim().toUpperCase();
    for (const m of team.members) {
      const email = (m.email || '').trim().toLowerCase();
      if (!email.includes('@')) continue;
      rows.push({
        email,
        name: (m.name || '').trim() || email.split('@')[0],
        team_name: team.team_name.trim(),
        team_size: team.team_size,
        access_token: token,
      });
    }
  }
  return rows;
}

/** Fisher–Yates shuffle; returns new array. */
export function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Randomly assign pool keys to teams (with replacement if fewer pools than teams).
 * Preserves existing manual assignments when preserveManual is true.
 */
export function buildRandomPoolAssignments(
  teamKeys: string[],
  poolKeys: string[],
  existing: Record<string, string> = {},
  preserveManual = true
): Record<string, string> {
  if (poolKeys.length === 0) return { ...existing };

  const shuffledPools = shuffleArray(poolKeys);
  const mapping: Record<string, string> = { ...existing };

  let poolIdx = 0;
  for (const teamKey of teamKeys) {
    if (preserveManual && mapping[teamKey] && poolKeys.includes(mapping[teamKey])) {
      continue;
    }
    mapping[teamKey] = shuffledPools[poolIdx % shuffledPools.length];
    poolIdx += 1;
  }

  return mapping;
}

export function teamsToPoolCommitArchives(
  teams: FinalTeamRecord[],
  poolAssignments: Record<string, string>,
  poolByKey: Map<string, { storagePath: string; poolKey: string }>,
  stageCount: number
) {
  return teams.map((team) => {
    const poolKey = poolAssignments[team.team_key];
    const item = poolByKey.get(poolKey);
    if (!item) {
      throw new Error(`No pool ZIP mapped for team "${team.team_name}" (${team.team_key})`);
    }
    const token = team.access_token.trim().toUpperCase();
    return {
      teamKey: team.team_key,
      teamName: team.team_name,
      tokens: [token],
      accessToken: token,
      storagePath: item.storagePath,
      stageCount,
      poolKey: item.poolKey,
      passwords: passwordArrayForPoolKey(item.poolKey),
    };
  });
}
