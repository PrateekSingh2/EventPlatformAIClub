import { isMemberComplete, type TeamMemberPayload } from '@/lib/team-registration-form';

const MAX_SQUAD_MEMBERS = 4;

export type TeamSubmission = {
  id: string;
  team_name: string;
  members: TeamMemberPayload[];
  squad_merge_opt_in?: boolean | null;
  created_at: string;
};

/** Eligible: explicit Yes, or legacy null with room for merger (<4 complete members). Excludes No and full squads. */
export function filterMergerEligibleSubmissions(submissions: TeamSubmission[]): TeamSubmission[] {
  return submissions.filter((s) => {
    if (s.squad_merge_opt_in === false) return false;
    if (s.squad_merge_opt_in === true) return countFilledMembers(s) < MAX_SQUAD_MEMBERS;
    const filled = countFilledMembers(s);
    return filled > 0 && filled < MAX_SQUAD_MEMBERS;
  });
}

export type MergeGroupSourceTeam = {
  submissionId: string;
  teamName: string;
  members: TeamMemberPayload[];
};

export type MergeGroup = {
  id: string;
  submissionIds: string[];
  teamNames: string[];
  /** Display / export name: single team keeps name; merged teams use "A X B". */
  mergedTeamName: string;
  members: TeamMemberPayload[];
  /** Every original submission in this group with its own roster (for merged UI). */
  sourceTeams: MergeGroupSourceTeam[];
  matchReason: string;
};

export function formatMergedTeamName(teamNames: string[]): string {
  const unique = Array.from(new Set(teamNames.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return unique.join(' X ');
}

export function countFilledMembers(sub: TeamSubmission): number {
  return (sub.members || []).filter((m) => isMemberComplete(m)).length;
}

/** One row per person with slots 1…n for merged squad display and export. */
export function normalizeMergedMemberSlots(members: TeamMemberPayload[]): TeamMemberPayload[] {
  const sorted = [...members].sort((a, b) => {
    const slot = a.slot - b.slot;
    if (slot !== 0) return slot;
    return (a.name || '').localeCompare(b.name || '');
  });
  return sorted.map((m, i) => ({ ...m, slot: i + 1 }));
}

const SLOT_MAX_FOR_MATCH = 3;
const MIN_SHARED_MEMBERS = 2;

export function memberIdentityKey(member: TeamMemberPayload): string | null {
  const enrollment = (member.enrollment_number || '').trim().toLowerCase();
  if (enrollment) return `enroll:${enrollment}`;
  const email = (member.email || '').trim().toLowerCase();
  if (email) return `email:${email}`;
  return null;
}

export function membersInSlotsOneToThree(members: TeamMemberPayload[]): TeamMemberPayload[] {
  return members.filter((m) => m.slot >= 1 && m.slot <= SLOT_MAX_FOR_MATCH);
}

export function identityKeysForSubmission(sub: TeamSubmission): Set<string> {
  const keys = new Set<string>();
  for (const m of membersInSlotsOneToThree(sub.members || [])) {
    const key = memberIdentityKey(m);
    if (key) keys.add(key);
  }
  return keys;
}

function sharedKeyCount(a: Set<string>, b: Set<string>): number {
  let count = 0;
  for (const key of a) {
    if (b.has(key)) count += 1;
  }
  return count;
}

class UnionFind {
  private parent = new Map<string, string>();

  add(id: string) {
    if (!this.parent.has(id)) this.parent.set(id, id);
  }

  find(id: string): string {
    const p = this.parent.get(id) ?? id;
    if (p !== id) {
      const root = this.find(p);
      this.parent.set(id, root);
      return root;
    }
    return id;
  }

  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }

  groups(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const id of this.parent.keys()) {
      const root = this.find(id);
      const list = map.get(root) ?? [];
      list.push(id);
      map.set(root, list);
    }
    return map;
  }
}

export function computeAutoMergeGroups(submissions: TeamSubmission[]): MergeGroup[] {
  const uf = new UnionFind();
  const keysById = new Map<string, Set<string>>();

  for (const sub of submissions) {
    uf.add(sub.id);
    keysById.set(sub.id, identityKeysForSubmission(sub));
  }

  for (let i = 0; i < submissions.length; i++) {
    for (let j = i + 1; j < submissions.length; j++) {
      const a = submissions[i];
      const b = submissions[j];
      const shared = sharedKeyCount(keysById.get(a.id)!, keysById.get(b.id)!);
      if (shared >= MIN_SHARED_MEMBERS) {
        uf.union(a.id, b.id);
      }
    }
  }

  const byId = new Map(submissions.map((s) => [s.id, s]));
  const rawGroups = uf.groups();

  const built = Array.from(rawGroups.values()).map((ids) =>
    buildMergeGroup(
      ids,
      byId,
      ids.length > 1
        ? `≥${MIN_SHARED_MEMBERS} matching members (slots 1–3)`
        : 'Single team (not merged)'
    )
  );

  return pairTwoMemberSquads(built, byId);
}

/** Pair remaining 2-member teams two-by-two when auto merge is on. */
function pairTwoMemberSquads(groups: MergeGroup[], byId: Map<string, TeamSubmission>): MergeGroup[] {
  const merged = groups.filter((g) => g.submissionIds.length > 1);
  const singles = groups.filter((g) => g.submissionIds.length === 1);

  const pairable = singles
    .filter((g) => {
      const sub = byId.get(g.submissionIds[0]);
      return sub ? countFilledMembers(sub) === 2 : false;
    })
    .sort((a, b) => {
      const ta = byId.get(a.submissionIds[0])?.created_at ?? '';
      const tb = byId.get(b.submissionIds[0])?.created_at ?? '';
      return ta.localeCompare(tb);
    });

  const notPairable = singles.filter((g) => !pairable.some((p) => p.id === g.id));
  const paired: MergeGroup[] = [];

  for (let i = 0; i < pairable.length; i += 2) {
    if (i + 1 >= pairable.length) {
      paired.push(pairable[i]);
      continue;
    }
    const ids = [pairable[i].submissionIds[0], pairable[i + 1].submissionIds[0]];
    paired.push(buildMergeGroup(ids, byId, 'Paired 2-member squads (auto)'));
  }

  return [...merged, ...paired, ...notPairable];
}

export function buildMergeGroup(
  submissionIds: string[],
  byId: Map<string, TeamSubmission>,
  matchReason: string
): MergeGroup {
  const teamNames: string[] = [];
  const sourceTeams: MergeGroupSourceTeam[] = [];
  const memberByKey = new Map<string, TeamMemberPayload>();

  for (const id of submissionIds) {
    const sub = byId.get(id);
    if (!sub) continue;
    teamNames.push(sub.team_name);
    sourceTeams.push({
      submissionId: id,
      teamName: sub.team_name,
      members: [...(sub.members || [])].sort((a, b) => a.slot - b.slot),
    });
    for (const m of sub.members || []) {
      const key = memberIdentityKey(m) ?? `slot:${m.slot}:${m.name}`;
      if (!memberByKey.has(key)) {
        memberByKey.set(key, m);
      }
    }
  }

  let members = normalizeMergedMemberSlots(Array.from(memberByKey.values()));
  let reason = matchReason;
  if (members.length > MAX_SQUAD_MEMBERS) {
    reason = `${matchReason} (showing first ${MAX_SQUAD_MEMBERS} of ${members.length} members)`;
    members = members.slice(0, MAX_SQUAD_MEMBERS);
  }

  return {
    id: submissionIds.slice().sort().join('_'),
    submissionIds: submissionIds.slice(),
    teamNames,
    mergedTeamName: formatMergedTeamName(teamNames),
    members,
    sourceTeams,
    matchReason: reason,
  };
}

export function buildManualMergeGroups(
  submissions: TeamSubmission[],
  groupMap: Map<string, string>
): MergeGroup[] {
  const byId = new Map(submissions.map((s) => [s.id, s]));
  const buckets = new Map<string, string[]>();

  for (const sub of submissions) {
    const leader = groupMap.get(sub.id) ?? sub.id;
    const list = buckets.get(leader) ?? [];
    list.push(sub.id);
    buckets.set(leader, list);
  }

  return Array.from(buckets.entries()).map(([leader, ids]) => {
    const uniqueIds = Array.from(new Set(ids));
    const reason =
      uniqueIds.length > 1 ? 'Manual merge' : 'Single team (not merged)';
    return buildMergeGroup(uniqueIds, byId, reason);
  });
}

export function applyManualMerge(
  groupMap: Map<string, string>,
  selectedIds: string[],
  submissions: TeamSubmission[]
): Map<string, string> {
  if (selectedIds.length < 2) return groupMap;

  const next = new Map(groupMap);
  const leaders = selectedIds.map((id) => next.get(id) ?? id);
  const targetLeader = leaders.sort()[0];

  for (const id of selectedIds) {
    next.set(id, targetLeader);
  }

  for (const sub of submissions) {
    const leader = next.get(sub.id);
    if (leader && selectedIds.includes(leader)) {
      next.set(sub.id, targetLeader);
    }
  }

  return next;
}

/** Remove merged grouping so each submission displays as its own team again. */
export function applyManualUnmerge(
  groupMap: Map<string, string>,
  submissionIds: string[]
): Map<string, string> {
  const next = new Map(groupMap);
  for (const id of submissionIds) {
    next.delete(id);
  }
  return next;
}

export function pruneManualGroupMap(
  map: Map<string, string>,
  validSubmissionIds: Iterable<string>
): Map<string, string> {
  const valid = new Set(validSubmissionIds);
  const next = new Map<string, string>();
  for (const [id, leader] of map) {
    if (!valid.has(id)) continue;
    next.set(id, valid.has(leader) ? leader : id);
  }
  return next;
}

export function manualGroupMapToJson(map: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(map));
}

export function manualGroupMapFromJson(raw: string | null): Map<string, string> {
  if (!raw) return new Map();
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (!parsed || typeof parsed !== 'object') return new Map();
    return new Map(Object.entries(parsed).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'));
  } catch {
    return new Map();
  }
}

export function manualGroupMapsEqual(a: Map<string, string>, b: Map<string, string>): boolean {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

export type MergerExportRow = {
  merged_team_name: string;
  team_size: string;
  merge_group: string;
  team_names: string;
  merge_reason: string;
  member_slot: string;
  name: string;
  enrollment_number: string;
  email: string;
  branch: string;
  year: string;
  submission_id: string;
  submitted_at: string;
};

export const MERGER_EXPORT_HEADERS: (keyof MergerExportRow)[] = [
  'merged_team_name',
  'team_size',
  'merge_group',
  'team_names',
  'merge_reason',
  'member_slot',
  'name',
  'enrollment_number',
  'email',
  'branch',
  'year',
  'submission_id',
  'submitted_at',
];

/** Label used in participant import (Solo / Duo / Trio / Squad). */
export function teamSizeLabelFromMemberCount(count: number): string {
  if (count <= 1) return 'Solo';
  if (count === 2) return 'Duo';
  if (count === 3) return 'Trio';
  return 'Squad';
}

function mergerRowsForGroup(
  group: MergeGroup,
  subById: Map<string, TeamSubmission>
): MergerExportRow[] {
  const label = group.mergedTeamName;
  const sources = group.teamNames.join(', ');
  const activeMembers = group.members.filter((m) => (m.email || '').trim() || (m.name || '').trim());
  const team_size = teamSizeLabelFromMemberCount(activeMembers.length || group.members.length);

  if (group.members.length === 0) {
    return [
      {
        merged_team_name: label,
        team_size,
        merge_group: label,
        team_names: sources,
        merge_reason: group.matchReason,
        member_slot: '',
        name: '',
        enrollment_number: '',
        email: '',
        branch: '',
        year: '',
        submission_id: group.submissionIds.join('|'),
        submitted_at: '',
      },
    ];
  }

  const firstSub = subById.get(group.submissionIds[0]);
  return group.members.map((m) => ({
    merged_team_name: label,
    team_size,
    merge_group: label,
    team_names: sources,
    merge_reason: group.matchReason,
    member_slot: String(m.slot ?? ''),
    name: m.name ?? '',
    enrollment_number: m.enrollment_number ?? '',
    email: m.email ?? '',
    branch: m.branch ?? '',
    year: m.year ?? '',
    submission_id: group.submissionIds.join('|'),
    submitted_at: firstSub?.created_at ?? '',
  }));
}

export function buildMergerExportRows(
  submissions: TeamSubmission[],
  groups: MergeGroup[],
  mode: 'full' | 'merged'
): MergerExportRow[] {
  const subById = new Map(submissions.map((s) => [s.id, s]));
  const rows: MergerExportRow[] = [];

  /** Full export = every roster row with current merge-group team names (paste into participant import). */
  const exportGroups =
    mode === 'merged' ? groups.filter((g) => g.submissionIds.length > 1) : groups;

  for (const group of exportGroups) {
    rows.push(...mergerRowsForGroup(group, subById));
  }

  return rows;
}
