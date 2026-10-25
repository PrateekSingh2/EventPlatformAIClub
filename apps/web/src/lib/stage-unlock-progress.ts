import type { User } from '@/lib/types';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Updates user row + telemetry after a stage unlock (normal or bypass). */
export async function applyStageUnlockProgress(
  supabaseAdmin: SupabaseClient,
  user: User,
  stageNum: number,
  options: {
    pointsToAward: number;
    completedAt?: string;
    completedTimestamp?: number;
    durationSeconds?: number;
    bypassed?: boolean;
  }
): Promise<{ newStage: number; pointsToAward: number }> {
  const pointsToAward = options.pointsToAward;
  const prevStage = user.current_stage || 1;
  const newStage = Math.max(prevStage, stageNum);
  const completionIso = options.completedAt || new Date().toISOString();
  const currentDuration = Math.max(1, Number(options.durationSeconds) || 30);

  const existingTimestamps = (user as User & { stage_timestamps?: Record<string, string> })
    .stage_timestamps || {};
  const existingDurations = (user as User & { stage_durations?: Record<string, number> })
    .stage_durations || {};
  const clearedStageNum = Math.max(1, stageNum - 1);

  const updatedTimestamps = {
    ...existingTimestamps,
    [clearedStageNum]: completionIso,
  };
  const updatedDurations = {
    ...existingDurations,
    [clearedStageNum]: currentDuration,
  };

  const newTotalTimeSeconds = Object.values(updatedDurations).reduce<number>(
    (acc, d) => acc + (Number(d) || 0),
    0
  );

  await supabaseAdmin
    .from('users')
    .update({
      total_score: (user.total_score || 0) + pointsToAward,
      current_stage: newStage,
      stage_timestamps: updatedTimestamps,
      stage_durations: updatedDurations,
      total_time_seconds: newTotalTimeSeconds,
      last_stage_completed_at: completionIso,
      updated_at: completionIso,
    })
    .eq('id', user.id);

  try {
    await supabaseAdmin.from('stage_telemetry').upsert(
      {
        user_id: user.id,
        stage_number: stageNum - 1,
        completed_at: completionIso,
        completed_timestamp: options.completedTimestamp || Date.now(),
        duration_seconds: options.durationSeconds || 0,
        score_awarded: pointsToAward,
        ...(options.bypassed
          ? { flag_reason: 'stage_bypassed', flagged_too_fast: false }
          : {}),
      },
      { onConflict: 'user_id,stage_number', ignoreDuplicates: false }
    );
  } catch {
    /* non-fatal */
  }

  return { newStage, pointsToAward };
}
