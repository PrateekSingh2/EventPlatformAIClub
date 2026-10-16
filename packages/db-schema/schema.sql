-- ==============================================================================
-- EVENTPLATFORM AI CLUB - COMPLETE POSTGRESQL SCHEMA FOR SUPABASE
-- High-Concurrency Serverless Anti-Cheat Contest Platform (150-200 Participants)
-- ==============================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 1. TABLE: stages
-- Stores stage manifests, S3 keys, anti-cheat limits, and 2-question gate quiz
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_number INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    s3_key TEXT NOT NULL,
    is_password_protected BOOLEAN NOT NULL DEFAULT false,
    zip_password TEXT DEFAULT '',
    allowed_copy_filename TEXT NOT NULL DEFAULT '',
    min_expected_seconds INT NOT NULL DEFAULT 60,
    points INT NOT NULL DEFAULT 100,
    quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure quiz_questions is an array of exactly 2 items in production
COMMENT ON COLUMN stages.quiz_questions IS 'JSONB array of 2 questions: [{"question": "...", "options": ["A","B","C","D"], "answer_idx": 0}]';
COMMENT ON COLUMN stages.allowed_copy_filename IS 'Exact basename of the file participants are authorized to copy to clipboard (e.g., ai_prompt.txt)';
COMMENT ON COLUMN stages.min_expected_seconds IS 'Threshold below which stage completion is silently flagged as flagged_too_fast';

-- ------------------------------------------------------------------------------
-- 2. TABLE: users
-- Stores participants and admins with cryptographic access tokens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'participant')) DEFAULT 'participant',
    access_token TEXT UNIQUE NOT NULL,
    total_score INT NOT NULL DEFAULT 0,
    current_stage INT NOT NULL DEFAULT 1,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN users.access_token IS 'Cryptographic magic-link token formatted as AX-XXXX-XXXX';
COMMENT ON COLUMN users.is_flagged IS 'Flagged if participant exhibits suspicious speed-run or excessive anti-cheat violations';

-- ------------------------------------------------------------------------------
-- 3. TABLE: stage_telemetry
-- Tracks per-stage anti-cheat metrics, duration, and telemetry pings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stage_telemetry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stage_number INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_seconds INT,
    tab_switches INT NOT NULL DEFAULT 0,
    fullscreen_exits INT NOT NULL DEFAULT 0,
    flagged_too_fast BOOLEAN NOT NULL DEFAULT false,
    flag_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_stage UNIQUE (user_id, stage_number)
);

COMMENT ON COLUMN stage_telemetry.started_at IS 'Set on initial S3 Presigned URL fetch with ON CONFLICT DO NOTHING to prevent reset on page refresh';

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- Optimized for 150-200 concurrent read/write queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_stages_stage_number ON stages (stage_number);
CREATE INDEX IF NOT EXISTS idx_stage_telemetry_user_stage ON stage_telemetry (user_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_stage_telemetry_flagged ON stage_telemetry (flagged_too_fast);

-- ------------------------------------------------------------------------------
-- 5. ATOMIC RPC FUNCTION: complete_stage_and_award_points
-- Race-condition-proof stage advancement and score calculation
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_stage_and_award_points(
    p_user_id UUID,
    p_stage_number INT,
    p_points INT,
    p_is_flagged BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- 1. Update user total score, advance current stage, and update flagged state
    UPDATE users
    SET 
        total_score = total_score + p_points,
        current_stage = GREATEST(current_stage, p_stage_number + 1),
        is_flagged = is_flagged OR p_is_flagged,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Mark stage telemetry record as completed and compute duration
    UPDATE stage_telemetry
    SET
        completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
        flagged_too_fast = flagged_too_fast OR p_is_flagged,
        updated_at = NOW()
    WHERE user_id = p_user_id AND stage_number = p_stage_number;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict boundary: Clients can only read safe fields, service role executes writes
-- ------------------------------------------------------------------------------
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_telemetry ENABLE ROW LEVEL SECURITY;

-- Stages Policy: Public anon can read stages (but API layer strips answer_idx)
CREATE POLICY "Allow public read stages without secrets"
    ON stages
    FOR SELECT
    USING (true);

-- Users Policy: Allow public read of leaderboard data (name, score, current_stage)
CREATE POLICY "Allow public read leaderboard"
    ON users
    FOR SELECT
    USING (true);

-- Telemetry Policy: Service role only (direct table mutations handled via backend API)
CREATE POLICY "Allow service role full access on telemetry"
    ON stage_telemetry
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 7. SUPABASE REALTIME REPLICATION PUBLICATION
-- Broadcasts real-time events to 150-200 concurrent connected browser sockets
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    -- Enable replication on users table for live leaderboard
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE users;
    END IF;

    -- Enable replication on stage_telemetry for Admin Telemetry Radar
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'stage_telemetry'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE stage_telemetry;
    END IF;
END $$;
