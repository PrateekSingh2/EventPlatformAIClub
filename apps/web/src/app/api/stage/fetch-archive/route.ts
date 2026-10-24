import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createTokenArchiveDownloadUrl } from '@/lib/storage';
import { getContestSettings } from '@/lib/contest';

/**
 * POST /api/stage/fetch-archive
 *
 * Returns a short-lived signed URL for the participant / team unique outer ZIP archive.
 * The outer ZIP contains stage1/ folder (unlocked) + stageN.zip files (password-protected).
 * The browser downloads this archive ONCE and caches it in IndexedDB.
 * All subsequent stage unlocking is done purely client-side.
 *
 * Request body:
 * { accessToken: string }
 *
 * Response:
 * {
 *   downloadUrl: string,       // Signed URL valid for 120s
 *   stageCount: number,        // Total stages in this archive
 *   expiresIn: number,
 *   cached: boolean,           // Hint: client already has it cached
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    // 1. Authenticate participant
    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized: Invalid access token' }, { status: 401 });
    }

    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json(
        { error: 'Account suspended for fair-play violations. Access denied.' },
        { status: 403 }
      );
    }

    // 2. Enforce contest lifecycle
    const contest = await getContestSettings();
    if (contest.status === 'DRAFT') {
      return NextResponse.json(
        { error: 'Contest is currently in DRAFT mode. Archive access is locked until the contest starts.' },
        { status: 403 }
      );
    }
    if (contest.status === 'FROZEN') {
      return NextResponse.json(
        { error: 'Contest is currently FROZEN. Archive access is temporarily paused.' },
        { status: 403 }
      );
    }
    if (contest.status === 'CONCLUDED') {
      return NextResponse.json(
        { error: 'Contest has concluded. No further archive access is permitted.' },
        { status: 403 }
      );
    }

    // 3. Look up the team's unique archive record
    if (!isSupabaseConfigured) {
      // Dev fallback: return demo
      return NextResponse.json({
        downloadUrl: '/case-study-archive.zip',
        stageCount: 1,
        expiresIn: 120,
        isTokenArchive: true,
      });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const cleanToken = accessToken.trim().toUpperCase();

    // First try: direct access_token lookup
    let { data: archiveRecord } = await supabaseAdmin
      .from('token_archives')
      .select('id, storage_path, stage_count')
      .eq('access_token', cleanToken)
      .maybeSingle();

    // Second try: team_name lookup (ensures all team members get the exact same team archive)
    if (!archiveRecord && user.team_name) {
      try {
        const { data: teamArchive } = await supabaseAdmin
          .from('token_archives')
          .select('id, storage_path, stage_count')
          .eq('team_name', user.team_name)
          .order('uploaded_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (teamArchive) {
          archiveRecord = teamArchive;
        }
      } catch (err: any) {
        console.warn('[team_name archive lookup fallback]:', err.message);
      }
    }

    if (!archiveRecord) {
      // Fall back to case study archive
      return NextResponse.json({
        downloadUrl: '/case-study-archive.zip',
        stageCount: 12,
        expiresIn: 120,
        isTokenArchive: true,
      });
    }

    // 4. Log archive access in stage_telemetry for stage 1 (first access)
    try {
      await supabaseAdmin
        .from('stage_telemetry')
        .upsert(
          {
            user_id: user.id,
            stage_number: 1,
            started_at: new Date().toISOString(),
          },
          {
            onConflict: 'user_id,stage_number',
            ignoreDuplicates: true,
          }
        );
    } catch {
      // Telemetry non-fatal
    }

    // 5. Generate signed download URL
    const { downloadUrl, expiresIn } = await createTokenArchiveDownloadUrl(
      archiveRecord.storage_path
    );

    return NextResponse.json({
      downloadUrl,
      stageCount: archiveRecord.stage_count || 12,
      expiresIn,
      isTokenArchive: true,
    });
  } catch (error: any) {
    console.error('[API /api/stage/fetch-archive error]:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
