// ==============================================================================
// CORE DATA TYPES & INTERFACES - EVENTPLATFORM AI CLUB
// ==============================================================================

export type UserRole = 'admin' | 'participant' | 'disqualified';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  access_token: string;
  total_score: number;
  current_stage: number;
  is_flagged: boolean;
  is_disqualified?: boolean;
  disqualified_at?: string | null;
  disqualification_reason?: string | null;
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
  quiz_questions: QuizQuestion[];
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

export interface SheetData {
  sheetName: string;
  data: (string | number | boolean | null)[][];
  rowCount: number;
  columnCount: number;
}

export interface ParsedFile {
  name: string;
  path: string;
  type: FileType;
  size: number;
  content?: string; // For text / markdown
  sheets?: SheetData[]; // For spreadsheets
  isCopyAllowed: boolean;
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
  type: 'tab_switch' | 'fullscreen_exit';
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
  participants: Array<{
    name: string;
    email: string;
    token: string;
  }>;
}

export interface BrevoSendResponse {
  total: number;
  sent: number;
  failed: number;
  errors?: string[];
}
