/** Canonical participant team types used across import, merger, final roster, and Brevo. */
export const TEAM_SIZE_LABELS = ['Solo', 'Duo', 'Trio', 'Squad'] as const;
export type TeamSizeLabel = (typeof TEAM_SIZE_LABELS)[number];

export function teamSizeLabelFromMemberCount(count: number): TeamSizeLabel {
  const n = Math.max(0, Math.floor(count));
  if (n <= 1) return 'Solo';
  if (n === 2) return 'Duo';
  if (n === 3) return 'Trio';
  return 'Squad';
}

const SIZE_ALIASES: Record<string, TeamSizeLabel> = {
  solo: 'Solo',
  individual: 'Solo',
  '1': 'Solo',
  one: 'Solo',
  duo: 'Duo',
  pair: 'Duo',
  '2': 'Duo',
  two: 'Duo',
  trio: 'Trio',
  '3': 'Trio',
  three: 'Trio',
  squad: 'Squad',
  team: 'Squad',
  '4': 'Squad',
  four: 'Squad',
};

/** Normalize CSV/form values (duo, DUO, 2) → Solo | Duo | Trio | Squad. */
export function normalizeTeamSize(
  raw: string | null | undefined,
  memberCount?: number
): TeamSizeLabel {
  const hint = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (hint) {
    if (SIZE_ALIASES[hint]) return SIZE_ALIASES[hint];
    for (const label of TEAM_SIZE_LABELS) {
      if (hint === label.toLowerCase()) return label;
    }
  }
  if (memberCount != null && memberCount > 0) {
    return teamSizeLabelFromMemberCount(memberCount);
  }
  return 'Solo';
}

export function isTeamSizeHint(value: string): boolean {
  const hint = value.trim().toLowerCase();
  if (!hint) return false;
  if (SIZE_ALIASES[hint]) return true;
  return TEAM_SIZE_LABELS.some((l) => l.toLowerCase() === hint);
}
