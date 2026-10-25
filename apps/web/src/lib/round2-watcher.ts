import type { FinalTeamRecord } from '@/lib/final-teams';
import type { StageBypassRecord } from '@/lib/stage-bypass-db';
import type { StageTelemetry, User } from '@/lib/types';

export type Round2MemberLiveRow = {
  user_id: string;
  name: string;
  email: string;
  current_stage: number;
  total_score: number;
  is_flagged: boolean;
  is_disqualified: boolean;
  is_completed: boolean;
  tab_switches: number;
  fullscreen_exits: number;
  multi_monitor: number;
  devtools_flags: number;
  password_failures: number;
  bypassed_stages: number[];
  suspicious: boolean;
  suspicious_reasons: string[];
  last_active: string | null;
};

export type Round2TeamLiveRow = {
  team_key: string;
  team_name: string;
  access_token: string;
  case_study_pool: string | null;
  /** Highest stage any member reached (zip depth proxy). */
  max_stage_reached: number;
  avg_score: number;
  members: Round2MemberLiveRow[];
  suspicious_count: number;
  bypass_events: { user_id: string; name: string; stage_number: number; at: string }[];
  issues: string[];
};

export type Round2TopTeam = {
  rank: number;
  team_name: string;
  team_key: string;
  composite_score: number;
  stages_unlocked: number;
  total_score: number;
  suspicious_penalty: number;
  bypass_penalty: number;
  summary: string;
};

function normTeam(s: string): string {
  return s.trim().toLowerCase();
}

function telemetryForUser(records: StageTelemetry[], userId: string): StageTelemetry[] {
  return records.filter((r) => r.user_id === userId);
}

function memberSuspicious(stages: StageTelemetry[]): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  let tab = 0;
  let fs = 0;
  let mm = 0;
  let dev = 0;
  let pwd = 0;
  for (const s of stages) {
    tab += Number(s.tab_switches || 0);
    fs += Number(s.fullscreen_exits || 0);
    mm += Number(s.multi_monitor_detected || 0);
    dev += Number(s.devtools_timing_flags || 0);
    pwd += Number(s.password_failed_attempts || 0) + Number(s.excessive_password_guesses || 0);
    if (s.flagged_too_fast) reasons.push(`Stage ${s.stage_number}: speedrun flag`);
    if (s.flag_reason && !reasons.includes(s.flag_reason)) reasons.push(s.flag_reason);
  }
  if (tab > 2) reasons.push(`Tab switches: ${tab}`);
  if (fs > 1) reasons.push(`Fullscreen exits: ${fs}`);
  if (mm > 0) reasons.push('Multi-monitor signal');
  if (dev > 0) reasons.push('DevTools heuristic');
  if (pwd >= 3) reasons.push(`Password failures: ${pwd}`);
  return { suspicious: reasons.length > 0, reasons };
}

export function buildRound2TeamLiveRows(input: {
  finalTeams: FinalTeamRecord[];
  selectedTeamKeys: string[];
  poolAssignments: Record<string, string>;
  participants: User[];
  telemetry: StageTelemetry[];
  bypasses: StageBypassRecord[];
  maxStageNumber?: number;
}): Round2TeamLiveRow[] {
  const selected = new Set(input.selectedTeamKeys.map(String));
  const teams = input.finalTeams.filter((t) => selected.has(t.team_key));
  const bypassByUser = new Map<string, StageBypassRecord[]>();
  for (const b of input.bypasses) {
    const list = bypassByUser.get(b.user_id) || [];
    list.push(b);
    bypassByUser.set(b.user_id, list);
  }

  const rows: Round2TeamLiveRow[] = [];

  for (const team of teams) {
    const tName = team.team_name.trim();
    const membersUsers = input.participants.filter(
      (u) => normTeam(u.team_name || '') === normTeam(tName)
    );

    const members: Round2MemberLiveRow[] = membersUsers.map((u) => {
      const stages = telemetryForUser(input.telemetry, u.id);
      const { suspicious, reasons } = memberSuspicious(stages);
      const userBypasses = bypassByUser.get(u.id) || [];
      let tab = 0;
      let fs = 0;
      let mm = 0;
      let dev = 0;
      let pwd = 0;
      let last: string | null = u.updated_at || null;
      for (const s of stages) {
        tab += Number(s.tab_switches || 0);
        fs += Number(s.fullscreen_exits || 0);
        mm += Number(s.multi_monitor_detected || 0);
        dev += Number(s.devtools_timing_flags || 0);
        pwd += Number(s.password_failed_attempts || 0);
        if (s.updated_at && (!last || s.updated_at > last)) last = s.updated_at;
      }
      return {
        user_id: u.id,
        name: u.name,
        email: u.email,
        current_stage: Number(u.current_stage || 1),
        total_score: Number(u.total_score || 0),
        is_flagged: Boolean(u.is_flagged),
        is_disqualified: Boolean(u.is_disqualified),
        is_completed: Boolean(u.is_completed),
        tab_switches: tab,
        fullscreen_exits: fs,
        multi_monitor: mm,
        devtools_flags: dev,
        password_failures: pwd,
        bypassed_stages: userBypasses.map((b) => b.stage_number).sort((a, b) => a - b),
        suspicious: suspicious || u.is_flagged,
        suspicious_reasons: reasons,
        last_active: last,
      };
    });

    const maxStage = members.reduce((m, x) => Math.max(m, x.current_stage), 1);
    const avgScore =
      members.length > 0
        ? Number((members.reduce((s, x) => s + x.total_score, 0) / members.length).toFixed(1))
        : 0;

    const bypass_events = members.flatMap((m) =>
      m.bypassed_stages.map((stage_number) => ({
        user_id: m.user_id,
        name: m.name,
        stage_number,
        at:
          input.bypasses.find((b) => b.user_id === m.user_id && b.stage_number === stage_number)
            ?.bypassed_at || '',
      }))
    );

    const issues: string[] = [];
    if (members.length === 0) issues.push('No participant logins for this team yet');
    if (members.some((m) => m.is_disqualified)) issues.push('Member disqualified');
    if (members.some((m) => m.suspicious)) issues.push('Suspicious activity on one or more members');
    if (bypass_events.length > 0) issues.push(`${bypass_events.length} stage bypass(es)`);
    if (!input.poolAssignments[team.team_key]) issues.push('Case study pool not assigned');

    rows.push({
      team_key: team.team_key,
      team_name: tName,
      access_token: team.access_token,
      case_study_pool: input.poolAssignments[team.team_key] ?? null,
      max_stage_reached: maxStage,
      avg_score: avgScore,
      members,
      suspicious_count: members.filter((m) => m.suspicious).length,
      bypass_events,
      issues,
    });
  }

  rows.sort((a, b) => b.max_stage_reached - a.max_stage_reached || b.avg_score - a.avg_score);
  return rows;
}

export function pickRound2TopTeams(teams: Round2TeamLiveRow[], limit = 5): Round2TopTeam[] {
  const scored = teams.map((t) => {
    const stages_unlocked = t.max_stage_reached;
    const suspicious_penalty = t.suspicious_count * 15 + t.issues.filter((i) => i.includes('Suspicious')).length * 10;
    const bypass_penalty = t.bypass_events.length * 8;
    const composite_score = Number(
      (stages_unlocked * 120 + t.avg_score - suspicious_penalty - bypass_penalty).toFixed(1)
    );
    const summary = `${stages_unlocked} stage(s) deep · avg ${t.avg_score} pts · ${t.members.length} active member(s)`;
    return {
      team_name: t.team_name,
      team_key: t.team_key,
      composite_score,
      stages_unlocked,
      total_score: t.avg_score,
      suspicious_penalty,
      bypass_penalty,
      summary,
      rank: 0,
    };
  });

  scored.sort(
    (a, b) =>
      b.composite_score - a.composite_score ||
      b.stages_unlocked - a.stages_unlocked ||
      b.total_score - a.total_score
  );

  return scored.slice(0, limit).map((row, idx) => ({ ...row, rank: idx + 1 }));
}

export function filterUsersToRound2Teams(
  users: User[],
  finalTeams: FinalTeamRecord[],
  selectedTeamKeys: string[]
): User[] {
  const selected = new Set(selectedTeamKeys.map(String));
  const names = new Set(
    finalTeams.filter((t) => selected.has(t.team_key)).map((t) => normTeam(t.team_name))
  );
  return users.filter((u) => u.role === 'participant' && names.has(normTeam(u.team_name || '')));
}
