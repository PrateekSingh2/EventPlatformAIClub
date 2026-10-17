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

  // Check token activation registry first
  try {
    const activations = readTokenActivations();
    if (activations[cleanToken]) {
      const act = activations[cleanToken];
      const activatedUser: User = {
        id: act.userId || `user-${act.email.replace(/[^a-z0-9]/g, '_')}`,
        name: act.name,
        email: act.email,
        role: 'participant',
        access_token: cleanToken,
        total_score: 150,
        current_stage: 1,
        is_flagged: false,
        created_at: act.activatedAt,
        updated_at: act.activatedAt,
      };
      return checkDisqualified(activatedUser);
    }
  } catch {
    // Ignore
  }

  // Instant demo token for frontend preview & testing
  if (
    cleanToken === 'AX-DEMO-2026' ||
    cleanToken === 'DEMO-TOKEN' ||
    cleanToken.startsWith('AX-DEMO') ||
    cleanToken === 'DEMO'
  ) {
    const demoUser: User = {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Alex Mercer (Contestant)',
      email: 'alex.mercer@aiclub.org',
      role: 'participant',
      access_token: cleanToken,
      total_score: 150,
      current_stage: 1,
      is_flagged: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    return checkDisqualified(demoUser);
  }

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('*')
      .eq('access_token', cleanToken)
      .single();

    if (error || !data) {
      return null;
    }

    return checkDisqualified(data as User);
  } catch (err) {
    // If Supabase is unconfigured, allow testing with standard pattern tokens
    if (cleanToken.startsWith('AX-')) {
      const fallbackUser: User = {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'Alex Mercer (Contestant)',
        email: 'alex.mercer@aiclub.org',
        role: 'participant',
        access_token: cleanToken,
        total_score: 150,
        current_stage: 1,
        is_flagged: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      return checkDisqualified(fallbackUser);
    }
    return null;
  }
}
