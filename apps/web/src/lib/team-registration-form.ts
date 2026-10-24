export type TeamMemberFormFields = {
  name: string;
  mobile: string;
  enrollment_number: string;
  email: string;
  branch: string;
  year: string;
};

export type TeamMemberPayload = TeamMemberFormFields & { slot: number };

export type TeamRegistrationPayload = {
  team_name: string;
  members: TeamMemberPayload[];
};

const MAX_TEAM_NAME = 120;
const MAX_TEXT = 200;
const MAX_EMAIL = 254;
const MOBILE_RE = /^[6-9]\d{9}$/;
const YEAR_RE = /^[1-4]$|^20\d{2}$|^[1-4](st|nd|rd|th)?\s*year$/i;

function cleanText(value: unknown, maxLen: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').slice(0, maxLen);
}

function cleanEmail(value: unknown): string {
  const email = cleanText(value, MAX_EMAIL).toLowerCase();
  if (!email || email.length > MAX_EMAIL) return '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function memberFromRaw(raw: unknown, slot: number): TeamMemberFormFields {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    name: cleanText(obj.name, MAX_TEXT),
    mobile: cleanText(obj.mobile, 15).replace(/\D/g, '').slice(0, 10),
    enrollment_number: cleanText(obj.enrollment_number ?? obj.enrollmentNumber, MAX_TEXT),
    email: cleanEmail(obj.email),
    branch: cleanText(obj.branch, MAX_TEXT),
    year: cleanText(obj.year, 32),
  };
}

function isMemberEmpty(m: TeamMemberFormFields): boolean {
  return !m.name && !m.mobile && !m.enrollment_number && !m.email && !m.branch && !m.year;
}

function validateMember(m: TeamMemberFormFields, slot: number, required: boolean): string | null {
  if (!required && isMemberEmpty(m)) return null;

  if (!m.name) return `Member ${slot}: name is required`;
  if (!MOBILE_RE.test(m.mobile)) return `Member ${slot}: enter a valid 10-digit mobile number`;
  if (!m.enrollment_number) return `Member ${slot}: enrollment number is required`;
  if (!m.email) return `Member ${slot}: valid email is required`;
  if (!m.branch) return `Member ${slot}: branch is required`;
  if (!m.year || !YEAR_RE.test(m.year)) return `Member ${slot}: year is required (e.g. 2 or 3rd year)`;

  return null;
}

export function parseTeamRegistrationBody(body: unknown):
  | { ok: true; data: TeamRegistrationPayload }
  | { ok: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Invalid request body' };
  }

  const record = body as Record<string, unknown>;
  const team_name = cleanText(record.team_name ?? record.teamName, MAX_TEAM_NAME);

  if (!team_name || team_name.length < 2) {
    return { ok: false, error: 'Team name is required' };
  }

  if (!/^[a-zA-Z0-9][a-zA-Z0-9\s._\-&()]+$/.test(team_name)) {
    return { ok: false, error: 'Team name contains invalid characters' };
  }

  const rawMembers = Array.isArray(record.members) ? record.members : [];
  const slots: TeamMemberFormFields[] = [1, 2, 3, 4].map((slot) =>
    memberFromRaw(rawMembers[slot - 1], slot)
  );

  for (let i = 0; i < 4; i++) {
    const slot = i + 1;
    const member = slots[i];
    const required = slot === 1;
    const empty = isMemberEmpty(member);

    if (required) {
      const err = validateMember(member, slot, true);
      if (err) return { ok: false, error: err };
      continue;
    }

    if (empty) continue;

    const err = validateMember(member, slot, true);
    if (err) return { ok: false, error: err };
  }

  const members: TeamMemberPayload[] = slots
    .map((m, i) => ({ slot: i + 1, ...m }))
    .filter((m) => m.slot === 1 || !isMemberEmpty(m));

  return { ok: true, data: { team_name, members } };
}
