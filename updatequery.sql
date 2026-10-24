-- ==============================================================================
-- UPDATE QUERY SCRIPT (Safe migration for existing Supabase databases)
-- Run this script in the Supabase SQL Editor if your database tables already exist.
-- It safely adds missing columns, updates stored functions, and refreshes views.
-- ==============================================================================

-- 1. SAFELY ADD MISSING COLUMNS (Idempotent)
-- Users table updates
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_disqualified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS disqualify_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_score INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS current_stage INT NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_size TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_token_key;
CREATE INDEX IF NOT EXISTS idx_users_team_name ON users (team_name);

-- Stages table updates
ALTER TABLE stages ADD COLUMN IF NOT EXISTS min_expected_seconds INT NOT NULL DEFAULT 60;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS zip_password TEXT;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS allowed_copy_filename TEXT;
ALTER TABLE stages ADD COLUMN IF NOT EXISTS points INT NOT NULL DEFAULT 100;

-- Stage Telemetry table updates
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS duration_seconds INT;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS flagged_too_fast BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS flag_reason TEXT;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS password_failed_attempts INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS password_cooldown_until TIMESTAMPTZ;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS excessive_password_guesses INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS tab_switches INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS fullscreen_exits INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS multi_monitor_detected INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS devtools_timing_flags INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS devtools_probe_latency_ms DOUBLE PRECISION;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS window_size_discrepancies INT NOT NULL DEFAULT 0;
ALTER TABLE stage_telemetry ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- 2. UPDATE VIEW: leaderboard
-- Dynamic rank computation with tie-breaker by updated_at ASC
DROP VIEW IF EXISTS leaderboard CASCADE;
CREATE OR REPLACE VIEW leaderboard AS
SELECT 
    id AS user_id,
    name,
    email,
    team_name,
    team_size,
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

-- 3. DROP OLD FUNCTION SIGNATURES (Prevents parameter conflict errors)
DROP FUNCTION IF EXISTS complete_stage_and_award_points(UUID, INT, INT, BOOLEAN);
DROP FUNCTION IF EXISTS complete_stage_and_award_points(UUID, INT, INT, BOOLEAN, TIMESTAMPTZ, INT);

-- 4. ATOMIC RPC FUNCTION: complete_stage_and_award_points
-- Accurately sets user.updated_at and stage_telemetry.completed_at to the exact completion timestamp
CREATE OR REPLACE FUNCTION complete_stage_and_award_points(
    p_user_id UUID,
    p_stage_number INT,
    p_points INT,
    p_is_flagged BOOLEAN,
    p_completed_at TIMESTAMPTZ DEFAULT NULL,
    p_duration_seconds INT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_completed_at TIMESTAMPTZ := COALESCE(p_completed_at, NOW());
    v_duration INT := COALESCE(
        p_duration_seconds,
        GREATEST(1, EXTRACT(EPOCH FROM (v_completed_at - (SELECT started_at FROM stage_telemetry WHERE user_id = p_user_id AND stage_number = p_stage_number)))::INT),
        30
    );
BEGIN
    -- 1. Advance participant stage, add points, and set updated_at to exact completion timestamp (leaderboard tie-breaker)
    UPDATE users
    SET 
        total_score = total_score + p_points,
        current_stage = GREATEST(current_stage, p_stage_number + 1),
        is_flagged = is_flagged OR p_is_flagged,
        updated_at = v_completed_at
    WHERE id = p_user_id;

    -- 2. Seal telemetry record with exact completion time and computed duration
    UPDATE stage_telemetry
    SET
        completed_at = v_completed_at,
        duration_seconds = v_duration,
        updated_at = NOW()
    WHERE user_id = p_user_id AND stage_number = p_stage_number;
END;
$$;

-- 5. ATOMIC RPC FUNCTION: register_stage_password_failure
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
               WHEN next_attempts >= 5 THEN COALESCE(stage_telemetry.excessive_password_guesses, 0) + 1
               ELSE COALESCE(stage_telemetry.excessive_password_guesses, 0)
           END,
           updated_at = NOW()
     WHERE user_id = p_user_id AND stage_number = p_stage_number;

    RETURN QUERY SELECT next_attempts, next_cooldown, next_cooldown_seconds,
        (next_attempts >= 5), (next_cooldown_seconds > 0);
END;
$$;

-- 6. ATOMIC RPC FUNCTION: reset_stage_password_attempts
CREATE OR REPLACE FUNCTION reset_stage_password_attempts(
    p_user_id UUID,
    p_stage_number INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    UPDATE stage_telemetry
       SET password_failed_attempts = 0,
           password_cooldown_until = NULL,
           updated_at = NOW()
     WHERE user_id = p_user_id AND stage_number = p_stage_number;
END;
$$;

-- 7. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_stages_stage_number ON stages (stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_stage ON stage_telemetry (user_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_flagged ON stage_telemetry (flagged_too_fast);

-- 8. GRANT PRIVILEGES
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON public.leaderboard TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role, anon, authenticated;

-- Notify completion
DO $$
BEGIN
    RAISE NOTICE 'Update script executed successfully. Database schema and functions are up to date!';
END $$;


-- 9. PER-TOKEN ARCHIVE STORAGE & STAGE PASSWORDS (Challenge Stages Multi-ZIP System)
CREATE TABLE IF NOT EXISTS token_archives (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    access_token TEXT NOT NULL UNIQUE,
    storage_path TEXT NOT NULL,
    stage_count INT NOT NULL DEFAULT 1,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_archives_token ON token_archives (access_token);

CREATE TABLE IF NOT EXISTS stage_passwords (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_archive_id UUID NOT NULL REFERENCES token_archives(id) ON DELETE CASCADE,
    stage_number INT NOT NULL,
    password TEXT NOT NULL,
    UNIQUE (token_archive_id, stage_number)
);
CREATE INDEX IF NOT EXISTS idx_stage_passwords_archive ON stage_passwords (token_archive_id, stage_number);

GRANT ALL ON token_archives TO service_role;
GRANT ALL ON stage_passwords TO service_role;
GRANT SELECT ON token_archives TO anon, authenticated;
GRANT SELECT ON stage_passwords TO anon, authenticated;


-- ==============================================================================
-- 5. TABLE: round1 (Hackathon Evaluation Rubric & Independent Standings)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS round1 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    theme TEXT NOT NULL,
    
    score_prompt_clarity NUMERIC NOT NULL DEFAULT 0 CHECK (score_prompt_clarity >= 0 AND score_prompt_clarity <= 20),
    score_functional_impl NUMERIC NOT NULL DEFAULT 0 CHECK (score_functional_impl >= 0 AND score_functional_impl <= 25),
    score_ui_ux NUMERIC NOT NULL DEFAULT 0 CHECK (score_ui_ux >= 0 AND score_ui_ux <= 15),
    score_problem_solving NUMERIC NOT NULL DEFAULT 0 CHECK (score_problem_solving >= 0 AND score_problem_solving <= 15),
    score_prompt_iteration NUMERIC NOT NULL DEFAULT 0 CHECK (score_prompt_iteration >= 0 AND score_prompt_iteration <= 10),
    score_creativity NUMERIC NOT NULL DEFAULT 0 CHECK (score_creativity >= 0 AND score_creativity <= 5),
    score_live_demo NUMERIC NOT NULL DEFAULT 0 CHECK (score_live_demo >= 0 AND score_live_demo <= 10),
    
    total_score NUMERIC NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
    
    comments_prompt_clarity TEXT DEFAULT '',
    comments_functional_impl TEXT DEFAULT '',
    comments_ui_ux TEXT DEFAULT '',
    comments_problem_solving TEXT DEFAULT '',
    comments_prompt_iteration TEXT DEFAULT '',
    comments_creativity TEXT DEFAULT '',
    comments_live_demo TEXT DEFAULT '',
    
    judge_notes TEXT DEFAULT '',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_round1_total_score ON round1 (total_score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_round1_team_name ON round1 (team_name);

ALTER TABLE round1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select round1" ON round1;
CREATE POLICY "Allow select round1" ON round1 FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access round1" ON round1;
CREATE POLICY "Service role full access round1" ON round1 FOR ALL 
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow insert round1" ON round1;
CREATE POLICY "Allow insert round1" ON round1 FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update round1" ON round1;
CREATE POLICY "Allow update round1" ON round1 FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete round1" ON round1;
CREATE POLICY "Allow delete round1" ON round1 FOR DELETE USING (true);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'round1'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE round1;
    END IF;
END $$;

-- 6. UNIQUE TEAM ZIP DISTRIBUTION
ALTER TABLE IF EXISTS token_archives ADD COLUMN IF NOT EXISTS team_name TEXT;
CREATE INDEX IF NOT EXISTS idx_token_archives_team ON token_archives (team_name);

NOTIFY pgrst, 'reload schema';
