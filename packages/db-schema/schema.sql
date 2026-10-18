-- ==============================================================================
-- EVENTPLATFORM AI CLUB - COMPLETE POSTGRESQL SCHEMA FOR SUPABASE
-- High-Concurrency Serverless Anti-Cheat Contest Platform (150-200 Participants)
-- Storage Engine: Supabase Storage (Private 'stages' bucket)
-- ==============================================================================

-- Enable UUID extension if not already present
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 0. SUPABASE STORAGE BUCKET: stages
-- Creates private bucket for stage archive ZIPs if not already created
-- ------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'stages',
    'stages',
    false,
    104857600, -- 100MB limit per stage ZIP
    ARRAY['application/zip', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 104857600;

-- ------------------------------------------------------------------------------
-- 1. TABLE: stages
-- Stores stage manifests, storage paths, anti-cheat limits, and zip passwords
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_number INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    s3_key TEXT DEFAULT '', -- Backwards compatibility alias
    is_password_protected BOOLEAN NOT NULL DEFAULT false,
    zip_password TEXT DEFAULT '',
    allowed_copy_filename TEXT NOT NULL DEFAULT '',
    min_expected_seconds INT NOT NULL DEFAULT 60,
    points INT NOT NULL DEFAULT 100,
    quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN stages.storage_path IS 'Path within Supabase Storage stages bucket (e.g., stage-1/dataset.zip)';
COMMENT ON COLUMN stages.allowed_copy_filename IS 'Exact basename of the file participants are authorized to copy to clipboard (e.g., ai_prompt.txt)';
COMMENT ON COLUMN stages.min_expected_seconds IS 'Threshold below which stage completion is silently flagged as flagged_too_fast';

-- ------------------------------------------------------------------------------
-- 1.5 TABLE: contest_settings
-- Stores contest lifecycle state machine and operational settings
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contest_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'LIVE', 'FROZEN', 'CONCLUDED')),
    title TEXT NOT NULL DEFAULT 'AI Club Contest',
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    freeze_time TIMESTAMPTZ,
    updated_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO contest_settings (id, status, title)
VALUES ('default', 'DRAFT', 'AI Club Contest')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. TABLE: users
-- Stores participants and admins with cryptographic access tokens
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'participant', 'disqualified')) DEFAULT 'participant',
    access_token TEXT UNIQUE NOT NULL,
    total_score INT NOT NULL DEFAULT 0,
    current_stage INT NOT NULL DEFAULT 1,
    is_flagged BOOLEAN NOT NULL DEFAULT false,
    is_disqualified BOOLEAN NOT NULL DEFAULT false,
    disqualified_at TIMESTAMPTZ,
    disqualification_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON COLUMN users.access_token IS 'Cryptographic magic-link token formatted as AX-XXXX-XXXX';
COMMENT ON COLUMN users.is_disqualified IS 'Set to true when an administrator executes a disqualification sanction';
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
    multi_monitor_detected INT NOT NULL DEFAULT 0,
    devtools_timing_flags INT NOT NULL DEFAULT 0,
    devtools_probe_latency_ms DOUBLE PRECISION,
    window_size_discrepancies INT NOT NULL DEFAULT 0,
    password_failed_attempts INT NOT NULL DEFAULT 0,
    password_cooldown_until TIMESTAMPTZ,
    excessive_password_guesses INT NOT NULL DEFAULT 0,
    flagged_too_fast BOOLEAN NOT NULL DEFAULT false,
    flag_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_stage UNIQUE (user_id, stage_number)
);

COMMENT ON COLUMN stage_telemetry.started_at IS 'Set on initial storage signed URL fetch with ON CONFLICT DO NOTHING to prevent reset on page refresh';

-- ------------------------------------------------------------------------------
-- 4. PERFORMANCE INDEXES
-- Optimized for 150-200 concurrent read/write queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_stages_stage_number ON stages (stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_stage ON stage_telemetry (user_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_flagged ON stage_telemetry (flagged_too_fast);

-- ------------------------------------------------------------------------------
-- 5. ATOMIC RPC FUNCTION: complete_stage_and_award_points
-- Prevents race conditions during stage transitions across concurrent users
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
    -- 1. Advance participant stage, add points, update flag status
    UPDATE users
    SET 
        total_score = total_score + p_points,
        current_stage = GREATEST(current_stage, p_stage_number + 1),
        is_flagged = is_flagged OR p_is_flagged,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Seal telemetry record with completion time and computed duration
    UPDATE stage_telemetry
    SET
        completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
        updated_at = NOW()
    WHERE user_id = p_user_id AND stage_number = p_stage_number;
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_telemetry ENABLE ROW LEVEL SECURITY;

-- Anonymous users (participants) can read leaderboard user summaries
CREATE POLICY "Public read user leaderboard"
    ON users
    FOR SELECT
    USING (true);

-- Anonymous users can read stage manifests
CREATE POLICY "Public read stages manifest"
    ON stages
    FOR SELECT
    USING (true);

-- Anonymous users can read/write their own stage telemetry
CREATE POLICY "Public read telemetry"
    ON stage_telemetry
    FOR SELECT
    USING (true);

CREATE POLICY "Public insert telemetry"
    ON stage_telemetry
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Public update telemetry"
    ON stage_telemetry
    FOR UPDATE
    USING (true);

-- ------------------------------------------------------------------------------
-- 3.5 TABLE: announcements
-- Broadcast announcements published by administrators to participants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'info' CHECK (urgency IN ('info', 'warning', 'critical')),
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Anonymous users (participants) can read leaderboard user summaries
CREATE POLICY "Public read user leaderboard"
    ON users
    FOR SELECT
    USING (true);

-- Anonymous users can read stage manifests
CREATE POLICY "Public read stages manifest"
    ON stages
    FOR SELECT
    USING (true);

-- Anonymous users can read/write their own stage telemetry
CREATE POLICY "Public read telemetry"
    ON stage_telemetry
    FOR SELECT
    USING (true);

CREATE POLICY "Public insert telemetry"
    ON stage_telemetry
    FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Public update telemetry"
    ON stage_telemetry
    FOR UPDATE
    USING (true);

-- Public read for contest lifecycle settings and announcements
CREATE POLICY "Public read contest_settings"
    ON contest_settings
    FOR SELECT
    USING (true);

CREATE POLICY "Public read announcements"
    ON announcements
    FOR SELECT
    USING (true);

-- Service role bypasses all RLS checks automatically for admin endpoints
CREATE POLICY "Service role full access stages"
    ON stages
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access users"
    ON users
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access telemetry"
    ON stage_telemetry
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access contest_settings"
    ON contest_settings
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access announcements"
    ON announcements
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

    -- Enable replication on contest_settings for live lifecycle state synchronization
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'contest_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE contest_settings;
    END IF;

    -- Enable replication on announcements for live admin announcements
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'announcements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
    END IF;
END $$;

