import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { StageManifest } from '@/lib/types';

const DEMO_FALLBACK_STAGES: StageManifest[] = [
  {
    stageNumber: 1,
    title: 'Neural Anomaly Extraction & Data Decryption',
    isPasswordProtected: false,
    allowedCopyFilename: 'ai_prompt.txt',
    points: 100,
  },
  {
    stageNumber: 2,
    title: 'Quantum Key Distribution Protocol',
    isPasswordProtected: true,
    allowedCopyFilename: 'ai_prompt_stage2.txt',
    points: 150,
  },
  {
    stageNumber: 3,
    title: 'Master Architecture Unlocked',
    isPasswordProtected: true,
    allowedCopyFilename: 'ai_prompt_stage3.txt',
    points: 200,
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: 'accessToken is required' }, { status: 400 });
    }

    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid access token' },
        { status: 401 }
      );
    }

    if (isSupabaseConfigured) {
      try {
        const supabaseAdmin = getSupabaseAdmin();
        const cleanToken = accessToken.trim().toUpperCase();

        // 1. Check if participant has an archive bundle assigned by access_token
        let { data: archive } = await supabaseAdmin
          .from('token_archives')
          .select('stage_count')
          .eq('access_token', cleanToken)
          .maybeSingle();

        // Fallback: check by team_name if member token not directly mapped
        if (!archive && user.team_name) {
          try {
            const { data: teamArchive } = await supabaseAdmin
              .from('token_archives')
              .select('stage_count')
              .eq('team_name', user.team_name)
              .order('uploaded_at', { ascending: false })
              .limit(1)
              .maybeSingle();
            if (teamArchive) archive = teamArchive;
          } catch {}
        }

        if (archive && (archive as any).stage_count > 0) {
          const stageCount = Number((archive as any).stage_count);
          const manifestList: StageManifest[] = Array.from({ length: stageCount }, (_, i) => ({
            stageNumber: i + 1,
            title: `Stage ${i + 1}`,
            isPasswordProtected: i > 0,
            allowedCopyFilename: 'ai_prompt.txt',
            points: (i + 1) * 100,
          }));
          return NextResponse.json({ stages: manifestList });
        }

        // 2. Fall back to global stages table
        const { data: dbStages, error: stageErr } = await supabaseAdmin
          .from('stages')
          .select('stage_number, title, is_password_protected, allowed_copy_filename, points')
          .order('stage_number', { ascending: true });

        if (!stageErr && dbStages && dbStages.length > 0) {
          const manifestList: StageManifest[] = (dbStages as any[]).map((s: any) => ({
            stageNumber: s.stage_number,
            title: s.title,
            isPasswordProtected: Boolean(s.is_password_protected),
            allowedCopyFilename: s.allowed_copy_filename || '',
            points: s.points || 100,
          }));
          return NextResponse.json({ stages: manifestList });
        }
      } catch {
        // Supabase connection or table error fallback
      }
    }

    return NextResponse.json({ stages: DEMO_FALLBACK_STAGES });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
