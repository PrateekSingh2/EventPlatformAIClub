import { generateContestToken } from './tokens';

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
 * 1. Intelligent Header Mapping: Automatically detects columns by header name (email, name, token/access_token, team_name, team_size).
 * 2. Exact Token Preservation: If a token is specified in the CSV, that exact token is assigned to that participant/team.
 * 3. Shared Team Tokens: All members belonging to the same team receive the same token.
 * 4. Fallback Support: Supports positional formats (e.g., [team, size, name1, email1, name2, email2...] or [name, email, token?]).
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
  const firstLineParts = firstLine
    .split(/[,;\t]/)
    .map((p) => p.trim().replace(/^["']|["']$/g, '').toLowerCase());

  const hasEmailHeader = firstLineParts.some((p) => p.includes('email') || p.includes('mail'));
  const isHeaderRow = hasEmailHeader && !firstLine.includes('@');

  let emailCol = -1;
  let nameCol = -1;
  let tokenCol = -1;
  let teamNameCol = -1;
  let teamSizeCol = -1;

  if (isHeaderRow) {
    firstLineParts.forEach((header, idx) => {
      if (header.includes('email') || header === 'mail') emailCol = idx;
      else if (header.includes('token') || header.includes('key') || header.includes('access_token')) tokenCol = idx;
      else if (header.includes('team_name') || header.includes('teamname') || header === 'team') teamNameCol = idx;
      else if (header.includes('team_size') || header.includes('teamsize') || header === 'size') teamSizeCol = idx;
      else if (header.includes('name') || header.includes('member') || header.includes('participant') || header.includes('student')) nameCol = idx;
    });
  }

  const startLineIdx = isHeaderRow ? 1 : 0;

  for (let idx = startLineIdx; idx < lines.length; idx++) {
    const line = lines[idx];
    if (line.startsWith('#')) continue;

    // Split CSV line respecting quotes
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) {
      errors.push(`Line ${idx + 1}: Line has insufficient columns.`);
      continue;
    }

    // Branch A: Header-based parsing
    if (isHeaderRow && emailCol >= 0) {
      const email = (parts[emailCol] || '').toLowerCase().trim();
      if (!email || !email.includes('@')) {
        errors.push(`Line ${idx + 1}: Missing or invalid email address "${email}".`);
        continue;
      }

      if (seenEmails.has(email)) continue;
      seenEmails.add(email);

      const name = nameCol >= 0 && parts[nameCol] ? parts[nameCol].trim() : email.split('@')[0];
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

    // Branch B: Positional parsing
    let teamName = '';
    let teamSize = '';
    const memberPairs: Array<{ name: string; email: string; token?: string }> = [];

    const sizeHint = (parts[1] || '').toLowerCase();
    const isTeamFormat =
      parts.length >= 4 &&
      ['solo', 'duo', 'trio', 'squad', '1', '2', '3', '4'].includes(sizeHint);

    if (isTeamFormat) {
      teamName = parts[0] || 'Unnamed Team';
      teamSize = parts[1] || 'Solo';

      for (let i = 2; i < parts.length; i += 2) {
        let mName = parts[i] || '';
        let mEmail = parts[i + 1] || '';

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
      let mEmail = (parts[1] || '').toLowerCase();
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
