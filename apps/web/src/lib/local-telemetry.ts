import fs from 'fs';
import path from 'path';
import { StageTelemetry, TelemetryPingRequest, User } from './types';

function getTelemetryFilePath() {
  const nextDir = path.join(process.cwd(), '.next');
  fs.mkdirSync(nextDir, { recursive: true });
  return path.join(nextDir, 'local-stage-telemetry.json');
}

export function readLocalTelemetry(): StageTelemetry[] {
  try {
    const filePath = getTelemetryFilePath();
    if (!fs.existsSync(filePath)) return [];
    const records = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

export function recordLocalTelemetryPing(
  user: User,
  stageNumber: number,
  type: TelemetryPingRequest['type']
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

  fs.writeFileSync(getTelemetryFilePath(), JSON.stringify(records, null, 2), 'utf-8');
}
