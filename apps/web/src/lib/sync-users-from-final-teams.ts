import type { SupabaseClient } from '@supabase/supabase-js';
import { generateAccessToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import type { FinalTeamRecord } from '@/lib/final-teams';
import { finalTeamsToParticipantPayload } from '@/lib/round2';

export type SyncUsersFromFinalTeamsResult =
  | { ok: true; count: number }
  | { ok: false; error: string; count: number };

export async function upsertParticipantRows(
  supabase: SupabaseClient,
  participants: Array<{
    email: string;
    name: string;
    team_name: string | null;
    team_size: string | null;
    access_token: string;
  }>
): Promise<SyncUsersFromFinalTeamsResult> {
  const cleanParticipants: Array<{
    email: string;
    name: string;
    team_name: string | null;
    team_size: string | null;
    role: 'participant';
    access_token: string;
  }> = [];

  const seenEmails = new Set<string>();
  const teamTokens = new Map<string, string>();

  for (const p of participants) {
    const teamName = (p.team_name || '').trim();
    const customToken = (p.access_token || '').trim().toUpperCase();
    if (teamName && customToken && !teamTokens.has(teamName.toLowerCase())) {
      teamTokens.set(teamName.toLowerCase(), customToken);
    }
  }

  for (const p of participants) {
    const email = (p.email || '').trim().toLowerCase();
    const name = (p.name || '').trim();
    const team_name = (p.team_name || '').trim() || null;
    const team_size = (p.team_size || '').trim() || null;
    const customToken = (p.access_token || '').trim().toUpperCase();

    if (!email || !email.includes('@')) continue;
    if (seenEmails.has(email)) continue;
    seenEmails.add(email);

    let tokenForUser = customToken;
    if (team_name) {
      const teamKey = team_name.toLowerCase();
      if (!teamTokens.has(teamKey)) {
        teamTokens.set(teamKey, customToken || generateAccessToken());
      }
      tokenForUser = teamTokens.get(teamKey)!;
    } else if (!tokenForUser) {
      tokenForUser = generateAccessToken();
    }

    cleanParticipants.push({
      email,
      name: name || email.split('@')[0],
      team_name,
      team_size,
      role: 'participant',
      access_token: tokenForUser,
    });
  }

  if (cleanParticipants.length === 0) {
    return { ok: false, error: 'No valid participant rows', count: 0 };
  }

  let data: unknown[] | null = null;
  let error: { message?: string } | null = null;

  const res = await supabase
    .from('users')
    .upsert(cleanParticipants, { onConflict: 'email', ignoreDuplicates: false })
    .select('id, email, name, team_name, team_size, role, access_token');

  data = res.data;
  error = res.error;

  if (error && (error.message?.includes('team_name') || error.message?.includes('column'))) {
    const baseParticipants = cleanParticipants.map((p) => ({
      email: p.email,
      name: p.name,
      role: p.role,
      access_token: p.access_token,
    }));
    const resFallback = await supabase
      .from('users')
      .upsert(baseParticipants, { onConflict: 'email', ignoreDuplicates: false })
      .select('id, email, name, role, access_token');
    data = resFallback.data;
    error = resFallback.error;
  }

  if (error) {
    return { ok: false, error: error.message || 'Upsert failed', count: 0 };
  }

  return { ok: true, count: data?.length || cleanParticipants.length };
}

export async function syncUsersFromFinalTeams(
  teams: FinalTeamRecord[],
  supabase: SupabaseClient = getSupabaseAdmin()
): Promise<SyncUsersFromFinalTeamsResult> {
  const rows = finalTeamsToParticipantPayload(teams);
  return upsertParticipantRows(supabase, rows);
}
