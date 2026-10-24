import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, verifyParticipantToken } from '@/lib/auth';
import { validateAndActivateToken } from '@/lib/contest';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, adminSecret, userEmail, userName, userId } = body;

    // 1. Check if verifying admin credentials
    if (adminSecret) {
      const isValidAdmin = verifyAdminSecret(adminSecret);
      if (isValidAdmin) {
        return NextResponse.json({
          authenticated: true,
          role: 'admin',
          user: {
            name: 'Contest Administrator',
            email: 'admin@eventplatform.internal',
            role: 'admin',
          },
        });
      }
      return NextResponse.json(
        { authenticated: false, error: 'Invalid admin secret key' },
        { status: 401 }
      );
    }

    // 2. Check if verifying participant token
    if (token) {
      const cleanToken = token.trim().toUpperCase();

      // STRICT CHECK: User MUST be logged in first!
      if (!userEmail) {
        return NextResponse.json(
          {
            authenticated: false,
            error: 'Authentication required: You must log in to your account first before accessing the arena room.',
          },
          { status: 401 }
        );
      }

      const cleanEmail = userEmail.trim().toLowerCase();

      // Cross-check token with the user's logged-in account
      const validation = await validateAndActivateToken({
        token: cleanToken,
        email: cleanEmail,
        name: userName,
        userId: userId,
      });

      if (!validation.success) {
        return NextResponse.json(
          {
            authenticated: false,
            error: validation.error || 'Access Denied: This token is not valid for your account.',
          },
          { status: 403 }
        );
      }

      // Retrieve participant user record matching this token and email
      const user = await verifyParticipantToken(cleanToken, cleanEmail);
      if (user) {
        if (user.role === 'disqualified' || user.is_disqualified) {
          return NextResponse.json(
            {
              authenticated: false,
              role: 'disqualified',
              error: 'Account / Team Suspended for Fair-Play Violations',
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                team_name: user.team_name,
                role: 'disqualified',
                is_disqualified: true,
              },
            },
            { status: 403 }
          );
        }

        const contestStartedAt =
          (user as any).contest_started_at ||
          user.created_at ||
          new Date().toISOString();

        // If user didn't have contest_started_at recorded yet, save it to Supabase
        if (!(user as any).contest_started_at && user.id) {
          try {
            const supabaseAdmin = getSupabaseAdmin();
            await supabaseAdmin
              .from('users')
              .update({ contest_started_at: contestStartedAt })
              .eq('id', user.id);
          } catch (e) {
            console.warn('[auth/verify]: Could not persist contest_started_at', e);
          }
        }

        return NextResponse.json({
          authenticated: true,
          role: user.role,
          user: {
            id: user.id,
            name: user.name,
            email: cleanEmail,
            team_name: user.team_name,
            team_size: user.team_size,
            role: user.role,
            access_token: cleanToken,
            total_score: user.total_score,
            current_stage: user.current_stage,
            is_flagged: user.is_flagged,
            is_completed: Boolean((user as any).is_completed),
            completed_at: (user as any).completed_at || null,
            contest_started_at: contestStartedAt,
            stage_timestamps: (user as any).stage_timestamps || {},
            stage_durations: (user as any).stage_durations || {},
            total_time_seconds: (user as any).total_time_seconds || 0,
            last_stage_completed_at: (user as any).last_stage_completed_at || null,
          },
        });
      }

      return NextResponse.json(
        { authenticated: false, error: 'Invalid or expired participant access token' },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { authenticated: false, error: 'Missing token or adminSecret' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[API /auth/verify error]:', error);
    return NextResponse.json(
      { authenticated: false, error: error.message || 'Authentication failed' },
      { status: 500 }
    );
  }
}
