import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: stages, error } = await supabaseAdmin
      .from('stages')
      .select('*')
      .order('stage_number', { ascending: true });

    if (error || !stages || stages.length === 0) {
      return NextResponse.json({
        stages: [
          {
            id: 'stage-1-uuid',
            stage_number: 1,
            title: 'Neural Anomaly Extraction & Data Decryption',
            s3_key: 'stages/stage-1/demo-stage-1.zip',
            is_password_protected: false,
            allowed_copy_filename: 'ai_prompt.txt',
            min_expected_seconds: 60,
            points: 100,
            quiz_questions: [
              {
                question: 'What is the anomaly threshold identified in the data cluster?',
                options: ['0.042 ms', '1.284 ms', '9.810 ms', '0.001 ms'],
                answer_idx: 0,
              },
              {
                question: 'Which model parameter governs the selective prompt transmission?',
                options: ['allowed_copy_filename', 'temperature', 'top_p', 'max_tokens'],
                answer_idx: 0,
              },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          {
            id: 'stage-2-uuid',
            stage_number: 2,
            title: 'Quantum Key Distribution Protocol',
            s3_key: 'stages/stage-2/demo-stage-2-encrypted.zip',
            is_password_protected: true,
            allowed_copy_filename: 'ai_prompt_stage2.txt',
            min_expected_seconds: 90,
            points: 150,
            quiz_questions: [
              {
                question: 'Which encryption cipher was required to unlock the Stage 2 archive?',
                options: ['AES-256 / ZipCrypto', 'RSA-4096', 'Triple-DES', 'Blowfish-128'],
                answer_idx: 0,
              },
              {
                question: 'What is the classified protocol code name in the dossier?',
                options: ['Quantum Key Distribution Protocol', 'Deep Neural Net', 'Bypass Vector', 'Shadow Cache'],
                answer_idx: 0,
              },
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        ],
      });
    }

    return NextResponse.json({ stages: stages || [] });
  } catch (error: any) {
    return NextResponse.json({
      stages: [
        {
          id: 'stage-1-uuid',
          stage_number: 1,
          title: 'Neural Anomaly Extraction & Data Decryption',
          s3_key: 'stages/stage-1/demo-stage-1.zip',
          is_password_protected: false,
          allowed_copy_filename: 'ai_prompt.txt',
          min_expected_seconds: 60,
          points: 100,
          quiz_questions: [
            {
              question: 'What is the anomaly threshold identified in the data cluster?',
              options: ['0.042 ms', '1.284 ms', '9.810 ms', '0.001 ms'],
              answer_idx: 0,
            },
            {
              question: 'Which model parameter governs the selective prompt transmission?',
              options: ['allowed_copy_filename', 'temperature', 'top_p', 'max_tokens'],
              answer_idx: 0,
            },
          ],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ],
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      stageNumber,
      title,
      s3Key,
      isPasswordProtected,
      zipPassword,
      allowedCopyFilename,
      minExpectedSeconds,
      points,
      quizQuestions,
      adminSecret,
    } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!stageNumber || !title || !s3Key) {
      return NextResponse.json(
        { error: 'stageNumber, title, and s3Key are required fields' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('stages')
      .upsert(
        {
          stage_number: Number(stageNumber),
          title: title.trim(),
          s3_key: s3Key.trim(),
          is_password_protected: Boolean(isPasswordProtected),
          zip_password: (zipPassword || '').trim(),
          allowed_copy_filename: (allowedCopyFilename || '').trim(),
          min_expected_seconds: Number(minExpectedSeconds) || 60,
          points: Number(points) || 100,
          quiz_questions: Array.isArray(quizQuestions) ? quizQuestions : [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'stage_number' }
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      stage: data,
    });
  } catch (error: any) {
    console.error('[API POST /admin/stages error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to save stage configuration' },
      { status: 500 }
    );
  }
}
