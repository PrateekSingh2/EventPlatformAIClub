import { NextRequest, NextResponse } from 'next/server';
import { getContestSettings, updateContestSettings, isTransitionAllowed } from '@/lib/contest';
import { verifyAdminSecret } from '@/lib/auth';
import { ContestStatus } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const contest = await getContestSettings();
    return NextResponse.json(
      { success: true, contest },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=30',
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch contest state' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { status, adminSecret, title, startTime, endTime, freezeTime, force } = body;

    // Verify administrator authentication
    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    const validStatuses: ContestStatus[] = ['DRAFT', 'LIVE', 'FROZEN', 'CONCLUDED'];
    if (!status || !validStatuses.includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Invalid status '${status}'. Must be one of: ${validStatuses.join(', ')}`,
        },
        { status: 400 }
      );
    }

    const current = await getContestSettings();
    if (!force && !isTransitionAllowed(current.status, status)) {
      return NextResponse.json(
        {
          success: false,
          error: `Transition not allowed: cannot move from ${current.status} to ${status}.`,
        },
        { status: 400 }
      );
    }

    const updated = await updateContestSettings(status as ContestStatus, {
      adminIdentifier: 'admin',
      title,
      startTime,
      endTime,
      freezeTime,
      force: Boolean(force),
    });

    return NextResponse.json({ success: true, contest: updated });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update contest status' },
      { status: 500 }
    );
  }
}
