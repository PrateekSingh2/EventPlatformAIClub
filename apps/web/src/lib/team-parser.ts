import { generateContestToken } from './tokens';

function teamSizeLabelFromMemberCount(count: number): string {
    if (count <= 1) return 'Solo';
    if (count === 2) return 'Duo';
    if (count === 3) return 'Trio';
    return 'Squad';
}

/** Split one CSV line respecting double-quoted fields (merger export uses quoted cells). */
export function parseCsvLine(line: string): string[] {
    const parts: string[] = [];
    let cur = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"') {
                if (line[i + 1] === '"') {
                    cur += '"';
                    i++;
                } else {
                    inQuotes = false;
                }
            } else {
                cur += ch;
            }
            continue;
        }
        if (ch === '"') {
            inQuotes = true;
            continue;
        }
        if (ch === ',' || ch === ';' || ch === '\t') {
            parts.push(cur.trim());
            cur = '';
            continue;
        }
        cur += ch;
    }
    parts.push(cur.trim());
    return parts.map((p) => p.replace(/^["']|["']$/g, ''));
}

export function isMergerExportHeader(headers: string[]): boolean {
    const lower = headers.map((h) => h.toLowerCase());
    return lower.includes('merged_team_name') && lower.includes('email');
}

export interface ParsedTeamMember {
    teamName: string;
    teamSize: string;
    name: string;
    email: string;
    token: string;
}

export interface ParsedTeamGroup {
    teamName: string;
    teamSize: string;
    token: string;
    members: Array<{ name: string; email: string }>;
}

export interface ParseResult {
    members: ParsedTeamMember[];
    teams: ParsedTeamGroup[];
    errors: string[];
}

/**
 * Parses raw CSV or TSV participant roster in team or tabular format.
 *
 * Capabilities:
 * 1. Team-wide horizontal rows: [team_name, team_size, name1, email1, name2, email2, name3, email3...]
 * 2. Intelligent Header Mapping: Automatically detects headers (email, name, token/access_token, team_name, team_size)
 *    even when multiple member columns exist in a single row.
 * 3. Exact Token Preservation: If a token is specified in the CSV, that exact token is assigned to that participant/team.
 * 4. Shared Team Tokens: All members belonging to the same team receive the exact same token.
 * 5. Fallback Support: Supports positional formats [name, email, token?] or [email, name, token?].
 */
export function parseTeamCsv(
    rawText: string,
    existingTokens?: Map<string, string>
): ParseResult {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const members: ParsedTeamMember[] = [];
    const teamsMap = new Map<string, ParsedTeamGroup>();
    const errors: string[] = [];
    const tokenMap = new Map<string, string>(existingTokens || []);
    const seenEmails = new Set<string>();

    if (lines.length === 0) {
        return { members: [], teams: [], errors: ['Input text is empty.'] };
    }

    // Check if first line contains column headers
    const firstLine = lines[0];
    const firstLineParts = parseCsvLine(firstLine).map((p) => p.toLowerCase());

    const hasEmailHeader = firstLineParts.some((p) => p.includes('email') || p.includes('mail'));
    const isHeaderRow = hasEmailHeader && !firstLine.includes('@');
    const isMergerExport = isHeaderRow && isMergerExportHeader(firstLineParts);

    // Detect column indices in header
    const emailColIndices: number[] = [];
    let tokenCol = -1;
    let teamNameCol = -1;
    let teamSizeCol = -1;
    let singleNameCol = -1;

    if (isHeaderRow) {
        firstLineParts.forEach((header, idx) => {
            if (header.includes('email') || header === 'mail') {
                emailColIndices.push(idx);
            } else if (header.includes('token') || header.includes('key') || header.includes('access_token')) {
                tokenCol = idx;
            } else if (header === 'merged_team_name' || header === 'merge_group') {
                if (teamNameCol === -1 || header === 'merged_team_name') teamNameCol = idx;
            } else if (header.includes('team_name') || header.includes('teamname') || header === 'team') {
                if (teamNameCol === -1) teamNameCol = idx;
            } else if (header.includes('team_size') || header.includes('teamsize') || header === 'size') {
                teamSizeCol = idx;
            } else if (
                header === 'name' ||
                header.includes('member') ||
                header.includes('participant') ||
                header.includes('student')
            ) {
                if (singleNameCol === -1) singleNameCol = idx;
            }
        });
    }

    const startLineIdx = isHeaderRow ? 1 : 0;

    if (isMergerExport) {
        const teamSizeByName = new Map<string, string>();
        for (let idx = startLineIdx; idx < lines.length; idx++) {
            const parts = parseCsvLine(lines[idx]);
            const teamName =
                teamNameCol >= 0 && parts[teamNameCol] ? parts[teamNameCol].trim() : parts[0] || 'Unnamed Team';
            const email = (parts[emailColIndices[0] ?? -1] || '').toLowerCase().trim();
            if (!email || !email.includes('@')) continue;
            const sizeFromCol =
                teamSizeCol >= 0 && parts[teamSizeCol] ? parts[teamSizeCol].trim() : '';
            if (sizeFromCol) teamSizeByName.set(teamName.toLowerCase(), sizeFromCol);
        }

        for (let idx = startLineIdx; idx < lines.length; idx++) {
            const line = lines[idx];
            if (line.startsWith('#')) continue;
            const parts = parseCsvLine(line);
            const emailCol = emailColIndices[0];
            const email = (parts[emailCol] || '').toLowerCase().trim();
            if (!email || !email.includes('@')) {
                errors.push(`Line ${idx + 1}: Missing or invalid email.`);
                continue;
            }
            if (seenEmails.has(email)) continue;
            seenEmails.add(email);

            const teamName =
                teamNameCol >= 0 && parts[teamNameCol] ? parts[teamNameCol].trim() : 'Unnamed Team';
            const name =
                singleNameCol >= 0 && parts[singleNameCol] ? parts[singleNameCol].trim() : email.split('@')[0];
            const teamKey = teamName.toLowerCase().trim();
            let teamSize =
                teamSizeCol >= 0 && parts[teamSizeCol] ? parts[teamSizeCol].trim() : teamSizeByName.get(teamKey) || '';
            if (!teamSize) {
                teamSize = teamSizeLabelFromMemberCount(1);
            }
            const customToken = tokenCol >= 0 && parts[tokenCol] ? parts[tokenCol].trim().toUpperCase() : '';

            if (!tokenMap.has(teamKey)) {
                tokenMap.set(teamKey, customToken || generateContestToken());
            }
            const token = tokenMap.get(teamKey)!;

            if (!teamsMap.has(teamKey)) {
                teamsMap.set(teamKey, { teamName, teamSize, token, members: [] });
            }
            const teamEntry = teamsMap.get(teamKey)!;
            teamEntry.members.push({ name, email });
            if (teamSizeCol >= 0 && parts[teamSizeCol]) {
                teamEntry.teamSize = parts[teamSizeCol].trim();
            }

            members.push({ teamName, teamSize: teamEntry.teamSize, name, email, token });
        }

        for (const team of teamsMap.values()) {
            if (!team.teamSize || team.teamSize === teamSizeLabelFromMemberCount(1)) {
                team.teamSize = teamSizeLabelFromMemberCount(team.members.length);
            }
            for (const m of members.filter((x) => x.teamName === team.teamName)) {
                m.teamSize = team.teamSize;
            }
        }

        return { members, teams: Array.from(teamsMap.values()), errors };
    }

    const isMultiMemberHeader = isHeaderRow && emailColIndices.length > 1;

    for (let idx = startLineIdx; idx < lines.length; idx++) {
        const line = lines[idx];
        if (line.startsWith('#')) continue;

        // Split CSV line respecting quotes
        const parts = parseCsvLine(line);
        if (parts.length < 2) {
            errors.push(`Line ${idx + 1}: Line has insufficient columns.`);
            continue;
        }

        // Branch A: Multi-member horizontal row with headers
        // e.g. [team_name, team_size, name1, email1, name2, email2...]
        if (isMultiMemberHeader) {
            const teamName = teamNameCol >= 0 && parts[teamNameCol] ? parts[teamNameCol].trim() : parts[0] || 'Unnamed Team';
            const teamSize = teamSizeCol >= 0 && parts[teamSizeCol] ? parts[teamSizeCol].trim() : parts[1] || 'Solo';
            const customToken = tokenCol >= 0 && parts[tokenCol] ? parts[tokenCol].trim().toUpperCase() : '';

            const memberPairs: Array<{ name: string; email: string }> = [];

            for (const emailIdx of emailColIndices) {
                let mEmail = (parts[emailIdx] || '').toLowerCase().trim();
                if (!mEmail || !mEmail.includes('@')) continue;

                // Name column is typically the one immediately before email, or search nearby
                let mName = '';
                if (emailIdx > 0 && parts[emailIdx - 1] && !parts[emailIdx - 1].includes('@')) {
                    mName = parts[emailIdx - 1].trim();
                } else if (emailIdx + 1 < parts.length && parts[emailIdx + 1] && !parts[emailIdx + 1].includes('@')) {
                    mName = parts[emailIdx + 1].trim();
                }
                if (!mName) mName = mEmail.split('@')[0];

                memberPairs.push({ name: mName, email: mEmail });
            }

            if (memberPairs.length === 0) {
                errors.push(`Line ${idx + 1}: No valid member emails found in team "${teamName}".`);
                continue;
            }

            const teamKey = teamName.toLowerCase().trim();
            if (!tokenMap.has(teamKey)) {
                tokenMap.set(teamKey, customToken || generateContestToken());
            }
            const sharedToken = tokenMap.get(teamKey)!;

            if (!teamsMap.has(teamKey)) {
                teamsMap.set(teamKey, {
                    teamName,
                    teamSize,
                    token: sharedToken,
                    members: [],
                });
            }
            const teamEntry = teamsMap.get(teamKey)!;

            for (const member of memberPairs) {
                if (seenEmails.has(member.email)) continue;
                seenEmails.add(member.email);

                teamEntry.members.push({ name: member.name, email: member.email });
                members.push({
                    teamName,
                    teamSize,
                    name: member.name,
                    email: member.email,
                    token: sharedToken,
                });
            }
            continue;
        }

        // Branch B: Single-member row with headers
        // e.g. [name, email, team_name, team_size, token]
        if (isHeaderRow && emailColIndices.length === 1) {
            const emailCol = emailColIndices[0];
            const email = (parts[emailCol] || '').toLowerCase().trim();
            if (!email || !email.includes('@')) {
                errors.push(`Line ${idx + 1}: Missing or invalid email address "${email}".`);
                continue;
            }

            if (seenEmails.has(email)) continue;
            seenEmails.add(email);

            const name = singleNameCol >= 0 && parts[singleNameCol] ? parts[singleNameCol].trim() : email.split('@')[0];
            const customToken = tokenCol >= 0 && parts[tokenCol] ? parts[tokenCol].trim().toUpperCase() : '';
            const teamName = teamNameCol >= 0 && parts[teamNameCol] ? parts[teamNameCol].trim() : name;
            const teamSize = teamSizeCol >= 0 && parts[teamSizeCol] ? parts[teamSizeCol].trim() : 'Solo';

            const teamKey = teamName.toLowerCase().trim();
            if (!tokenMap.has(teamKey)) {
                tokenMap.set(teamKey, customToken || generateContestToken());
            }
            const token = tokenMap.get(teamKey)!;

            if (!teamsMap.has(teamKey)) {
                teamsMap.set(teamKey, {
                    teamName,
                    teamSize,
                    token,
                    members: [],
                });
            }
            teamsMap.get(teamKey)!.members.push({ name, email });

            members.push({
                teamName,
                teamSize,
                name,
                email,
                token,
            });
            continue;
        }

        // Branch C: Positional parsing without headers
        let teamName = '';
        let teamSize = '';
        const memberPairs: Array<{ name: string; email: string; token?: string }> = [];

        const sizeHint = (parts[1] || '').toLowerCase().trim();
        const isTeamFormat =
            parts.length >= 4 &&
            (
                ['solo', 'duo', 'trio', 'squad', 'team', '1', '2', '3', '4'].some((s) => sizeHint.includes(s)) ||
                (parts[3] && parts[3].includes('@')) ||
                (parts[2] && parts[2].includes('@'))
            );

        if (isTeamFormat) {
            teamName = parts[0] || 'Unnamed Team';
            teamSize = parts[1] || 'Solo';

            for (let i = 2; i < parts.length; i += 2) {
                let mName = parts[i] || '';
                let mEmail = parts[i + 1] || '';

                // If email was placed before name, auto-detect and swap
                if (mName.includes('@') && !mEmail.includes('@')) {
                    const temp = mName;
                    mName = mEmail || temp.split('@')[0];
                    mEmail = temp;
                }

                mEmail = mEmail.toLowerCase().trim();
                mName = mName.trim() || (mEmail ? mEmail.split('@')[0] : 'Member');

                if (mEmail && mEmail.includes('@')) {
                    memberPairs.push({ name: mName, email: mEmail });
                }
            }
        } else {
            // Legacy 2 or 3-column format: [name, email, token?] or [email, name, token?]
            let mName = parts[0];
            let mEmail = (parts[1] || '').toLowerCase().trim();
            const customToken = (parts[2] || '').toUpperCase();

            if (mName.includes('@') && !mEmail.includes('@')) {
                const temp = mName;
                mName = mEmail || temp.split('@')[0];
                mEmail = temp;
            }

            if (mEmail && mEmail.includes('@')) {
                teamName = mName || mEmail.split('@')[0];
                teamSize = 'Solo';
                memberPairs.push({ name: mName, email: mEmail, token: customToken });
            }
        }

        if (memberPairs.length === 0) {
            errors.push(`Line ${idx + 1}: Could not find valid member emails.`);
            continue;
        }

        const teamKey = teamName.toLowerCase().trim();
        const firstCustomToken = memberPairs.find((m) => m.token)?.token;
        if (!tokenMap.has(teamKey)) {
            tokenMap.set(teamKey, firstCustomToken || generateContestToken());
        }
        const sharedToken = tokenMap.get(teamKey)!;

        if (!teamsMap.has(teamKey)) {
            teamsMap.set(teamKey, {
                teamName,
                teamSize,
                token: sharedToken,
                members: [],
            });
        }

        const teamEntry = teamsMap.get(teamKey)!;

        for (const member of memberPairs) {
            if (seenEmails.has(member.email)) {
                continue;
            }
            seenEmails.add(member.email);
            teamEntry.members.push({ name: member.name, email: member.email });

            members.push({
                teamName,
                teamSize,
                name: member.name,
                email: member.email,
                token: sharedToken,
            });
        }
    }

    return {
        members,
        teams: Array.from(teamsMap.values()),
        errors,
    };
}
