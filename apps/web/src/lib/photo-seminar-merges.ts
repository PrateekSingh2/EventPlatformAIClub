import {
  applyManualMerge,
  applyManualUnmerge,
  buildMergeGroup,
  countFilledMembers,
  manualGroupMapFromJson,
  pruneManualGroupMap,
  type TeamSubmission,
} from '@/lib/team-merger';
import {
  buildFinalTeamsFromMerger,
  dedupeFinalTeams,
  mergeGroupToFinalTeam,
  resolveMergeManualMapForSync,
  teamKeyFromSubmissionIds,
  type FinalTeamRecord,
} from '@/lib/final-teams';
import {
  loadFinalTeams,
  loadFinalTeamsConfig,
  replaceFinalTeams,
  saveFinalTeamsMergeSnapshot,
} from '@/lib/final-teams-db';
import { buildAssignmentKey, type StoredSeminarHallRow } from '@/lib/seminar-halls';
import { syncUsersFromFinalTeams } from '@/lib/sync-users-from-final-teams';
import type { SupabaseClient } from '@supabase/supabase-js';

export type PhotoMergeGroupSpec = {
  label: string;
  enrollments: string[];
  preferTeamNames: string[];
  /** Preferred hall when inferring from old rows (optional). */
  preferredHall?: string;
};

export const PHOTO_SEMINAR_MERGE_GROUPS: PhotoMergeGroupSpec[] = [
  {
    label: 'Paradox + RCB',
    enrollments: ['BTIR25O1014', 'BTIR25O1013', 'BTMC25O1131', 'BTCD25O1074'],
    preferTeamNames: ['Paradox', 'RCB', 'Team rocket', 'Black clover'],
    preferredHall: 'SH7',
  },
  {
    label: 'Black Cover + Chambal ke Daku + ASTITVA',
    enrollments: ['BTIR26O1032', 'BTIR26O1030', 'BTEC26O1026', 'BTEC26O1023'],
    preferTeamNames: [
      'Black Cover',
      'Black cover',
      'Chambal ke Daku',
      'Chambal Ke Daku',
      'ASTITVA',
      'Astitva',
    ],
    preferredHall: 'SH3',
  },
  {
    label: 'PIXELS + Scouts Regiments + XYZ',
    enrollments: ['BTCE25O1057', 'BTCS25O1016', 'BTCD25O1079', 'BTCD25O1130'],
    preferTeamNames: [
      'PIXELS',
      'PIXEL',
      'Scouts Regiments',
      'Scouts regiment',
      'XYZ',
      'Xyz',
      'warriors 3',
    ],
    preferredHall: 'SH3',
  },
];

/** Voice note 2026-10-25 — CSV + production duo submissions verified. */
export type FixedSeminarMergeSpec = {
  label: string;
  enrollments: string[];
  submissionIds: string[];
  /** Break prior manual bins before applying this squad. */
  unmergeSubmissionIds: string[];
  preferredHall?: string;
};

/** Pinned squads from seminar voice/photo notes — CSV + production submission IDs. */
export const PINNED_SEMINAR_MERGE_GROUPS: FixedSeminarMergeSpec[] = [
  {
    label: 'dual bytes X Team Vanta',
    enrollments: ['BTCB26O1055', 'BTCB26O1069', 'BTAD26O1076', 'BTAD26O1048'],
    submissionIds: [
      '9b856921-0e2c-4bed-9014-8a275a367f9c',
      '201512e8-9120-4f3f-a76c-de629a5fa5ef',
    ],
    unmergeSubmissionIds: [
      '9b856921-0e2c-4bed-9014-8a275a367f9c',
      '4d0a987d-8e80-430b-b10e-3e60a2255633',
      '201512e8-9120-4f3f-a76c-de629a5fa5ef',
      '328bc7d4-1c5d-4046-81aa-c96c091fe2fd',
      '797689e9-1fba-479e-a23a-bef5b7cd4bad',
    ],
    preferredHall: 'SH7',
  },
  {
    label: 'Default X Void coders',
    enrollments: ['BTAI26O1006', 'BTAI26O1059', 'BTAI26O3D03', 'BTAI26O3D07'],
    submissionIds: [
      'c239e098-d0ff-4a1b-a1eb-6e7ec8c11755',
      '27d336ae-19b4-4cd2-a6b3-ea9cb47c57b7',
    ],
    unmergeSubmissionIds: [
      'c239e098-d0ff-4a1b-a1eb-6e7ec8c11755',
      'd8a7eefc-988d-4069-8154-b9ff22e62a00',
      '27d336ae-19b4-4cd2-a6b3-ea9cb47c57b7',
      '797689e9-1fba-479e-a23a-bef5b7cd4bad',
      'fefd3f96-ee73-47bd-9614-7750430ab151',
      '2c61b9e1-0568-4705-a7f1-f8b871746e1e',
    ],
    preferredHall: 'SH7',
  },
  {
    label: 'Double lol',
    enrollments: ['BTMC26O1010', 'BTMC26O1061', 'BTMC26O1088', 'BTMC26O1133'],
    submissionIds: ['8d478e91-6f4c-4f9b-b48b-ed9ccf084050'],
    unmergeSubmissionIds: [
      '8d478e91-6f4c-4f9b-b48b-ed9ccf084050',
      'a77cfe64-77d6-4bab-8e3a-3b8de292cf19',
      'f1e750cc-773a-40ab-9041-a78426f9f5cd',
      '3f9e3a51-0ab2-4154-bef4-d04e11fb90e7',
      '2377e053-f930-4e72-819e-86b95bb887f3',
    ],
    preferredHall: 'SH3',
  },
  {
    label: 'PROMPT PIONEERS',
    enrollments: ['BTAI25O1086', 'BTIO25O1115', 'BTAI26O1009', 'BTAI26O1019'],
    submissionIds: ['6a51006b-caa6-41a7-b96e-d5b082e233e1'],
    unmergeSubmissionIds: [
      '6a51006b-caa6-41a7-b96e-d5b082e233e1',
      '11baebed-aa79-4f5c-89df-ae9df689eb28',
      '744ab595-a745-4d05-b686-dee1f5e75dc1',
    ],
    preferredHall: 'SH7',
  },
  {
    label: 'Paradox X RCB',
    enrollments: ['BTIR25O1014', 'BTIR25O1013', 'BTMC25O1131', 'BTCD25O1074'],
    submissionIds: [
      '9759a387-24ee-4cc1-a05b-7369e50440d1',
      '95c6f03a-a1b1-42b8-a3c6-1320ad2d56d5',
      'd1765cd0-a1f0-4661-97af-22777a2ec7fd',
    ],
    unmergeSubmissionIds: [
      '9759a387-24ee-4cc1-a05b-7369e50440d1',
      '5470f1a4-a7f5-4c8f-bc8f-8f3944be29dc',
      '95c6f03a-a1b1-42b8-a3c6-1320ad2d56d5',
      'd1765cd0-a1f0-4661-97af-22777a2ec7fd',
      '4c572bed-a757-4ccf-ac8d-551b9b541cb3',
      '5de6b070-e60c-4ada-ad08-5ae2dd631e99',
      '408a923e-6040-4246-92c3-83dca0473d10',
      '13008675-c5c2-4361-a101-b318039b20a6',
    ],
    preferredHall: 'SH7',
  },
  {
    label: 'Black Cover X Chambal ke Daku X Astitva',
    enrollments: ['BTIR26O1032', 'BTIR26O1030', 'BTEC26O1026', 'BTEC26O1023'],
    submissionIds: [
      '34872889-e659-44d2-a8a7-d9335c3204ab',
      'e1de3bc6-26f9-40be-8e51-f958e04edcff',
      'ed701e34-b321-48ea-8ff2-6667cb338778',
    ],
    unmergeSubmissionIds: [
      '34872889-e659-44d2-a8a7-d9335c3204ab',
      'e1de3bc6-26f9-40be-8e51-f958e04edcff',
      'ed701e34-b321-48ea-8ff2-6667cb338778',
      '4c572bed-a757-4ccf-ac8d-551b9b541cb3',
      '4dcd4418-c05b-4fc6-8852-659ce8a68850',
      '8606fa65-1d68-4a93-bfe3-e2586d44d59a',
      '1f23d257-03b2-4957-b280-3f1240cf329b',
      'f6c26a75-8a22-4c29-9be5-39b129d6ee39',
    ],
    preferredHall: 'SH3',
  },
  {
    label: 'PIXELS X Scouts Regiments X XYZ',
    enrollments: ['BTCE25O1057', 'BTCS25O1016', 'BTCD25O1079', 'BTCD25O1130'],
    submissionIds: [
      '8ab5b1bb-bed1-4445-9744-65fd1b99f57b',
      '1f23d257-03b2-4957-b280-3f1240cf329b',
      '7d9bdb1b-e996-4a1f-bd86-e496c28ce7f6',
    ],
    unmergeSubmissionIds: [
      '8ab5b1bb-bed1-4445-9744-65fd1b99f57b',
      '1f23d257-03b2-4957-b280-3f1240cf329b',
      '7d9bdb1b-e996-4a1f-bd86-e496c28ce7f6',
      '30c8a7e1-52ca-4ef0-af62-e10b90704542',
      '2cf586d2-e5b9-4788-ad2b-a106811cde1e',
      '9a3326a9-71c9-4952-bbdd-7499a33a05bb',
      '30f0fbe4-2482-42d6-b05e-1ea2a60081e7',
    ],
    preferredHall: 'SH3',
  },
];

/** @deprecated use PINNED_SEMINAR_MERGE_GROUPS */
export const VOICE_SEMINAR_FIXED_MERGE_GROUPS = PINNED_SEMINAR_MERGE_GROUPS;

export const ALL_SEMINAR_MANUAL_MERGE_GROUPS: PhotoMergeGroupSpec[] = [...PHOTO_SEMINAR_MERGE_GROUPS];

function normEnroll(e: string): string {
  return e.replace(/\s/g, '').toUpperCase();
}

function teamNameScore(teamName: string, preferTeamNames: string[]): number {
  const t = teamName.trim().toLowerCase();
  for (let i = 0; i < preferTeamNames.length; i++) {
    const p = preferTeamNames[i].trim().toLowerCase();
    if (t === p) return i;
    if (t.includes(p) || p.includes(t)) return preferTeamNames.length + i;
  }
  return 1000;
}

/** One submission per enrollment — prefer small squads + photo team names (not big auto-merges). */
export function submissionIdsForPhotoGroup(
  submissions: TeamSubmission[],
  spec: PhotoMergeGroupSpec
): string[] {
  const targets = new Set(spec.enrollments.map(normEnroll));
  const hits: TeamSubmission[] = [];

  for (const sub of submissions) {
    const memberEnrolls = (sub.members || []).map((m) => normEnroll(m.enrollment_number || ''));
    if (memberEnrolls.some((e) => targets.has(e))) hits.push(sub);
  }

  const pickOne = (enroll: string): TeamSubmission | undefined => {
    const e = normEnroll(enroll);
    const matching = hits.filter((s) =>
      (s.members || []).some((m) => normEnroll(m.enrollment_number || '') === e)
    );
    if (matching.length === 0) return undefined;

    return matching.slice().sort((a, b) => {
      const scoreA = teamNameScore(a.team_name, spec.preferTeamNames);
      const scoreB = teamNameScore(b.team_name, spec.preferTeamNames);
      if (scoreA !== scoreB) return scoreA - scoreB;
      const membersA = countFilledMembers(a);
      const membersB = countFilledMembers(b);
      if (membersA !== membersB) return membersA - membersB;
      return a.created_at.localeCompare(b.created_at);
    })[0];
  };

  const ids: string[] = [];
  for (const enroll of spec.enrollments) {
    const sub = pickOne(enroll);
    if (sub && !ids.includes(sub.id)) ids.push(sub.id);
  }
  return ids;
}

function assertPhotoGroupSubmissions(
  submissions: TeamSubmission[],
  spec: { label: string; enrollments: string[] },
  submissionIds: string[]
): void {
  const byId = new Map(submissions.map((s) => [s.id, s]));
  const targets = new Set(spec.enrollments.map(normEnroll));
  const covered = new Set<string>();
  for (const id of submissionIds) {
    const sub = byId.get(id);
    if (!sub) continue;
    for (const m of sub.members || []) {
      const e = normEnroll(m.enrollment_number || '');
      if (targets.has(e)) covered.add(e);
    }
  }
  if (covered.size < spec.enrollments.length) {
    throw new Error(
      `${spec.label}: only ${covered.size}/${spec.enrollments.length} enrollments covered by submissions ${submissionIds.join(', ')}`
    );
  }
  if (submissionIds.length < 2 && covered.size < spec.enrollments.length) {
    throw new Error(
      `${spec.label}: need at least 2 submissions to merge, got ${submissionIds.length} (covers ${covered.size} enrollments)`
    );
  }
}

function inferHallForSubmissionIds(
  storedHalls: StoredSeminarHallRow[],
  submissionIds: string[],
  fallback?: string
): string | null {
  const idSet = new Set(submissionIds);
  const halls: string[] = [];
  for (const row of storedHalls) {
    const ids = row.submission_ids ?? [];
    if (ids.some((id) => idSet.has(id))) {
      const h = row.seminar_hall?.trim().toUpperCase();
      if (h) halls.push(h);
    }
  }
  if (halls.length > 0) {
    const counts = new Map<string, number>();
    for (const h of halls) counts.set(h, (counts.get(h) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }
  return fallback?.trim().toUpperCase() ?? null;
}

function enrollmentSet(enrollments: string[]): Set<string> {
  return new Set(enrollments.map(normEnroll));
}

function teamTouchesEnrollments(team: FinalTeamRecord, targets: Set<string>): boolean {
  const es = (team.members || []).map((m) => normEnroll(m.enrollment_number || ''));
  return es.some((e) => targets.has(e));
}

function pinFixedVoiceSquads(
  teams: FinalTeamRecord[],
  specs: FixedSeminarMergeSpec[],
  subs: TeamSubmission[],
  storedHalls: StoredSeminarHallRow[],
  existingByKey: Map<string, FinalTeamRecord>
): FinalTeamRecord[] {
  const byId = new Map(subs.map((s) => [s.id, s]));
  let result = teams;

  for (const spec of specs) {
    const targets = enrollmentSet(spec.enrollments);
    const group = buildMergeGroup(spec.submissionIds, byId, 'Seminar pinned squad');
    const hall =
      inferHallForSubmissionIds(storedHalls, spec.submissionIds, spec.preferredHall) ??
      spec.preferredHall ??
      null;
    const key = teamKeyFromSubmissionIds(spec.submissionIds);
    const prev =
      existingByKey.get(key) ??
      result.find((t) => teamKeyFromSubmissionIds(t.submission_ids ?? []) === key);
    const pinned = mergeGroupToFinalTeam(group, hall, prev?.access_token, prev?.sort_order ?? 0);
    pinned.seminar_hall = hall;
    pinned.source_team_names = [...new Set(group.teamNames)];

    result = result.filter((t) => !teamTouchesEnrollments(t, targets));
    result.push(pinned);
  }

  return dedupeFinalTeams(result);
}

function finalTeamForEnrollments(
  teams: FinalTeamRecord[],
  enrollments: string[]
): FinalTeamRecord | undefined {
  const target = new Set(enrollments.map(normEnroll));
  return teams.find((t) => {
    const es = new Set((t.members || []).map((m) => normEnroll(m.enrollment_number || '')));
    for (const e of target) {
      if (!es.has(e)) return false;
    }
    return target.size >= 4;
  });
}

export type ApplyPhotoSeminarMergesResult = {
  submissionGroups: { label: string; submissionIds: string[] }[];
  manualMapSize: number;
  teamCount: number;
  verification: { label: string; ok: boolean; mergedTeamName?: string; memberCount?: number }[];
  usersSync?: { ok: boolean; count: number; error?: string };
  seminarHallUpserts: number;
};

export async function applyPhotoSeminarMerges(
  supabase: SupabaseClient
): Promise<ApplyPhotoSeminarMergesResult> {
  const { data: submissions, error: subErr } = await supabase
    .from('team_registration_submissions')
    .select('id, team_name, members, squad_merge_opt_in, created_at')
    .order('created_at', { ascending: true });

  if (subErr) throw subErr;
  const subs = (submissions || []) as TeamSubmission[];

  const pinnedGroups = PINNED_SEMINAR_MERGE_GROUPS;

  const configBefore = await loadFinalTeamsConfig();
  let storedHalls: StoredSeminarHallRow[] = [];
  const { data: hallRows } = await supabase
    .from('seminar_hall_assignments')
    .select('assignment_key, seminar_hall, merged_team_name, source_team_names, submission_ids, updated_at');
  if (Array.isArray(hallRows)) storedHalls = hallRows as StoredSeminarHallRow[];

  let manualMap = resolveMergeManualMapForSync(null, storedHalls, configBefore.merge_manual_map);
  manualMap = pruneManualGroupMap(
    manualMap,
    subs.map((s) => s.id)
  );

  const submissionGroups: { label: string; submissionIds: string[] }[] = [];
  for (const spec of pinnedGroups) {
    assertPhotoGroupSubmissions(subs, spec, spec.submissionIds);
    for (const id of spec.unmergeSubmissionIds) {
      manualMap = applyManualUnmerge(manualMap, [id]);
    }
    manualMap = applyManualMerge(manualMap, spec.submissionIds, subs);
    submissionGroups.push({ label: spec.label, submissionIds: spec.submissionIds });
  }

  const existing = await loadFinalTeams();
  const existingByKey = new Map(existing.map((t) => [t.team_key, t]));

  let built = buildFinalTeamsFromMerger(subs, false, manualMap, storedHalls, existingByKey);
  built = pinFixedVoiceSquads(built, pinnedGroups, subs, storedHalls, existingByKey);

  const hallUpserts: {
    assignment_key: string;
    seminar_hall: string;
    merged_team_name: string;
    source_team_names: string[];
    submission_ids: string[];
    updated_at: string;
  }[] = [];

  const hallSpecs = pinnedGroups.map((spec) => ({ spec, ids: spec.submissionIds }));

  for (const { spec, ids } of hallSpecs) {
    const team = finalTeamForEnrollments(built, spec.enrollments);
    if (!team) continue;
    const hall =
      inferHallForSubmissionIds(storedHalls, ids, spec.preferredHall) ?? spec.preferredHall ?? 'SH3';
    team.seminar_hall = hall;
    const source = team.source_team_names?.length
      ? team.source_team_names
      : [team.team_name];
    hallUpserts.push({
      assignment_key: buildAssignmentKey(source),
      seminar_hall: hall,
      merged_team_name: team.team_name,
      source_team_names: source,
      submission_ids: team.submission_ids ?? ids,
      updated_at: new Date().toISOString(),
    });
  }

  built = built.map((row) => {
    const match = hallUpserts.find(
      (u) => u.submission_ids.join('|') === (row.submission_ids ?? []).slice().sort().join('|')
    );
    if (match) return { ...row, seminar_hall: match.seminar_hall };
    return row;
  });

  for (const row of hallUpserts) {
    const { error } = await supabase.from('seminar_hall_assignments').upsert(row, {
      onConflict: 'assignment_key',
    });
    if (error) throw error;
  }

  await replaceFinalTeams(built);
  await saveFinalTeamsMergeSnapshot(false, Object.fromEntries(manualMap.entries()));

  const saved = await loadFinalTeams();
  const configAfter = await loadFinalTeamsConfig();

  const verifySpecs = pinnedGroups.map((s) => ({ label: s.label, enrollments: s.enrollments }));
  const verification = verifySpecs.map((spec) => {
    const team = finalTeamForEnrollments(saved, spec.enrollments);
    return {
      label: spec.label,
      ok: Boolean(team && (team.members?.length ?? 0) >= 4),
      mergedTeamName: team?.team_name,
      memberCount: team?.members?.length,
    };
  });

  let usersSync: ApplyPhotoSeminarMergesResult['usersSync'];
  if (configAfter.locked) {
    const sync = await syncUsersFromFinalTeams(saved, supabase);
    usersSync = sync.ok
      ? { ok: true, count: sync.count }
      : { ok: false, count: sync.count, error: sync.error };
  }

  return {
    submissionGroups,
    manualMapSize: manualMap.size,
    teamCount: saved.length,
    verification,
    usersSync,
    seminarHallUpserts: hallUpserts.length,
  };
}

/** For tests / scripts: build manual map JSON without writing DB. */
export function buildPhotoMergeManualMapJson(submissions: TeamSubmission[]): string {
  const groups = PHOTO_SEMINAR_MERGE_GROUPS.map((spec) => submissionIdsForPhotoGroup(submissions, spec));
  let map = new Map<string, string>();
  for (const ids of groups) {
    if (ids.length >= 2) map = applyManualMerge(map, ids, submissions);
  }
  return JSON.stringify(Object.fromEntries(map.entries()));
}

export function parseManualMapFromConfig(raw: Record<string, string> | null | undefined): Map<string, string> {
  return manualGroupMapFromJson(raw ? JSON.stringify(raw) : null);
}
