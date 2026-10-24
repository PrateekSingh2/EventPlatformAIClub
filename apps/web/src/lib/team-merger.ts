import type { TeamMemberPayload } from '@/lib/team-registration-form';

export type TeamSubmission = {
  id: string;
  team_name: string;
  members: TeamMemberPayload[];
  squad_merge_opt_in?: boolean | null;
  created_at: string;
};

/** Teams eligible for merger: opted in Yes, or legacy rows before opt-in (null). Excludes explicit No. */
export function filterMergerEligibleSubmissions(submissions: TeamSubmission[]): TeamSubmission[] {
  return submissions.filter((s) => s.squad_merge_opt_in !== false);
}

export type MergeGroup = {
  id: string;
  submissionIds: string[];
  teamNames: string[];
  /** Display / export name: single team keeps name; merged teams use "A X B". */
  mergedTeamName: string;
  members: TeamMemberPayload[];
  matchReason: string;
};

export function formatMergedTeamName(teamNames: string[]): string {
  const unique = Array.from(new Set(teamNames.map((n) => n.trim()).filter(Boolean)));
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return unique.join(' X ');
}

export function countFilledMembers(sub: TeamSubmission): number {
  return (sub.members || []).filter((m) => memberIdentityKey(m) !== null || (m.name || '').trim()).length;
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
  const memberByKey = new Map<string, TeamMemberPayload>();

  for (const id of submissionIds) {
    const sub = byId.get(id);
    if (!sub) continue;
    teamNames.push(sub.team_name);
    for (const m of sub.members || []) {
      const key = memberIdentityKey(m) ?? `slot:${m.slot}:${m.name}`;
      if (!memberByKey.has(key)) {
        memberByKey.set(key, m);
      }
    }
  }

  const members = normalizeMergedMemberSlots(Array.from(memberByKey.values()));

  return {
    id: submissionIds.slice().sort().join('_'),
    submissionIds: submissionIds.slice(),
    teamNames,
    mergedTeamName: formatMergedTeamName(teamNames),
    members,
    matchReason,
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

export type MergerExportRow = {
  merged_team_name: string;
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

export function buildMergerExportRows(
  submissions: TeamSubmission[],
  groups: MergeGroup[],
  mode: 'full' | 'merged'
): MergerExportRow[] {
  const subById = new Map(submissions.map((s) => [s.id, s]));
  const rows: MergerExportRow[] = [];

  if (mode === 'full') {
    for (const sub of submissions) {
      const members = sub.members?.length ? sub.members : [{ slot: 1, name: '', enrollment_number: '', email: '', branch: '', year: '' }];
      for (const m of members) {
        rows.push({
          merged_team_name: sub.team_name,
          merge_group: sub.team_name,
          team_names: sub.team_name,
          merge_reason: 'Original submission',
          member_slot: String(m.slot ?? ''),
          name: m.name ?? '',
          enrollment_number: m.enrollment_number ?? '',
          email: m.email ?? '',
          branch: m.branch ?? '',
          year: m.year ?? '',
          submission_id: sub.id,
          submitted_at: sub.created_at,
        });
      }
    }
    return rows;
  }

  for (const group of groups) {
    const label = group.mergedTeamName;
    const sources = group.teamNames.join(', ');
    if (group.members.length === 0) {
      rows.push({
        merged_team_name: label,
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
      });
      continue;
    }
    for (const m of group.members) {
      const firstSub = subById.get(group.submissionIds[0]);
      rows.push({
        merged_team_name: label,
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
      });
    }
  }

  return rows;
}
