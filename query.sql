-- ==============================================================================
-- EVENTPLATFORM AI CLUB - COMPLETE POSTGRESQL SCHEMA FOR SUPABASE
-- High-Concurrency Serverless Anti-Cheat Contest Platform (150-200 Participants)
-- Unified Single-File Setup: Storage Bucket, Storage Policies, Tables, 
-- Leaderboard View, Performance Indexes, Atomic RPCs, RLS & Realtime Replication
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------------------------
-- 2. SUPABASE STORAGE ENGINE & BUCKET SETUP: 'stages'
-- Creates the private bucket for stage archive ZIPs (50MB limit)
-- Configures storage policies so browser can upload & download via signed URLs
-- ------------------------------------------------------------------------------
-- A. Create / update the private 'stages' bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'stages',
    'stages',
    false,
    52428800, -- 50MB limit per stage ZIP
    ARRAY['application/zip', 'application/x-zip-compressed']
)
ON CONFLICT (id) DO UPDATE SET
    public = false,
    file_size_limit = 52428800,
    allowed_mime_types = ARRAY['application/zip', 'application/x-zip-compressed'];

-- B. Enable Row Level Security on storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- C. Storage Policies for 'stages' bucket
DO $$
BEGIN
    -- 1. Service Role full access: Allows Next.js serverless routes to sign & manage objects
    DROP POLICY IF EXISTS "Service role full access to stages bucket" ON storage.objects;
    CREATE POLICY "Service role full access to stages bucket" ON storage.objects FOR ALL
        USING (bucket_id = 'stages' AND auth.role() = 'service_role')
        WITH CHECK (bucket_id = 'stages' AND auth.role() = 'service_role');

    -- 2. Allow pre-signed downloads: Enables participant browser to fetch archive blobs into memory
    DROP POLICY IF EXISTS "Allow signed downloads from stages bucket" ON storage.objects;
    CREATE POLICY "Allow signed downloads from stages bucket" ON storage.objects FOR SELECT
        USING (bucket_id = 'stages');

    -- 3. Allow pre-signed uploads: Enables admin browser to upload stage ZIPs directly to storage
    DROP POLICY IF EXISTS "Allow signed uploads to stages bucket" ON storage.objects;
    CREATE POLICY "Allow signed uploads to stages bucket" ON storage.objects FOR INSERT
        WITH CHECK (bucket_id = 'stages');

    -- 4. Allow pre-signed updates/upserts
    DROP POLICY IF EXISTS "Allow signed updates to stages bucket" ON storage.objects;
    CREATE POLICY "Allow signed updates to stages bucket" ON storage.objects FOR UPDATE
        USING (bucket_id = 'stages')
        WITH CHECK (bucket_id = 'stages');

    -- 5. Allow object deletes for admin cleanup
    DROP POLICY IF EXISTS "Allow deletes from stages bucket" ON storage.objects;
    CREATE POLICY "Allow deletes from stages bucket" ON storage.objects FOR DELETE
        USING (bucket_id = 'stages' AND auth.role() = 'service_role');
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 3. TABLE: stages
-- Stores challenge manifests, storage paths, encryption passwords & anti-cheat thresholds
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

COMMENT ON TABLE stages IS 'Contest challenge stages, encryption status, and archive storage keys';
COMMENT ON COLUMN stages.storage_path IS 'Path within Supabase Storage stages bucket (e.g., stage-1/dataset.zip)';
COMMENT ON COLUMN stages.allowed_copy_filename IS 'Exact basename of the file participants are authorized to copy to clipboard (e.g., ai_prompt.txt)';
COMMENT ON COLUMN stages.min_expected_seconds IS 'Threshold below which stage completion is silently flagged as flagged_too_fast';

-- ------------------------------------------------------------------------------
-- 4. TABLE: contest_settings
-- Authoritative single-row lifecycle state machine for the active contest
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

COMMENT ON TABLE contest_settings IS 'Global state machine: DRAFT, LIVE, FROZEN, CONCLUDED';

INSERT INTO contest_settings (id, status, title)
VALUES ('default', 'DRAFT', 'AI Club Contest')
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 5. TABLE: contests
-- Multi-contest registry managed via the Admin Contest Directory
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS contests (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'LIVE', 'FROZEN', 'CONCLUDED')),
    teams_count INT NOT NULL DEFAULT 1,
    tokens JSONB NOT NULL DEFAULT '[]'::jsonb,
    stages JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE contests IS 'Historical and active contests with generated cryptographic token batches';

-- ------------------------------------------------------------------------------
-- 6. TABLE: users
-- Stores participants and administrators with cryptographic access tokens
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

COMMENT ON TABLE users IS 'User profiles, authenticated access tokens, score progression, and disqualification state';
COMMENT ON COLUMN users.access_token IS 'Cryptographic magic-link token formatted as AX-XXXX-XXXX';
COMMENT ON COLUMN users.is_disqualified IS 'Set to true when an administrator executes a disqualification sanction';
COMMENT ON COLUMN users.is_flagged IS 'Flagged if participant exhibits suspicious speed-run or excessive anti-cheat violations';

-- ------------------------------------------------------------------------------
-- 6.5 VIEW: leaderboard
-- Real-time participant standings with dynamically computed rank
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    id AS user_id,
    name,
    email,
    total_score,
    current_stage,
    is_flagged,
    is_disqualified,
    DENSE_RANK() OVER (
        ORDER BY total_score DESC, updated_at ASC
    ) AS rank,
    updated_at
FROM users
WHERE role = 'participant'
ORDER BY total_score DESC, updated_at ASC;

COMMENT ON VIEW leaderboard IS 'Real-time computed standings view for live leaderboard drawers & widgets';

-- ------------------------------------------------------------------------------
-- 7. TABLE: stage_telemetry
-- Anti-Cheat Telemetry Radar: tracks tab switches, multi-display, and failed attempts
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

COMMENT ON TABLE stage_telemetry IS 'Live anti-cheat forensics for each participant per challenge stage';
COMMENT ON COLUMN stage_telemetry.started_at IS 'Set on initial storage signed URL fetch with ON CONFLICT DO NOTHING to prevent reset on page refresh';

-- ------------------------------------------------------------------------------
-- 8. TABLE: announcements
-- Broadcast announcements published by administrators to participants
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'info' CHECK (urgency IN ('info', 'warning', 'critical')),
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE announcements IS 'Real-time administrator broadcasts pushed to live arena side drawers';

-- ------------------------------------------------------------------------------
-- 9. PERFORMANCE INDEXES
-- Optimized for 150-200 concurrent read/write queries
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_stages_stage_number ON stages (stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_stage ON stage_telemetry (user_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_flagged ON stage_telemetry (flagged_too_fast);
CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contests_created_at ON contests (created_at DESC);

-- ------------------------------------------------------------------------------
-- 10. ATOMIC RPC FUNCTION: complete_stage_and_award_points
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
-- 11. ATOMIC RPC FUNCTION: register_stage_password_failure
-- Enforces progressive password attempt cooldowns to prevent brute-forcing
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION register_stage_password_failure(
    p_user_id UUID,
    p_stage_number INT
)
RETURNS TABLE (
    failed_attempts INT,
    cooldown_until TIMESTAMPTZ,
    cooldown_seconds INT,
    excessive BOOLEAN,
    blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_attempts INT;
    current_cooldown TIMESTAMPTZ;
    current_excessive INT;
    next_attempts INT;
    next_cooldown TIMESTAMPTZ;
    next_cooldown_seconds INT;
BEGIN
    INSERT INTO stage_telemetry (user_id, stage_number)
    VALUES (p_user_id, p_stage_number)
    ON CONFLICT (user_id, stage_number) DO NOTHING;

    SELECT COALESCE(st.password_failed_attempts, 0), st.password_cooldown_until,
           COALESCE(st.excessive_password_guesses, 0)
      INTO current_attempts, current_cooldown, current_excessive
      FROM stage_telemetry st
     WHERE st.user_id = p_user_id AND st.stage_number = p_stage_number
     FOR UPDATE;

    IF current_cooldown IS NOT NULL AND current_cooldown > NOW() THEN
        RETURN QUERY SELECT current_attempts, current_cooldown,
            CEIL(EXTRACT(EPOCH FROM (current_cooldown - NOW())))::INT,
            current_excessive > 0, TRUE;
        RETURN;
    END IF;

    next_attempts := current_attempts + 1;
    next_cooldown_seconds := CASE
        WHEN next_attempts >= 5 THEN 60
        WHEN next_attempts >= 3 THEN 15
        ELSE 0
    END;
    next_cooldown := CASE
        WHEN next_cooldown_seconds > 0 THEN NOW() + make_interval(secs => next_cooldown_seconds)
        ELSE NULL
    END;

    UPDATE stage_telemetry
       SET password_failed_attempts = next_attempts,
           password_cooldown_until = next_cooldown,
           excessive_password_guesses = CASE
               WHEN next_attempts = 5 THEN current_excessive + 1
               ELSE current_excessive
           END,
           flag_reason = CASE
               WHEN next_attempts = 5 THEN 'Anti-Cheat Alert: Excessive password guesses (5 incorrect attempts)'
               ELSE flag_reason
           END,
           updated_at = NOW()
     WHERE user_id = p_user_id AND stage_number = p_stage_number;

    RETURN QUERY SELECT next_attempts, next_cooldown, next_cooldown_seconds,
        (CASE WHEN next_attempts = 5 THEN current_excessive + 1 ELSE current_excessive END) > 0,
        FALSE;
END;
$$;

REVOKE ALL ON FUNCTION register_stage_password_failure(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_stage_password_failure(UUID, INT) TO service_role;

-- ------------------------------------------------------------------------------
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Clean existing policies to prevent conflicts on repeated execution
DROP POLICY IF EXISTS "Public read stages manifest" ON stages;
DROP POLICY IF EXISTS "Public read contest_settings" ON contest_settings;
DROP POLICY IF EXISTS "Public read contests" ON contests;
DROP POLICY IF EXISTS "Public read user leaderboard" ON users;
DROP POLICY IF EXISTS "Public read telemetry" ON stage_telemetry;
DROP POLICY IF EXISTS "Public insert telemetry" ON stage_telemetry;
DROP POLICY IF EXISTS "Public update telemetry" ON stage_telemetry;
DROP POLICY IF EXISTS "Public read announcements" ON announcements;

DROP POLICY IF EXISTS "Service role full access stages" ON stages;
DROP POLICY IF EXISTS "Service role full access contest_settings" ON contest_settings;
DROP POLICY IF EXISTS "Service role full access contests" ON contests;
DROP POLICY IF EXISTS "Service role full access users" ON users;
DROP POLICY IF EXISTS "Service role full access telemetry" ON stage_telemetry;
DROP POLICY IF EXISTS "Service role full access announcements" ON announcements;

-- Public read policies for active client arena views
CREATE POLICY "Public read stages manifest" ON stages FOR SELECT USING (true);
CREATE POLICY "Public read contest_settings" ON contest_settings FOR SELECT USING (true);
CREATE POLICY "Public read contests" ON contests FOR SELECT USING (true);
CREATE POLICY "Public read user leaderboard" ON users FOR SELECT USING (true);
CREATE POLICY "Public read telemetry" ON stage_telemetry FOR SELECT USING (true);
CREATE POLICY "Public insert telemetry" ON stage_telemetry FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update telemetry" ON stage_telemetry FOR UPDATE USING (true);
CREATE POLICY "Public read announcements" ON announcements FOR SELECT USING (true);

-- Service role bypasses all RLS checks for serverless API routes
CREATE POLICY "Service role full access stages" ON stages FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access contest_settings" ON contest_settings FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access contests" ON contests FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access users" ON users FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access telemetry" ON stage_telemetry FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role full access announcements" ON announcements FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ------------------------------------------------------------------------------
-- 13. SUPABASE REALTIME REPLICATION PUBLICATION
-- Broadcasts real-time events to 150-200 concurrent connected browser sockets
-- ------------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'users'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE users;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'stage_telemetry'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE stage_telemetry;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'contest_settings'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE contest_settings;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'announcements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'contests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE contests;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 14. SCHEMA RELOAD
-- Instructs PostgREST to immediately refresh its schema cache for all endpoints
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
