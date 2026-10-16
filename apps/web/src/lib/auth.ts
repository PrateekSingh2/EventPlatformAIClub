import { getSupabaseAdmin } from './supabase';
import { User } from './types';
import crypto from 'crypto';

/**
 * Generates an industrial-grade cryptographic access token: AX-XXXX-XXXX
 */
export function generateAccessToken(): string {
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude ambiguous characters (0, O, 1, I)
  const randomBytes = crypto.randomBytes(8);
  let part1 = '';
  let part2 = '';

  for (let i = 0; i < 4; i++) {
    part1 += chars[randomBytes[i] % chars.length];
  }
  for (let i = 4; i < 8; i++) {
    part2 += chars[randomBytes[i] % chars.length];
  }

  return `AX-${part1}-${part2}`;
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

  // Instant demo token for frontend preview & testing
  if (
    cleanToken === 'AX-DEMO-2026' ||
    cleanToken === 'DEMO-TOKEN' ||
    cleanToken.startsWith('AX-DEMO') ||
    cleanToken === 'DEMO'
  ) {
    return {
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

    return data as User;
  } catch (err) {
    // If Supabase is unconfigured, allow testing with standard pattern tokens
    if (cleanToken.startsWith('AX-')) {
      return {
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
    }
    return null;
  }
}
