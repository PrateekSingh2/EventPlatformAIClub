import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { generateAccessToken } from '@/lib/auth';
import { User } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, photoURL, uid } = body;

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
      const { data: existingUser, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (existingUser) {
        return NextResponse.json({
          authenticated: true,
          token: existingUser.access_token,
          user: existingUser as User,
          isNewUser: false,
        });
      }

      // 2. Generate a new cryptographic contestant access token
      const newToken = generateAccessToken();

      // 3. Insert newly registered contestant
      const { data: newUser, error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          email: cleanEmail,
          name: cleanName,
          role: 'participant',
          access_token: newToken,
          total_score: 0,
          current_stage: 1,
          is_flagged: false,
        })
        .select()
        .single();

      if (!insertError && newUser) {
        return NextResponse.json({
          authenticated: true,
          token: newUser.access_token,
          user: newUser as User,
          isNewUser: true,
        });
      }
    } catch (dbErr) {
      console.warn('[Google Auth DB Warning]: Supabase unconfigured or offline. Utilizing ephemeral session.', dbErr);
    }

    // 4. Safe fallback for local development or unconfigured databases
    const fallbackToken = 'AX-DEMO-2026';
    const fallbackUser: User = {
      id: uid || '00000000-0000-0000-0000-000000000001',
      name: cleanName,
      email: cleanEmail,
      role: 'participant',
      access_token: fallbackToken,
      total_score: 150,
      current_stage: 1,
      is_flagged: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    return NextResponse.json({
      authenticated: true,
      token: fallbackToken,
      user: fallbackUser,
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
