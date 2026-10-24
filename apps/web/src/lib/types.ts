// ==============================================================================
// CORE DATA TYPES & INTERFACES - EVENTPLATFORM AI CLUB
// ==============================================================================

export type UserRole = 'admin' | 'participant' | 'disqualified';

export interface User {
  id: string;
  email: string;
  name: string;
  team_name?: string | null;
  team_size?: string | null;
  role: UserRole;
  access_token: string;
  total_score: number;
  current_stage: number;
  is_flagged: boolean;
  is_disqualified?: boolean;
  disqualified_at?: string | null;
  disqualification_reason?: string | null;
  is_completed?: boolean;
  completed_at?: string | null;
  contest_started_at?: string | null;
  stage_timestamps?: Record<string, string> | null;
  stage_durations?: Record<string, number> | null;
  total_time_seconds?: number | null;
  last_stage_completed_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------------------------
// Contest Lifecycle & Tournament Control Types
// ------------------------------------------------------------------------------
export type ContestStatus = 'DRAFT' | 'LIVE' | 'FROZEN' | 'CONCLUDED';

export interface ContestSettings {
  id: string;
  status: ContestStatus;
  title: string;
  start_time: string | null;
  end_time: string | null;
  freeze_time: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type AnnouncementUrgency = 'info' | 'warning' | 'critical';

export interface Announcement {
  id: string;
  message: string;
  urgency: AnnouncementUrgency;
  created_by: string;
  created_at: string;
}

export interface PreflightValidationResult {
  valid: boolean;
  isEncrypted: boolean;
  fileCount: number;
  filenames: string[];
  message: string;
  error?: string;
}

export interface Contest {
  id: string;
  title: string;
  status: ContestStatus;
  teams_count: number;
  tokens: string[];
  stages?: Stage[];
  created_at: string;
  updated_at: string;
  start_time?: string | null;
  end_time?: string | null;
  freeze_time?: string | null;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  answer_idx: number;
}

export interface SanitizedQuizQuestion {
  question: string;
  options: string[];
}

export interface Stage {
  id: string;
  stage_number: number;
  title: string;
  storage_path: string;
  s3_key?: string; // Backwards compatibility alias
  is_password_protected: boolean;
  zip_password?: string;
  allowed_copy_filename: string;
  min_expected_seconds: number;
  points: number;
  quiz_questions?: QuizQuestion[];
  created_at: string;
  updated_at: string;
}

export interface StageManifest {
  stageNumber: number;
  title: string;
  isPasswordProtected: boolean;
  allowedCopyFilename: string;
  points: number;
  downloadUrl?: string;
  quizQuestions?: SanitizedQuizQuestion[];
  hasNextStage?: boolean;
  isLastStage?: boolean;
}

export interface StageTelemetry {
  id: string;
  user_id: string;
  stage_number: number;
  started_at: string;
  completed_at: string | null;
  duration_seconds: number | null;
  tab_switches: number;
  fullscreen_exits: number;
  multi_monitor_detected?: number;
  devtools_timing_flags?: number;
  devtools_probe_latency_ms?: number | null;
  window_size_discrepancies?: number;
  password_failed_attempts?: number;
  password_cooldown_until?: string | null;
  excessive_password_guesses?: number;
  flagged_too_fast: boolean;
  flag_reason: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields for telemetry radar
  user?: {
    name: string;
    email: string;
    role?: UserRole;
    total_score: number;
    current_stage: number;
    is_flagged: boolean;
    is_disqualified?: boolean;
  };
}

// ------------------------------------------------------------------------------
// In-Memory Parsed File Tree
// ------------------------------------------------------------------------------
export type FileType = 'text' | 'markdown' | 'spreadsheet' | 'binary';

export interface UserTelemetrySummary {
  user_id: string;
  name: string;
  email: string;
  role?: UserRole;
  total_score: number;
  current_stage: number;
  is_completed?: boolean;
  is_flagged: boolean;
  is_disqualified: boolean;
  total_tab_switches: number;
  total_fullscreen_exits: number;
  total_multi_monitor: number;
  total_devtools_timing: number;
  total_window_discrepancies: number;
  total_password_failed_attempts: number;
  total_excessive_guesses: number;
  flagged_speedruns: number;
  flag_reasons: string[];
  last_active: string;
  stages: StageTelemetry[];
}

export interface SheetData {
  sheetName: string;
  data: (string | number | boolean | null)[][];
  rowCount: number;
  columnCount: number;
}

export interface ExtractedStageResult {
  files: ParsedFile[];
  hasNextZip: boolean;
  nextZipBlob?: Blob;
  nextZipFilename?: string;
  stageTitle?: string;
}

export interface ParsedFile {
  name: string;
  path: string;
  type: FileType;
  size: number;
  content?: string; // For text / markdown
  sheets?: SheetData[]; // For spreadsheets
  isCopyAllowed: boolean;
  stageNumber?: number;
  relativePath?: string;
  folder?: string;
}

// ------------------------------------------------------------------------------
// API Request / Response Payloads
// ------------------------------------------------------------------------------
export interface AuthVerifyRequest {
  token?: string;
  adminSecret?: string;
}

export interface AuthVerifyResponse {
  authenticated: boolean;
  role?: UserRole;
  user?: Partial<User>;
  error?: string;
}

export interface AccessZipRequest {
  accessToken: string;
  stageNumber: number;
}

export interface AccessZipResponse {
  downloadUrl: string;
  allowedCopyFilename: string;
  isPasswordProtected: boolean;
  quizQuestions: SanitizedQuizQuestion[];
  stageNumber: number;
  title: string;
  points: number;
}

export interface TelemetryPingRequest {
  accessToken: string;
  stageNumber: number;
  type:
    | 'tab_switch'
    | 'fullscreen_exit'
    | 'multi_monitor_detected'
    | 'devtools_timing'
    | 'window_size_discrepancy';
  latencyMs?: number;
}

export interface StageSubmitRequest {
  accessToken: string;
  stageNumber: number;
  answers?: number[]; // Array of selected option indexes (length: 2)
  nextStagePassword?: string; // Guess/decryption password for next stage archive
}

export interface StageSubmitResponse {
  success: boolean;
  scoreAwarded?: number;
  nextStage?: number;
  allCorrect?: boolean;
  unlocked?: boolean;
  message?: string;
  error?: string;
}

export interface AdminUploadRequest {
  stageNumber: number;
  filename: string;
  adminSecret: string;
}

export interface AdminUploadResponse {
  uploadUrl: string;
  storagePath: string;
  s3Key?: string; // Backwards compatibility alias
  token?: string;
  expiresIn: number;
}

export interface BrevoSendRequest {
  adminSecret: string;
  subject: string;
  htmlTemplate: string;
  apiKey?: string;
  senderEmail?: string;
  senderName?: string;
  deliveryEngine?: 'api' | 'smtp' | 'auto';
  participants: Array<{
    name: string;
    email: string;
    token: string;
    team_name?: string;
    team_size?: string;
  }>;
}

export interface BrevoSendResponse {
  engine?: string;
  total: number;
  sent: number;
  failed: number;
  errors?: string[];
}


// ------------------------------------------------------------------------------
// Round 1 Rubric Evaluation & Independent Standings
// ------------------------------------------------------------------------------
export interface Round1RubricEvaluation {
  id: string;
  team_name: string;
  judge_name: string;
  theme: string;

  // Criterion Scores (Mandatory)
  score_prompt_clarity: number; // Max 20
  score_functional_impl: number; // Max 25
  score_ui_ux: number; // Max 15
  score_problem_solving: number; // Max 15
  score_prompt_iteration: number; // Max 10
  score_creativity: number; // Max 5
  score_live_demo: number; // Max 10

  // Total Score (Calculated automatically, Max 100)
  total_score: number;

  // Criterion Review Fields (Optional comments / evidence)
  comments_prompt_clarity?: string;
  comments_functional_impl?: string;
  comments_ui_ux?: string;
  comments_problem_solving?: string;
  comments_prompt_iteration?: string;
  comments_creativity?: string;
  comments_live_demo?: string;

  // General Judge Notes (Optional)
  judge_notes?: string;

  created_at: string;
  updated_at?: string;
}

export interface Round1LeaderboardEntry {
  rank: number;
  team_name: string;
  theme: string;
  total_score: number;
  judge_name: string;
  evaluations_count: number;
  latest_evaluated_at: string;
  evaluations: Round1RubricEvaluation[];
}
