import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { User } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, uid } = body;

    if (!email) {
      return NextResponse.json(
        { authenticated: false, error: 'Google email address is required.' },
        { status: 400 }
      );
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanName = (name || cleanEmail.split('@')[0]).trim();

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // 1. Check if user already exists with this Google email
      const { data: existingUser } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingUser) {
        // Return existing user profile and any previously assigned token
        const hasToken = Boolean(
          existingUser.access_token &&
          !existingUser.access_token.startsWith('PENDING')
        );

        return NextResponse.json({
          authenticated: true,
          user: existingUser as User,
          hasAssignedToken: hasToken,
          token: hasToken ? existingUser.access_token : null,
          isNewUser: false,
        });
      }

      // 2. Insert newly registered contestant into participants list in Supabase
      // Place a pending placeholder token until they enter their team room code
      const pendingToken = `PENDING-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          email: cleanEmail,
          name: cleanName,
          role: 'participant',
          access_token: pendingToken,
          total_score: 0,
          current_stage: 1,
          is_flagged: false,
        })
        .select()
        .single();

      if (!insertError && newUser) {
        return NextResponse.json({
          authenticated: true,
          user: newUser as User,
          hasAssignedToken: false,
          token: null,
          isNewUser: true,
        });
      }
    } catch (dbErr) {
      console.warn('[Google Auth DB Warning]: Supabase unconfigured or offline.', dbErr);
    }

    // 3. Safe fallback for local development or unconfigured databases
    const fallbackUser: User = {
      id: uid || '00000000-0000-0000-0000-000000000001',
      name: cleanName,
      email: cleanEmail,
      role: 'participant',
      access_token: '',
      total_score: 0,
      current_stage: 1,
      is_flagged: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({
      authenticated: true,
      user: fallbackUser,
      hasAssignedToken: false,
      token: null,
      isNewUser: false,
    });
  } catch (err: any) {
    console.error('[API /api/auth/google error]:', err);
    return NextResponse.json(
      { authenticated: false, error: err.message || 'Google authentication failed.' },
      { status: 500 }
    );
  }
}
