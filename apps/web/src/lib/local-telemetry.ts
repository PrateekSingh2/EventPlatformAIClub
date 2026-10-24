import fs from 'fs';
import path from 'path';
import { StageTelemetry, TelemetryPingRequest, User } from './types';

function getTelemetryFilePath(): string | null {
  try {
    const nextDir = path.join(process.cwd(), '.next');
    fs.mkdirSync(nextDir, { recursive: true });
    return path.join(nextDir, 'local-stage-telemetry.json');
  } catch {
    return null;
  }
}

function writeTelemetryRecords(records: StageTelemetry[]): void {
  const filePath = getTelemetryFilePath();
  if (!filePath) return;
  try {
    fs.writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  } catch {
    // Read-only or serverless filesystem — skip local persistence
  }
}

export function readLocalTelemetry(): StageTelemetry[] {
  try {
    const filePath = getTelemetryFilePath();
    if (!filePath || !fs.existsSync(filePath)) return [];
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function recordLocalTelemetryPing(
  user: User,
  stageNumber: number,
  type: TelemetryPingRequest['type'],
  latencyMs?: number
) {
  const records = readLocalTelemetry();
  const now = new Date().toISOString();
  const userId = user.id;
  let record = records.find(
    (item) => item.user_id === userId && item.stage_number === stageNumber
  );

  if (!record) {
    record = {
      id: `local-${encodeURIComponent(userId)}-${stageNumber}`,
      user_id: userId,
      stage_number: stageNumber,
      started_at: now,
      completed_at: null,
      duration_seconds: null,
      tab_switches: 0,
      fullscreen_exits: 0,
      multi_monitor_detected: 0,
      devtools_timing_flags: 0,
      window_size_discrepancies: 0,
      flagged_too_fast: false,
      flag_reason: null,
      created_at: now,
      updated_at: now,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        total_score: user.total_score || 0,
        current_stage: user.current_stage || stageNumber,
        is_flagged: user.is_flagged || false,
        is_disqualified: user.is_disqualified || false,
      },
    };
    records.push(record);
  }

  if (type === 'tab_switch') record.tab_switches += 1;
  if (type === 'fullscreen_exit') record.fullscreen_exits += 1;
  if (type === 'multi_monitor_detected') {
    record.multi_monitor_detected = (record.multi_monitor_detected || 0) + 1;
    record.flag_reason = 'Anti-Cheat Alert: Multi-monitor or detached window activity detected';
  }
  if (type === 'devtools_timing') {
    record.devtools_timing_flags = (record.devtools_timing_flags || 0) + 1;
    if (Number.isFinite(latencyMs)) record.devtools_probe_latency_ms = latencyMs;
    record.flag_reason = 'Heuristic signal: DevTools console getter was evaluated';
  }
  if (type === 'window_size_discrepancy') {
    record.window_size_discrepancies = (record.window_size_discrepancies || 0) + 1;
    record.flag_reason = 'Heuristic signal: Browser outer/inner width difference exceeded 160px';
  }
  record.updated_at = now;
  record.user = {
    ...record.user,
    name: user.name,
    email: user.email,
    role: user.role,
    total_score: user.total_score || 0,
    current_stage: user.current_stage || stageNumber,
    is_flagged: user.is_flagged || false,
    is_disqualified: user.is_disqualified || false,
  };

  writeTelemetryRecords(records);
}

export function recordLocalPasswordFailure(user: User, stageNumber: number) {
  const records = readLocalTelemetry();
  const now = new Date().toISOString();
  let record = records.find((item) => item.user_id === user.id && item.stage_number === stageNumber);

  if (!record) {
    record = {
      id: `local-${encodeURIComponent(user.id)}-${stageNumber}`,
      user_id: user.id,
      stage_number: stageNumber,
      started_at: now,
      completed_at: null,
      duration_seconds: null,
      tab_switches: 0,
      fullscreen_exits: 0,
      multi_monitor_detected: 0,
      devtools_timing_flags: 0,
      window_size_discrepancies: 0,
      flagged_too_fast: false,
      flag_reason: null,
      created_at: now,
      updated_at: now,
      user: {
        name: user.name,
        email: user.email,
        role: user.role,
        total_score: user.total_score || 0,
        current_stage: user.current_stage || stageNumber,
        is_flagged: user.is_flagged || false,
        is_disqualified: user.is_disqualified || false,
      },
    };
    records.push(record);
  }

  const attempts = (record.password_failed_attempts || 0) + 1;
  const cooldownSeconds = attempts >= 5 ? 60 : attempts >= 3 ? 15 : 0;
  record.password_failed_attempts = attempts;
  record.password_cooldown_until = cooldownSeconds
    ? new Date(Date.now() + cooldownSeconds * 1000).toISOString()
    : null;
  if (attempts === 5) {
    record.excessive_password_guesses = (record.excessive_password_guesses || 0) + 1;
    record.flag_reason = 'Anti-Cheat Alert: Excessive password guesses (5 incorrect attempts)';
  }
  record.updated_at = now;
  record.user = {
    ...record.user,
    name: user.name,
    email: user.email,
    role: user.role,
    total_score: user.total_score || 0,
    current_stage: user.current_stage || stageNumber,
    is_flagged: user.is_flagged || false,
    is_disqualified: user.is_disqualified || false,
  };
  writeTelemetryRecords(records);
  return { failedAttempts: attempts, cooldownSeconds, excessive: attempts >= 5 };
}

export function getLocalPasswordAttemptState(userId: string, stageNumber: number) {
  const record = readLocalTelemetry().find(
    (item) => item.user_id === userId && item.stage_number === stageNumber
  );
  const cooldownUntil = record?.password_cooldown_until || null;
  const cooldownSeconds = cooldownUntil
    ? Math.max(0, Math.ceil((new Date(cooldownUntil).getTime() - Date.now()) / 1000))
    : 0;
  return {
    failedAttempts: record?.password_failed_attempts || 0,
    cooldownUntil: cooldownSeconds > 0 ? cooldownUntil : null,
    cooldownSeconds,
    excessive: (record?.excessive_password_guesses || 0) > 0,
  };
}

export function clearLocalPasswordAttemptState(userId: string, stageNumber: number) {
  const records = readLocalTelemetry();
  const record = records.find((item) => item.user_id === userId && item.stage_number === stageNumber);
  if (!record) return;
  record.password_failed_attempts = 0;
  record.password_cooldown_until = null;
  record.updated_at = new Date().toISOString();
  writeTelemetryRecords(records);
}

export function resetLocalTelemetryForUser(userId: string) {
  try {
    const records = readLocalTelemetry();
    const filtered = records.filter((item) => item.user_id !== userId);
    writeTelemetryRecords(filtered);
  } catch {}
}
