import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createTokenArchiveUploadUrl, createTeamArchiveUploadUrl } from '@/lib/storage';

/**
 * POST /api/admin/stages/bulk-upload
 *
 * Step 1 — Get signed upload URLs for each ZIP file.
 * The admin browser will upload directly to Supabase Storage using these URLs.
 * After uploading, call this endpoint again with action='commit' to save DB records.
 *
 * Request body (action='presign'):
 * {
 *   action: 'presign',
 *   adminSecret: string,
 *   teams?: Array<{ teamKey: string; teamName: string; tokens: string[] }>,
 *   tokens?: string[],           // fallback for legacy per-token upload
 * }
 *
 * Request body (action='commit'):
 * {
 *   action: 'commit',
 *   adminSecret: string,
 *   archives: Array<{
 *     teamKey?: string;
 *     teamName?: string;
 *     tokens?: string[];
 *     accessToken?: string;
 *     storagePath: string;
 *     stageCount: number;
 *     passwords?: string[];     // passwords for stages 2..N
 *   }>
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ error: 'Supabase is not configured' }, { status: 503 });
    }

    // ── Action: presign ────────────────────────────────────────────────────────
    if (action === 'presign') {
      const { teams, tokens } = body as {
        teams?: Array<{ teamKey: string; teamName: string; tokens: string[] }>;
        tokens?: string[];
      };

      // Preferred: Team-based unique upload targets
      if (Array.isArray(teams) && teams.length > 0) {
        // Enforce uniqueness across teams
        const uniqueKeys = new Set(teams.map((t) => t.teamKey.toLowerCase()));
        if (uniqueKeys.size !== teams.length) {
          return NextResponse.json(
            { error: 'Duplicate teams detected in presign request.' },
            { status: 400 }
          );
        }

        const results: Array<{
          teamKey: string;
          teamName: string;
          tokens: string[];
          accessToken: string;
          uploadUrl: string;
          token: string;
          storagePath: string;
          expiresIn: number;
        }> = [];

        for (const team of teams) {
          const urlData = await createTeamArchiveUploadUrl(team.teamKey);
          results.push({
            teamKey: team.teamKey,
            teamName: team.teamName,
            tokens: team.tokens,
            accessToken: team.tokens[0] || team.teamKey,
            ...urlData,
          });
        }

        return NextResponse.json({ success: true, uploadTargets: results });
      }

      // Legacy fallback: per-token upload targets
      if (Array.isArray(tokens) && tokens.length > 0) {
        const results: Array<{
          accessToken: string;
          uploadUrl: string;
          token: string;
          storagePath: string;
          expiresIn: number;
        }> = [];

        for (const accessToken of tokens) {
          const urlData = await createTokenArchiveUploadUrl(accessToken);
          results.push({ accessToken, ...urlData });
        }

        return NextResponse.json({ success: true, uploadTargets: results });
      }

      return NextResponse.json({ error: 'teams or tokens array is required' }, { status: 400 });
    }

    // ── Action: commit ─────────────────────────────────────────────────────────
    if (action === 'commit') {
      const { archives } = body as {
        archives: Array<{
          accessToken?: string;
          teamKey?: string;
          teamName?: string;
          tokens?: string[];
          storagePath: string;
          stageCount: number;
          passwords?: string[];
        }>;
      };

      if (!Array.isArray(archives) || archives.length === 0) {
        return NextResponse.json({ error: 'archives array is required' }, { status: 400 });
      }

      // STRICT VALIDATION: No two different teams can have the same ZIP archive storagePath
      const storagePathsSeen = new Set<string>();
      for (const arch of archives) {
        const path = arch.storagePath.trim();
        if (storagePathsSeen.has(path)) {
          return NextResponse.json(
            {
              error: `Uniqueness violation: Archive "${path}" is mapped to multiple teams. Every team must receive a unique challenge archive.`,
            },
            { status: 400 }
          );
        }
        storagePathsSeen.add(path);
      }

      const supabaseAdmin = getSupabaseAdmin();
      const committed: string[] = [];
      const errors: Array<{ target: string; error: string }> = [];

      for (const arch of archives) {
        const { accessToken, teamName, tokens, storagePath, stageCount, passwords } = arch;
        const targetTokens = (tokens && tokens.length > 0)
          ? tokens
          : accessToken
          ? [accessToken]
          : [];

        if (targetTokens.length === 0) {
          errors.push({ target: teamName || 'Unknown Team', error: 'No tokens found for team archive' });
          continue;
        }

        try {
          let primaryArchiveId: string | null = null;

          // Upsert archive record for EVERY token belonging to this team
          // This guarantees all members of the team download and verify against the same ZIP!
          for (const token of targetTokens) {
            const cleanToken = token.trim().toUpperCase();
            const { data: archiveRow, error: archiveErr } = await supabaseAdmin
              .from('token_archives')
              .upsert(
                {
                  access_token: cleanToken,
                  team_name: teamName || null,
                  storage_path: storagePath,
                  stage_count: stageCount,
                  uploaded_at: new Date().toISOString(),
                },
                { onConflict: 'access_token' }
              )
              .select('id')
              .single();

            if (archiveErr || !archiveRow) {
              console.warn(`[token_archives upsert warning for ${cleanToken}]:`, archiveErr?.message);
            } else if (!primaryArchiveId) {
              primaryArchiveId = (archiveRow as any).id as string;
            }
          }

          // If passwords are provided (optional), save them to stage_passwords
          if (primaryArchiveId && passwords && Array.isArray(passwords) && passwords.length > 0) {
            await supabaseAdmin
              .from('stage_passwords')
              .delete()
              .eq('token_archive_id', primaryArchiveId);

            const passwordRows = passwords.map((pw, idx) => ({
              token_archive_id: primaryArchiveId,
              stage_number: idx + 2, // stages 2, 3, 4, …
              password: pw,
            }));

            const { error: pwErr } = await supabaseAdmin
              .from('stage_passwords')
              .insert(passwordRows);

            if (pwErr) {
              console.warn('[stage_passwords insert warning]:', pwErr.message);
            }
          }

          committed.push(teamName || targetTokens[0]);
        } catch (err: any) {
          errors.push({ target: teamName || targetTokens[0], error: err.message });
        }
      }

      return NextResponse.json({ success: true, committed, errors });
    }

    return NextResponse.json({ error: 'Invalid action. Use presign or commit.' }, { status: 400 });
  } catch (error: any) {
    console.error('[API /admin/stages/bulk-upload error]:', error);
    return NextResponse.json(
      { error: error.message || 'Bulk upload failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/stages/bulk-upload?adminSecret=...
 * Returns list of all committed token archives with team metadata.
 */
export async function GET(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isSupabaseConfigured) {
      return NextResponse.json({ archives: [] });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('token_archives')
      .select('id, access_token, team_name, storage_path, stage_count, uploaded_at')
      .order('uploaded_at', { ascending: false });

    if (error) {
      // If team_name column not present yet, fall back to base columns
      if (error.message?.includes('team_name')) {
        const { data: fallbackData } = await supabaseAdmin
          .from('token_archives')
          .select('id, access_token, storage_path, stage_count, uploaded_at')
          .order('uploaded_at', { ascending: false });
        return NextResponse.json({ archives: fallbackData || [] });
      }
      throw error;
    }

    return NextResponse.json({ archives: data || [] });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to list token archives' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/stages/bulk-upload
 * Deletes a specific token archive record (or all records for a team).
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminSecret, accessToken, teamName, storagePath } = body;
    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (storagePath) {
      const { error } = await supabaseAdmin
        .from('token_archives')
        .delete()
        .eq('storage_path', storagePath);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (teamName) {
      const { error } = await supabaseAdmin
        .from('token_archives')
        .delete()
        .eq('team_name', teamName);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    if (accessToken) {
      const { error } = await supabaseAdmin
        .from('token_archives')
        .delete()
        .eq('access_token', accessToken);
      if (error) throw error;
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'accessToken, teamName, or storagePath is required' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
