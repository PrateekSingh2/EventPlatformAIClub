import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { googleFormRowsToDbPayload, parseGoogleFormTsv } from '@/lib/google-form-import';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const record = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
    const tsv = typeof record.tsv === 'string' ? record.tsv : '';
    if (!tsv.trim()) {
      return NextResponse.json({ error: 'Missing tsv field (Google Form export paste)' }, { status: 400 });
    }

    const parsed = parseGoogleFormTsv(tsv);
    if (parsed.length === 0) {
      return NextResponse.json({ error: 'No valid teams found in TSV' }, { status: 400 });
    }

    const payloads = googleFormRowsToDbPayload(parsed);
    const supabase = getSupabaseAdmin();

    let inserted = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const row of payloads) {
      const { data: existing } = await supabase
        .from('team_registration_submissions')
        .select('id')
        .eq('team_name', row.team_name)
        .maybeSingle();

      if (existing?.id) {
        const { error } = await supabase
          .from('team_registration_submissions')
          .update({
            members: row.members,
            squad_merge_opt_in: row.squad_merge_opt_in,
            ...(row.created_at ? { created_at: row.created_at } : {}),
          })
          .eq('id', existing.id);
        if (error) errors.push(`${row.team_name}: ${error.message}`);
        else updated += 1;
      } else {
        const { error } = await supabase.from('team_registration_submissions').insert(row);
        if (error) errors.push(`${row.team_name}: ${error.message}`);
        else inserted += 1;
      }
    }

    const skippedWarnings = parsed.flatMap((r) =>
      r.warnings.map((w) => `${r.team_name} (line ${r.source_line}): ${w}`)
    );

    return NextResponse.json({
      success: errors.length === 0,
      parsed: parsed.length,
      inserted,
      updated,
      errors,
      warnings: skippedWarnings,
    });
  } catch (err) {
    console.error('[POST /api/admin/form-submissions/import]', err);
    return NextResponse.json({ error: 'Import failed' }, { status: 500 });
  }
}
