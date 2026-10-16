import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';
import { createParticipantDownloadUrl } from '@/lib/s3';
import { SanitizedQuizQuestion } from '@/lib/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber } = body;

    if (!accessToken || !stageNumber) {
      return NextResponse.json(
        { error: 'accessToken and stageNumber are required' },
        { status: 400 }
      );
    }

    // 1. Authenticate user
    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid access token' },
        { status: 401 }
      );
    }

    const stageNum = Number(stageNumber);
    const supabaseAdmin = getSupabaseAdmin();

    // 2. Fetch stage details
    const { data: stage, error: stageErr } = await supabaseAdmin
      .from('stages')
      .select('stage_number, title, s3_key, is_password_protected, allowed_copy_filename, points, quiz_questions')
      .eq('stage_number', stageNum)
      .single();

    if (stageErr || !stage) {
      // Fallback for local preview & testing with generated demo archives
      if (stageNum === 2) {
        return NextResponse.json({
          downloadUrl: '/demo-stage-2-encrypted.zip',
          allowedCopyFilename: 'ai_prompt_stage2.txt',
          isPasswordProtected: true,
          stageNumber: 2,
          title: 'Stage 2: Quantum Key Distribution Protocol',
          points: 150,
          quizQuestions: [],
        });
      }

      if (stageNum === 3) {
        return NextResponse.json({
          downloadUrl: '/demo-stage-3-encrypted.zip',
          allowedCopyFilename: 'ai_prompt_stage3.txt',
          isPasswordProtected: true,
          stageNumber: 3,
          title: 'Stage 3: Master Architecture Unlocked',
          points: 200,
          quizQuestions: [],
        });
      }

      // Default Stage 1 Demo
      return NextResponse.json({
        downloadUrl: '/demo-stage-1.zip',
        allowedCopyFilename: 'ai_prompt.txt',
        isPasswordProtected: false,
        stageNumber: 1,
        title: 'Stage 1: Neural Anomaly Extraction & Data Decryption',
        points: 100,
        quizQuestions: [
          {
            question: 'What is the anomaly threshold identified in the data cluster?',
            options: ['0.042 ms', '1.284 ms', '9.810 ms', '0.001 ms'],
          },
          {
            question: 'Which model parameter governs the selective prompt transmission?',
            options: ['allowed_copy_filename', 'temperature', 'top_p', 'max_tokens'],
          },
        ],
      });
    }

    // 3. Silently initialize started_at in stage_telemetry with ON CONFLICT DO NOTHING
    // This ensures page refreshes or multiple GET requests do not reset the participant clock
    const { error: telemetryErr } = await supabaseAdmin
      .from('stage_telemetry')
      .upsert(
        {
          user_id: user.id,
          stage_number: stageNum,
          started_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,stage_number',
          ignoreDuplicates: true, // Crucial: prevents resetting started_at if already started
        }
      );

    if (telemetryErr) {
      console.warn('[Telemetry insert warning]:', telemetryErr.message);
    }

    // 4. Generate short-lived (60s) AWS S3 Presigned GET URL
    const { downloadUrl } = await createParticipantDownloadUrl(stage.s3_key);

    // 5. Sanitize quiz questions (STRIP answer_idx completely before sending to client)
    const rawQuestions = (stage.quiz_questions as any[]) || [];
    const sanitizedQuestions: SanitizedQuizQuestion[] = rawQuestions.map((q) => ({
      question: q.question,
      options: q.options || [],
    }));

    return NextResponse.json({
      downloadUrl,
      allowedCopyFilename: stage.allowed_copy_filename || '',
      isPasswordProtected: stage.is_password_protected || false,
      stageNumber: stage.stage_number,
      title: stage.title,
      points: stage.points || 100,
      quizQuestions: sanitizedQuestions,
    });
  } catch (error: any) {
    console.error('[API POST /api/stage/access-zip error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate stage access credentials' },
      { status: 500 }
    );
  }
}
