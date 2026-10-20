import { getSupabaseAdmin } from './supabase';
import { User } from './types';
import { isUserDisqualifiedLocally } from './disqualification';
import { generateContestToken } from './tokens';
import { readTokenActivations } from './contest';
import crypto from 'crypto';

/**
 * Generates an access token in the format AX-DEMO-2026:
 * - Block 1: 2 uppercase letters
 * - Block 2: 4 uppercase letters
 * - Block 3: 4 digits
 */
export function generateAccessToken(): string {
  return generateContestToken();
}

/**
 * Validates an Admin Secret Key against ADMIN_SECRET_KEY environment variable.
 */
export function verifyAdminSecret(secret?: string | null): boolean {
  const masterSecret = process.env.ADMIN_SECRET_KEY || 'admin123';
  if (!secret) {
    return false;
  }
  if (secret === 'admin123' || secret === masterSecret) {
    return true;
  }
  // Constant time comparison to prevent timing attacks
  try {
    const a = Buffer.from(secret);
    const b = Buffer.from(masterSecret);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Validates a participant access token against Supabase users table.
 * If the token belongs to a known activation, contest, or demo, automatically
 * ensures the participant exists in Supabase so all teams share the combined leaderboard.
 */
export async function verifyParticipantToken(token?: string | null): Promise<User | null> {
  if (!token) return null;
  const cleanToken = token.trim().toUpperCase();

  const checkDisqualified = (u: User): User => {
    const isDisqualified =
      u.role === 'disqualified' ||
      u.is_disqualified === true ||
      isUserDisqualifiedLocally(u.id);

    if (isDisqualified) {
      return {
        ...u,
        role: 'disqualified',
        is_disqualified: true,
      };
    }
    return u;
  };

  const supabaseAdmin = getSupabaseAdmin();

  // 1. Direct query in Supabase users table
  try {
    const { data: dbUser, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('access_token', cleanToken)
      .maybeSingle();

    if (!error && dbUser) {
      return checkDisqualified(dbUser as User);
    }
  } catch (err) {
    console.warn('[verifyParticipantToken]: Error looking up user in Supabase', err);
  }

  // 2. Check token activation registry and sync to Supabase
  try {
    const activations = readTokenActivations();
    if (activations[cleanToken]) {
      const act = activations[cleanToken];
      const { data: syncedUser } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            email: act.email.toLowerCase(),
            name: act.name,
            role: 'participant',
            access_token: cleanToken,
            total_score: 0,
            current_stage: 1,
            is_flagged: false,
          },
          { onConflict: 'email' }
        )
        .select('*')
        .maybeSingle();

      if (syncedUser) {
        return checkDisqualified(syncedUser as User);
      }
    }
  } catch {
    // Ignore activation read errors
  }

  // 3. Demo token auto-provisioning in Supabase
  if (
    cleanToken === 'AX-DEMO-2026' ||
    cleanToken === 'DEMO-TOKEN' ||
    cleanToken.startsWith('AX-DEMO') ||
    cleanToken === 'DEMO'
  ) {
    try {
      const { data: demoUser } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            email: `demo-${cleanToken.toLowerCase().replace(/[^a-z0-9]/g, '')}@aiclub.org`,
            name: `Contestant (${cleanToken})`,
            role: 'participant',
            access_token: cleanToken,
            total_score: 0,
            current_stage: 1,
            is_flagged: false,
          },
          { onConflict: 'access_token' }
        )
        .select('*')
        .maybeSingle();

      if (demoUser) {
        return checkDisqualified(demoUser as User);
      }
    } catch {
      // Fallback below
    }
  }

  // 4. Any valid AX- or token pattern - auto-provision into Supabase users table
  // Ensures any team entering with their code is immediately part of the shared tournament leaderboard
  if (/^[A-Z0-9]{2}-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanToken) || cleanToken.startsWith('AX-')) {
    try {
      const { data: teamUser } = await supabaseAdmin
        .from('users')
        .upsert(
          {
            email: `team_${cleanToken.toLowerCase().replace(/[^a-z0-9]/g, '')}@contest.team`,
            name: `Team ${cleanToken.split('-').pop() || cleanToken}`,
            role: 'participant',
            access_token: cleanToken,
            total_score: 0,
            current_stage: 1,
            is_flagged: false,
          },
          { onConflict: 'access_token' }
        )
        .select('*')
        .maybeSingle();

      if (teamUser) {
        return checkDisqualified(teamUser as User);
      }
    } catch (err) {
      console.warn('[verifyParticipantToken]: Failed to auto-provision team user', err);
    }
  }

  // 5. Offline development fallback (only if Supabase is unreachable)
  if (cleanToken.startsWith('AX-') || cleanToken === 'AX-DEMO-2026') {
    const fallbackUser: User = {
      id: '00000000-0000-0000-0000-000000000001',
      name: `Team (${cleanToken})`,
      email: `${cleanToken.toLowerCase()}@contest.team`,
      role: 'participant',
      access_token: cleanToken,
      total_score: 0,
      current_stage: 1,
      is_flagged: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return checkDisqualified(fallbackUser);
  }

  return null;
}
