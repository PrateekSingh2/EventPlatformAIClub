import type { TeamMemberPayload } from '@/lib/team-registration-form';

export type TeamSubmission = {
  id: string;
  team_name: string;
  members: TeamMemberPayload[];
  created_at: string;
};

export type MergeGroup = {
  id: string;
  submissionIds: string[];
  teamNames: string[];
  members: TeamMemberPayload[];
  matchReason: string;
};

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

  return Array.from(rawGroups.values()).map((ids) =>
    buildMergeGroup(ids, byId, `≥${MIN_SHARED_MEMBERS} matching members (slots 1–3)`)
  );
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

  const members = Array.from(memberByKey.values()).sort((a, b) => a.slot - b.slot);

  return {
    id: submissionIds.slice().sort().join('_'),
    submissionIds: submissionIds.slice(),
    teamNames,
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
    const label = group.teamNames.join(' + ');
    if (group.members.length === 0) {
      rows.push({
        merge_group: label,
        team_names: group.teamNames.join(', '),
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
        merge_group: label,
        team_names: group.teamNames.join(', '),
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
