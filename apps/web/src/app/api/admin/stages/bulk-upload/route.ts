import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { createTokenArchiveUploadUrl } from '@/lib/storage';

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
 *   tokens: string[],           // access tokens in order (X items)
 * }
 *
 * Request body (action='commit'):
 * {
 *   action: 'commit',
 *   adminSecret: string,
 *   archives: Array<{
 *     accessToken: string,
 *     storagePath: string,
 *     stageCount: number,
 *     passwords: string[],     // passwords for stages 2..N (length = stageCount - 1)
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
      const { tokens } = body as { tokens: string[] };
      if (!Array.isArray(tokens) || tokens.length === 0) {
        return NextResponse.json({ error: 'tokens array is required' }, { status: 400 });
      }

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

    // ── Action: commit ─────────────────────────────────────────────────────────
    if (action === 'commit') {
      const { archives } = body as {
        archives: Array<{
          accessToken: string;
          storagePath: string;
          stageCount: number;
          passwords?: string[];
        }>;
      };

      if (!Array.isArray(archives) || archives.length === 0) {
        return NextResponse.json({ error: 'archives array is required' }, { status: 400 });
      }

      const supabaseAdmin = getSupabaseAdmin();
      const committed: string[] = [];
      const errors: Array<{ accessToken: string; error: string }> = [];

      for (const arch of archives) {
        const { accessToken, storagePath, stageCount, passwords } = arch;
        try {
          // Upsert token_archives record
          const { data: archiveRow, error: archiveErr } = await supabaseAdmin
            .from('token_archives')
            .upsert(
              {
                access_token: accessToken,
                storage_path: storagePath,
                stage_count: stageCount,
                uploaded_at: new Date().toISOString(),
              },
              { onConflict: 'access_token' }
            )
            .select('id')
            .single();

          if (archiveErr || !archiveRow) {
            throw new Error(archiveErr?.message || 'Failed to upsert token_archives record');
          }

          const archiveId = (archiveRow as any).id as string;

          // If passwords are provided (optional), save them to stage_passwords
          if (passwords && Array.isArray(passwords) && passwords.length > 0) {
            await supabaseAdmin
              .from('stage_passwords')
              .delete()
              .eq('token_archive_id', archiveId);

            const passwordRows = passwords.map((pw, idx) => ({
              token_archive_id: archiveId,
              stage_number: idx + 2, // stages 2, 3, 4, …
              password: pw,
            }));

            const { error: pwErr } = await supabaseAdmin
              .from('stage_passwords')
              .insert(passwordRows);

            if (pwErr) {
              throw new Error(pwErr.message || 'Failed to insert stage_passwords');
            }
          }

          committed.push(accessToken);
        } catch (err: any) {
          errors.push({ accessToken, error: err.message });
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
 * Returns list of all committed token archives.
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
      .select('id, access_token, storage_path, stage_count, uploaded_at')
      .order('uploaded_at', { ascending: false });

    if (error) {
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
 * Deletes a specific token archive record (does not delete storage file).
 */
export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { adminSecret, accessToken } = body;
    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from('token_archives')
      .delete()
      .eq('access_token', accessToken);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Delete failed' }, { status: 500 });
  }
}
