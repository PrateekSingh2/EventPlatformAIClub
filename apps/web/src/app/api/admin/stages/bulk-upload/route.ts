import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import {
  createCaseStudyPoolUploadUrl,
  createTokenArchiveUploadUrl,
  createTeamArchiveUploadUrl,
  listCaseStudyPoolArchives,
  STAGES_BUCKET,
  storageArchiveExists,
} from '@/lib/storage';
import { chunkArray, mapWithConcurrency } from '@/lib/async-pool';
import { syncStagePasswordsFromPoolKeys } from '@/lib/sync-stage-passwords';

const PRESIGN_CONCURRENCY = 15;
const TOKEN_UPSERT_CHUNK = 200;

type TokenArchiveUpsertRow = {
  access_token: string;
  team_name?: string | null;
  storage_path: string;
  stage_count: number;
  uploaded_at: string;
};

async function upsertTokenArchiveChunks(
  supabaseAdmin: ReturnType<typeof getSupabaseAdmin>,
  tokenRows: TokenArchiveUpsertRow[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  for (const chunk of chunkArray(tokenRows, TOKEN_UPSERT_CHUNK)) {
    let { error: upsertErr } = await supabaseAdmin
      .from('token_archives')
      .upsert(chunk, { onConflict: 'access_token' });

    if (upsertErr?.message?.includes('team_name')) {
      const slim = chunk.map(({ access_token, storage_path, stage_count, uploaded_at }) => ({
        access_token,
        storage_path,
        stage_count,
        uploaded_at,
      }));
      const retry = await supabaseAdmin
        .from('token_archives')
        .upsert(slim, { onConflict: 'access_token' });
      upsertErr = retry.error;
    }

    if (upsertErr) {
      return { ok: false, error: upsertErr.message };
    }
  }
  return { ok: true };
}

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

        const presigned = await mapWithConcurrency(teams, PRESIGN_CONCURRENCY, async (team) => {
          const urlData = await createTeamArchiveUploadUrl(team.teamKey);
          return {
            teamKey: team.teamKey,
            teamName: team.teamName,
            tokens: team.tokens,
            accessToken: team.tokens[0] || team.teamKey,
            ...urlData,
          };
        });

        return NextResponse.json({ success: true, uploadTargets: presigned });
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

    if (action === 'presign-pool') {
      const { items } = body as { items?: Array<{ poolKey: string }> };
      if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: 'items array with poolKey is required' }, { status: 400 });
      }

      const poolTargets = await mapWithConcurrency(items, PRESIGN_CONCURRENCY, async (item) => {
        return createCaseStudyPoolUploadUrl(item.poolKey);
      });

      return NextResponse.json({ success: true, poolTargets });
    }

    // ── Action: commit ─────────────────────────────────────────────────────────
    if (action === 'commit' || action === 'commit-pool') {
      const allowSharedStoragePaths = action === 'commit-pool' || Boolean(body.allowSharedStoragePaths);
      const { archives } = body as {
        archives: Array<{
          accessToken?: string;
          teamKey?: string;
          teamName?: string;
          tokens?: string[];
          storagePath: string;
          stageCount: number;
          passwords?: string[];
          poolKey?: string;
        }>;
      };

      if (!Array.isArray(archives) || archives.length === 0) {
        return NextResponse.json({ error: 'archives array is required' }, { status: 400 });
      }

      if (!allowSharedStoragePaths) {
        const storagePathsSeen = new Set<string>();
        for (const arch of archives) {
          const path = arch.storagePath.trim();
          if (storagePathsSeen.has(path)) {
            return NextResponse.json(
              {
                error: `Uniqueness violation: Archive "${path}" is mapped to multiple teams. Use pool distribution to reuse case studies.`,
              },
              { status: 400 }
            );
          }
          storagePathsSeen.add(path);
        }
      }

      const uniquePaths = [...new Set(archives.map((a) => a.storagePath.trim()).filter(Boolean))];
      for (const path of uniquePaths) {
        const ok = await storageArchiveExists(path);
        if (!ok) {
          return NextResponse.json(
            {
              error: `Pool ZIP missing in storage: "${path}". Upload (or re-upload) this case study in the pool, then assign again.`,
            },
            { status: 400 }
          );
        }
      }

      const supabaseAdmin = getSupabaseAdmin();
      const committed: string[] = [];
      const errors: Array<{ target: string; error: string }> = [];
      const uploadedAt = new Date().toISOString();

      const tokenRows: TokenArchiveUpsertRow[] = [];
      const passwordMeta: Array<{ teamName: string; primaryToken: string; passwords?: string[] }> = [];

      for (const arch of archives) {
        let { accessToken, teamName, tokens, storagePath, stageCount, passwords } = arch;
        if ((!passwords || passwords.length === 0) && arch.poolKey) {
          const { passwordArrayForPoolKey } = await import('@/lib/case-study-password-keys');
          passwords = passwordArrayForPoolKey(arch.poolKey);
        }
        const targetTokens =
          tokens && tokens.length > 0 ? tokens : accessToken ? [accessToken] : [];

        if (targetTokens.length === 0) {
          errors.push({ target: teamName || 'Unknown Team', error: 'No tokens found for team archive' });
          continue;
        }

        for (const token of targetTokens) {
          tokenRows.push({
            access_token: token.trim().toUpperCase(),
            team_name: teamName || null,
            storage_path: storagePath,
            stage_count: stageCount,
            uploaded_at: uploadedAt,
          });
        }

        passwordMeta.push({
          teamName: teamName || targetTokens[0],
          primaryToken: targetTokens[0].trim().toUpperCase(),
          passwords,
        });
        committed.push(teamName || targetTokens[0]);
      }

      const upsertResult = await upsertTokenArchiveChunks(supabaseAdmin, tokenRows);
      if (!upsertResult.ok) {
        errors.push({ target: 'batch-upsert', error: upsertResult.error });
      }

      for (const meta of passwordMeta) {
        if (!meta.passwords?.length) continue;
        try {
          const { data: archiveRow } = await supabaseAdmin
            .from('token_archives')
            .select('id')
            .eq('access_token', meta.primaryToken)
            .maybeSingle();

          const primaryArchiveId = archiveRow?.id as string | undefined;
          if (!primaryArchiveId) continue;

          await supabaseAdmin.from('stage_passwords').delete().eq('token_archive_id', primaryArchiveId);

          const passwordRows = meta.passwords.map((pw, idx) => ({
            token_archive_id: primaryArchiveId,
            stage_number: idx + 2,
            password: pw,
          }));

          const { error: pwErr } = await supabaseAdmin.from('stage_passwords').insert(passwordRows);
          if (pwErr) {
            console.warn('[stage_passwords insert warning]:', pwErr.message);
          }
        } catch (err: any) {
          console.warn('[stage_passwords optional write]:', err.message);
        }
      }

      let passwordSync: Awaited<ReturnType<typeof syncStagePasswordsFromPoolKeys>> | undefined;
      if (action === 'commit-pool') {
        try {
          passwordSync = await syncStagePasswordsFromPoolKeys(supabaseAdmin);
        } catch (err: unknown) {
          console.warn('[syncStagePasswordsFromPoolKeys]:', err);
        }
      }

      return NextResponse.json({
        success: errors.length === 0,
        committed,
        errors,
        passwordSync,
      });
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

    if (req.nextUrl.searchParams.get('listPool') === '1') {
      if (!isSupabaseConfigured) {
        return NextResponse.json({ poolItems: [] });
      }
      const poolItems = await listCaseStudyPoolArchives();
      return NextResponse.json({ poolItems });
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
    const { adminSecret, accessToken, teamName, storagePath, purgeAll, poolKey } = body;
    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    if (purgeAll === true) {
      try {
        await supabaseAdmin.from('stage_passwords').delete().gte('stage_number', 0);
      } catch {
        /* optional table / FK */
      }

      const { count: beforeCount } = await supabaseAdmin
        .from('token_archives')
        .select('*', { count: 'exact', head: true });

      const { error: purgeErr } = await supabaseAdmin
        .from('token_archives')
        .delete()
        .gte('uploaded_at', '1970-01-01T00:00:00Z');

      if (purgeErr) {
        return NextResponse.json({ error: purgeErr.message || 'Failed to purge archives' }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        purged: true,
        deletedCount: beforeCount ?? 0,
      });
    }

    if (poolKey) {
      const cleanKey = String(poolKey).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 80);
      await supabaseAdmin.storage
        .from(STAGES_BUCKET)
        .remove([`case-study-pool/${cleanKey}/archive.zip`]);
      return NextResponse.json({ success: true, removedPoolKey: cleanKey });
    }

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
