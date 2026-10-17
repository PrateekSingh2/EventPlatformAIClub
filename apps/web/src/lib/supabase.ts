import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder') &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.includes('placeholder')
);

/**
 * Browser-Safe Anonymous Client
 * Used for Realtime subscriptions (Leaderboard, Telemetry) and public reads.
 */
export const supabase = createClient<any>(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * Server-Only Service Role Client
 * Used exclusively inside Next.js Serverless API routes for privileged mutations,
 * fetching quiz answers, recording telemetry, and executing atomic RPCs.
 * NEVER expose this instance to browser bundles.
 */
let adminInstance: any = null;

export function getSupabaseAdmin(): any {
  if (!adminInstance) {
    if (!supabaseServiceRoleKey && process.env.NODE_ENV === 'production') {
      console.warn(
        '[Supabase Admin Warning] SUPABASE_SERVICE_ROLE_KEY is not defined. Server mutations will fail.'
      );
    }
    adminInstance = createClient<any>(
      supabaseUrl,
      supabaseServiceRoleKey || supabaseAnonKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );
  }
  return adminInstance;
}
