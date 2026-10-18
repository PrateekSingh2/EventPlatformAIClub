import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import {
  clearLocalPasswordAttemptState,
  getLocalPasswordAttemptState,
  recordLocalPasswordFailure,
} from '@/lib/local-telemetry';
import { User } from '@/lib/types';

export interface PasswordAttemptState {
  failedAttempts: number;
  cooldownUntil: string | null;
  cooldownSeconds: number;
  excessive: boolean;
}

function remainingSeconds(cooldownUntil: string | null | undefined) {
  return cooldownUntil
    ? Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000))
    : 0;
}

export async function getPasswordAttemptState(user: User, stageNumber: number): Promise<PasswordAttemptState> {
  if (!isSupabaseConfigured) {
    return getLocalPasswordAttemptState(user.id, stageNumber);
  }

  const { data, error } = await getSupabaseAdmin()
    .from('stage_telemetry')
    .select('password_failed_attempts, password_cooldown_until, excessive_password_guesses')
    .eq('user_id', user.id)
    .eq('stage_number', stageNumber)
    .maybeSingle();

  if (error) throw error;
  const cooldownUntil = data?.password_cooldown_until || null;
  const cooldownSeconds = remainingSeconds(cooldownUntil);
  return {
    failedAttempts: data?.password_failed_attempts || 0,
    cooldownUntil: cooldownSeconds ? cooldownUntil : null,
    cooldownSeconds,
    excessive: (data?.excessive_password_guesses || 0) > 0,
  };
}

export async function registerPasswordFailure(
  user: User,
  stageNumber: number
): Promise<PasswordAttemptState & { blocked: boolean }> {
  if (!isSupabaseConfigured) {
    const current = getLocalPasswordAttemptState(user.id, stageNumber);
    if (current.cooldownSeconds > 0) return { ...current, blocked: true };
    const result = recordLocalPasswordFailure(user, stageNumber);
    const updated = getLocalPasswordAttemptState(user.id, stageNumber);
    return { ...updated, failedAttempts: result.failedAttempts, cooldownSeconds: result.cooldownSeconds, blocked: false };
  }

  const { data, error } = await getSupabaseAdmin().rpc('register_stage_password_failure', {
    p_user_id: user.id,
    p_stage_number: stageNumber,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error('Password attempt limiter returned no state');
  return {
    failedAttempts: row.failed_attempts || 0,
    cooldownUntil: row.cooldown_until || null,
    cooldownSeconds: row.cooldown_seconds || 0,
    excessive: Boolean(row.excessive),
    blocked: Boolean(row.blocked),
  };
}

export async function clearPasswordAttemptState(user: User, stageNumber: number) {
  if (!isSupabaseConfigured) {
    clearLocalPasswordAttemptState(user.id, stageNumber);
    return;
  }

  const { error } = await getSupabaseAdmin()
    .from('stage_telemetry')
    .update({ password_failed_attempts: 0, password_cooldown_until: null, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('stage_number', stageNumber);
  if (error) throw error;
}
