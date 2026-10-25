import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { syncStagePasswordsFromPoolKeys } from '@/lib/sync-stage-passwords';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/stages/sync-passwords
 * Rebuilds stage_passwords for all token_archives from pool ZIP paths + PASSWORD_KEY.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const secret =
      req.headers.get('x-admin-secret') ||
      (body as { adminSecret?: string }).adminSecret ||
      req.nextUrl.searchParams.get('adminSecret');

    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
    }

    const archiveIds = Array.isArray((body as { archiveIds?: string[] }).archiveIds)
      ? (body as { archiveIds: string[] }).archiveIds
      : undefined;

    const result = await syncStagePasswordsFromPoolKeys(getSupabaseAdmin(), { archiveIds });

    return NextResponse.json({
      success: result.errors.length === 0 || result.updated > 0,
      ...result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Sync failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
