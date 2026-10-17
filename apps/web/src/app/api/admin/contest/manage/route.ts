import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import {
  listAllContests,
  createNewContest,
  updateExistingContest,
  deleteContest,
} from '@/lib/contest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminSecret =
      req.headers.get('x-admin-secret') ||
      req.nextUrl.searchParams.get('adminSecret');

    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret' },
        { status: 401 }
      );
    }

    const contests = await listAllContests();
    return NextResponse.json({ success: true, contests });
  } catch (error: any) {
    console.error('[API GET /admin/contest/manage error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to list contests' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, adminSecret, contestId, title, teamsCount, stages, status } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret' },
        { status: 401 }
      );
    }

    if (action === 'create') {
      if (!title || !title.trim()) {
        return NextResponse.json(
          { success: false, error: 'Contest title is required.' },
          { status: 400 }
        );
      }

      const count = Number(teamsCount) || 1;
      const { contest, tokens } = await createNewContest({
        title: title.trim(),
        teamsCount: count,
        stages: Array.isArray(stages) ? stages : [],
      });

      return NextResponse.json({
        success: true,
        action: 'create',
        contest,
        tokens,
      });
    }

    if (action === 'update') {
      if (!contestId) {
        return NextResponse.json(
          { success: false, error: 'contestId is required for update.' },
          { status: 400 }
        );
      }

      const updated = await updateExistingContest(contestId, {
        title,
        stages: Array.isArray(stages) ? stages : undefined,
        status,
        teamsCount: Number(teamsCount) || undefined,
      });

      return NextResponse.json({
        success: true,
        action: 'update',
        contest: updated,
      });
    }

    if (action === 'delete') {
      if (!contestId) {
        return NextResponse.json(
          { success: false, error: 'contestId is required for delete.' },
          { status: 400 }
        );
      }

      await deleteContest(contestId);
      return NextResponse.json({
        success: true,
        action: 'delete',
        contestId,
      });
    }

    return NextResponse.json(
      { success: false, error: `Invalid action '${action}'. Must be 'create', 'update', or 'delete'.` },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[API POST /admin/contest/manage error]:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Contest operation failed.' },
      { status: 500 }
    );
  }
}
