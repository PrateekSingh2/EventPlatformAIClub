import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, verifyParticipantToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { token, adminSecret } = body;

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
      const { userEmail, userName } = body;
      const cleanToken = token.trim().toUpperCase();

      if (userEmail) {
        const { validateAndActivateToken } = await import('@/lib/contest');
        const validation = await validateAndActivateToken({
          token: cleanToken,
          email: userEmail,
          name: userName,
        });

        if (!validation.success) {
          return NextResponse.json(
            {
              authenticated: false,
              error: validation.error || 'This token has already been activated by another account. One token is valid for one ID only.',
            },
            { status: 403 }
          );
        }
      }

      const user = await verifyParticipantToken(cleanToken);
      if (user) {
        if (user.role === 'disqualified' || user.is_disqualified) {
          return NextResponse.json(
            {
              authenticated: false,
              role: 'disqualified',
              error: 'Account Suspended for Fair-Play Violations',
              user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: 'disqualified',
                is_disqualified: true,
              },
            },
            { status: 403 }
          );
        }

        return NextResponse.json({
          authenticated: true,
          role: user.role,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            total_score: user.total_score,
            current_stage: user.current_stage,
            is_flagged: user.is_flagged,
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
