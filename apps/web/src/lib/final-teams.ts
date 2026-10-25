import { generateAccessToken } from '@/lib/auth';
import type { TeamMemberPayload } from '@/lib/team-registration-form';
import {
    buildManualMergeGroups,
    computeAutoMergeGroups,
    filterMergerEligibleSubmissions,
    manualGroupMapFromJson,
    teamSizeLabelFromMemberCount,
    type MergeGroup,
    type TeamSubmission,
} from '@/lib/team-merger';
import { storedHallMap, type StoredSeminarHallRow } from '@/lib/seminar-halls';
import {
    cleanPlatformLabel,
    rosterMemberKey,
    teamNameAndRosterKey,
} from '@/lib/roster-dedupe';

export type FinalTeamMember = TeamMemberPayload;

export type FinalTeamRecord = {
    id?: string;
    team_key: string;
    team_name: string;
    team_size: string;
    access_token: string;
    members: FinalTeamMember[];
    source_team_names: string[];
    submission_ids: string[];
    seminar_hall: string | null;
    sort_order: number;
};

export type FinalTeamsConfig = {
    locked: boolean;
    locked_at: string | null;
    updated_at: string | null;
};

export function teamKeyFromSubmissionIds(ids: string[]): string {
    return ids.slice().sort().join('|');
}

export function mergeGroupToFinalTeam(
    group: MergeGroup,
    seminarHall: string | null,
    existingToken?: string,
    sortOrder = 0
): FinalTeamRecord {
    const activeMembers = group.members.filter((m) => (m.email || m.name || '').trim());
    const count = activeMembers.length || group.members.length;
    return {
        team_key: teamKeyFromSubmissionIds(group.submissionIds),
        team_name: group.mergedTeamName,
        team_size: teamSizeLabelFromMemberCount(count),
        access_token: (existingToken || generateAccessToken()).trim().toUpperCase(),
        members: group.members,
        source_team_names: group.teamNames,
        submission_ids: group.submissionIds,
        seminar_hall: seminarHall,
        sort_order: sortOrder,
    };
}

export function computeMergeGroupsForFinalRoster(
    submissions: TeamSubmission[],
    autoMerge: boolean,
    manualGroupMapJson: string | null
): MergeGroup[] {
    const manualGroupMap = manualGroupMapFromJson(manualGroupMapJson);
    if (autoMerge) {
        const eligible = filterMergerEligibleSubmissions(submissions);
        return computeAutoMergeGroups(eligible);
    }
    return buildManualMergeGroups(submissions, manualGroupMap);
}

function platformTeamNameFromRecord(row: FinalTeamRecord): string {
    const sources = row.source_team_names.map(cleanPlatformLabel).filter(Boolean);
    if (sources.length >= 1) return sources[0];
    return cleanPlatformLabel(row.team_name);
}

function mergeMemberPayloadRows(rows: FinalTeamRecord[]): FinalTeamMember[] {
    const byKey = new Map<string, FinalTeamMember>();
    for (const row of rows) {
        for (const m of row.members) {
            const key = rosterMemberKey(m);
            if (!key) continue;
            if (!byKey.has(key)) {
                byKey.set(key, m);
            }
        }
    }
    return [...byKey.values()].sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0));
}

/** Same normalized team name + same member roster → one row (platform source name kept). */
export function dedupeFinalTeams(teams: FinalTeamRecord[]): FinalTeamRecord[] {
    const sorted = [...teams].sort((a, b) => a.sort_order - b.sort_order);
    const groups = new Map<string, FinalTeamRecord[]>();

    for (const row of sorted) {
        const key = teamNameAndRosterKey(row.team_name, row.members);
        if (!key) continue;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }

    const keptKeys = new Set<string>();
    const output: FinalTeamRecord[] = [];

    for (const row of sorted) {
        const key = teamNameAndRosterKey(row.team_name, row.members);
        if (!key) {
            output.push(row);
            continue;
        }
        if (keptKeys.has(key)) continue;
        keptKeys.add(key);

        const group = groups.get(key)!;
        const winner: FinalTeamRecord = {
            ...group[0],
            members: [...group[0].members],
            source_team_names: [...group[0].source_team_names],
            submission_ids: [...group[0].submission_ids],
        };
        winner.team_name = platformTeamNameFromRecord(winner);
        if (group.length > 1) {
            winner.members = mergeMemberPayloadRows(group);
            const submissionIds = new Set(winner.submission_ids);
            for (const other of group.slice(1)) {
                for (const id of other.submission_ids) submissionIds.add(id);
            }
            winner.submission_ids = [...submissionIds];
        }
        output.push(winner);
    }

    return output.map((row, index) => ({
        ...row,
        sort_order: index,
        team_name: platformTeamNameFromRecord(row),
    }));
}

export function buildFinalTeamsFromMerger(
    submissions: TeamSubmission[],
    autoMerge: boolean,
    manualGroupMapJson: string | null,
    storedHalls: StoredSeminarHallRow[],
    existingByKey: Map<string, FinalTeamRecord>
): FinalTeamRecord[] {
    const groups = computeMergeGroupsForFinalRoster(submissions, autoMerge, manualGroupMapJson);
    const hallByKey = storedHallMap(storedHalls);

    const built = groups
        .slice()
        .sort((a, b) => a.mergedTeamName.localeCompare(b.mergedTeamName, undefined, { sensitivity: 'base' }))
        .map((group, index) => {
            const key = teamKeyFromSubmissionIds(group.submissionIds);
            const prev = existingByKey.get(key);
            const hall = hallByKey.get(key) ?? prev?.seminar_hall ?? null;
            return mergeGroupToFinalTeam(
                group,
                hall,
                prev?.access_token,
                index
            );
        });
    return dedupeFinalTeams(built);
}

export function buildEmailByFinalTeamMaps(teams: FinalTeamRecord[]): {
    emailToTeam: Map<string, FinalTeamRecord>;
    tokenByEmail: Map<string, string>;
} {
    const emailToTeam = new Map<string, FinalTeamRecord>();
    const tokenByEmail = new Map<string, string>();
    for (const team of teams) {
        const token = team.access_token.trim().toUpperCase();
        for (const m of team.members) {
            const email = (m.email || '').trim().toLowerCase();
            if (!email.includes('@')) continue;
            emailToTeam.set(email, team);
            tokenByEmail.set(email, token);
        }
    }
    return { emailToTeam, tokenByEmail };
}

export function finalTeamsToEmailRecipients(teams: FinalTeamRecord[]) {
    const recipients: Array<{
        name: string;
        email: string;
        token: string;
        team_name: string;
        team_size: string;
        team_members: Array<{ name: string; email: string }>;
    }> = [];

    for (const team of teams) {
        const roster = team.members
            .filter((m) => (m.email || '').trim())
            .map((m) => ({ name: m.name || 'Participant', email: m.email.trim() }));
        if (roster.length === 0) continue;
        const token = team.access_token.trim().toUpperCase();
        for (const member of roster) {
            recipients.push({
                name: member.name,
                email: member.email,
                token,
                team_name: team.team_name,
                team_size: team.team_size,
                team_members: roster,
            });
        }
    }
    return recipients;
}

function csvEscape(value: string): string {
    if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
}

export function buildFinalTeamsExportCsv(teams: FinalTeamRecord[]): string {
    const headers = [
        'seminar_hall',
        'merged_team_name',
        'team_size',
        'access_token',
        'team_key',
        'source_team_names',
        'member_slot',
        'name',
        'enrollment_number',
        'email',
        'branch',
        'year',
        'submission_ids',
    ];
    const lines = [headers.join(',')];
    for (const team of teams) {
        const sources = team.source_team_names.join('; ');
        const subIds = team.submission_ids.join('|');
        const members =
            team.members.length > 0
                ? team.members
                : [{ slot: 0, name: '', enrollment_number: '', email: '', branch: '', year: '' }];
        for (const m of members) {
            lines.push(
                [
                    csvEscape(team.seminar_hall ?? ''),
                    csvEscape(team.team_name),
                    csvEscape(team.team_size),
                    csvEscape(team.access_token),
                    csvEscape(team.team_key),
                    csvEscape(sources),
                    String(m.slot ?? ''),
                    csvEscape(m.name ?? ''),
                    csvEscape(m.enrollment_number ?? ''),
                    csvEscape(m.email ?? ''),
                    csvEscape(m.branch ?? ''),
                    csvEscape(m.year ?? ''),
                    csvEscape(subIds),
                ].join(',')
            );
        }
    }
    return lines.join('\n');
}

/** Paste-friendly roster for Brevo / participant import (one row per member, shared team token). */
export function buildFinalTeamsEmailPasteCsv(teams: FinalTeamRecord[]): string {
    const headers = ['merged_team_name', 'team_size', 'name', 'email', 'access_token'];
    const lines = [headers.join(',')];
    for (const team of teams) {
        const token = team.access_token.trim().toUpperCase();
        for (const m of team.members) {
            const email = (m.email || '').trim();
            if (!email) continue;
            lines.push(
                [
                    csvEscape(team.team_name),
                    csvEscape(team.team_size),
                    csvEscape(m.name ?? ''),
                    csvEscape(email),
                    csvEscape(token),
                ].join(',')
            );
        }
    }
    return lines.join('\n');
}

export function overlayUserRosterFromFinalTeams<T extends { email?: string | null; team_name?: string | null; team_size?: string | null; access_token?: string | null }>(
    users: T[],
    teams: FinalTeamRecord[]
): T[] {
    const { emailToTeam, tokenByEmail } = buildEmailByFinalTeamMaps(teams);
    return users.map((u) => {
        const email = (u.email || '').trim().toLowerCase();
        const team = emailToTeam.get(email);
        if (!team) return u;
        return {
            ...u,
            team_name: team.team_name,
            team_size: team.team_size,
            access_token: tokenByEmail.get(email) ?? u.access_token,
        };
    });
}
