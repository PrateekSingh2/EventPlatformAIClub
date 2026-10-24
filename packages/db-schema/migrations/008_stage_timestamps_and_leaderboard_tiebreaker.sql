-- ==============================================================================
-- 008_stage_timestamps_and_leaderboard_tiebreaker.sql
-- Adds stage-by-stage unlock timestamps, durations, and advanced tie-breaking:
-- 1. Score DESC (Primary)
-- 2. Minimum total time taken to reach the latest completed stage ASC (First tie-breaker)
-- 3. Stage-wise time comparison ASC (Stage 1 time, then Stage 2 time, etc.)
-- ==============================================================================

-- 1. Add stage tracking and tie-breaker columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS contest_started_at TIMESTAMPTZ DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS stage_timestamps JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS stage_durations JSONB NOT NULL DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS total_time_seconds INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_stage_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN users.contest_started_at IS 'Timestamp when the contestant officially started the contest / entered arena';
COMMENT ON COLUMN users.stage_timestamps IS 'JSON dictionary mapping stage number to exact unlock timestamp: {"1": "ISO_TIMESTAMP", "2": "ISO_TIMESTAMP"}';
COMMENT ON COLUMN users.stage_durations IS 'JSON dictionary mapping stage number to duration in seconds: {"1": 120, "2": 240}';
COMMENT ON COLUMN users.total_time_seconds IS 'Cumulative seconds taken across all completed stages to reach the current stage';
COMMENT ON COLUMN users.last_stage_completed_at IS 'Exact timestamp of the most recently cleared stage';

-- 2. Ensure stage_telemetry has all necessary columns
ALTER TABLE stage_telemetry
ADD COLUMN IF NOT EXISTS completed_timestamp BIGINT,
ADD COLUMN IF NOT EXISTS score_awarded INT DEFAULT 100;

-- 3. Create performance indexes for the new sorting criteria
CREATE INDEX IF NOT EXISTS idx_users_score_time ON users (total_score DESC, total_time_seconds ASC, updated_at ASC);
CREATE INDEX IF NOT EXISTS idx_users_contest_started_at ON users (contest_started_at);

-- 4. Backfill existing participants from stage_telemetry if present
DO $$
DECLARE
    r RECORD;
    t_record RECORD;
    t_timestamps JSONB;
    t_durations JSONB;
    t_total INT;
    t_last TIMESTAMPTZ;
BEGIN
    FOR r IN SELECT id, created_at FROM users WHERE role = 'participant' LOOP
        t_timestamps := '{}'::jsonb;
        t_durations := '{}'::jsonb;
        t_total := 0;
        t_last := NULL;

        FOR t_record IN 
            SELECT stage_number, completed_at, duration_seconds 
            FROM stage_telemetry 
            WHERE user_id = r.id AND completed_at IS NOT NULL 
            ORDER BY stage_number ASC 
        LOOP
            t_timestamps := jsonb_set(t_timestamps, ARRAY[t_record.stage_number::text], to_jsonb(t_record.completed_at::text));
            t_durations := jsonb_set(t_durations, ARRAY[t_record.stage_number::text], to_jsonb(COALESCE(t_record.duration_seconds, 30)));
            t_total := t_total + COALESCE(t_record.duration_seconds, 30);
            t_last := t_record.completed_at;
        END LOOP;

        UPDATE users 
        SET 
            contest_started_at = COALESCE(contest_started_at, r.created_at, NOW()),
            stage_timestamps = t_timestamps,
            stage_durations = t_durations,
            total_time_seconds = t_total,
            last_stage_completed_at = t_last
        WHERE id = r.id AND (stage_timestamps = '{}'::jsonb OR stage_timestamps IS NULL);
    END LOOP;
END $$;

-- 5. Drop existing view first so columns can be restructured/reordered
DROP VIEW IF EXISTS leaderboard CASCADE;

CREATE VIEW leaderboard AS
SELECT 
    id AS user_id,
    name,
    email,
    team_name,
    team_size,
    access_token,
    total_score,
    current_stage,
    contest_started_at,
    stage_timestamps,
    stage_durations,
    total_time_seconds,
    last_stage_completed_at,
    is_flagged,
    is_disqualified,
    is_completed,
    DENSE_RANK() OVER (
        ORDER BY 
            total_score DESC,
            total_time_seconds ASC,
            (stage_durations->>'1')::int ASC NULLS LAST,
            (stage_durations->>'2')::int ASC NULLS LAST,
            (stage_durations->>'3')::int ASC NULLS LAST,
            (stage_durations->>'4')::int ASC NULLS LAST,
            (stage_durations->>'5')::int ASC NULLS LAST,
            updated_at ASC
    ) AS rank,
    updated_at,
    created_at
FROM users
WHERE role = 'participant'
ORDER BY 
    total_score DESC,
    total_time_seconds ASC,
    (stage_durations->>'1')::int ASC NULLS LAST,
    (stage_durations->>'2')::int ASC NULLS LAST,
    (stage_durations->>'3')::int ASC NULLS LAST,
    (stage_durations->>'4')::int ASC NULLS LAST,
    (stage_durations->>'5')::int ASC NULLS LAST,
    updated_at ASC;

COMMENT ON VIEW leaderboard IS 'Real-time standings view with multi-tier tie-breakers (Score > Total Time > Stage 1 Duration > Stage 2 Duration)';

GRANT SELECT ON leaderboard TO anon, authenticated, service_role;

-- 6. Update complete_stage_and_award_points RPC function
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
    v_duration INT := COALESCE(p_duration_seconds, 30);
    v_curr_timestamps JSONB;
    v_curr_durations JSONB;
    v_new_timestamps JSONB;
    v_new_durations JSONB;
    v_new_total_time INT := 0;
    v_key TEXT;
BEGIN
    -- 1. Fetch current stage telemetry & durations from users
    SELECT 
        COALESCE(stage_timestamps, '{}'::jsonb),
        COALESCE(stage_durations, '{}'::jsonb),
        COALESCE(total_time_seconds, 0)
    INTO v_curr_timestamps, v_curr_durations, v_new_total_time
    FROM users
    WHERE id = p_user_id;

    -- 2. Update maps with newly completed stage
    v_new_timestamps := jsonb_set(v_curr_timestamps, ARRAY[p_stage_number::text], to_jsonb(v_completed_at::text));
    v_new_durations := jsonb_set(v_curr_durations, ARRAY[p_stage_number::text], to_jsonb(v_duration));

    -- 3. Calculate total cumulative time across all completed stages
    v_new_total_time := 0;
    FOR v_key IN SELECT jsonb_object_keys(v_new_durations) LOOP
        v_new_total_time := v_new_total_time + (v_new_durations->>v_key)::int;
    END LOOP;

    -- 4. Update participant record
    UPDATE users
    SET 
        total_score = total_score + p_points,
        current_stage = GREATEST(current_stage, p_stage_number + 1),
        is_flagged = is_flagged OR p_is_flagged,
        stage_timestamps = v_new_timestamps,
        stage_durations = v_new_durations,
        total_time_seconds = v_new_total_time,
        last_stage_completed_at = v_completed_at,
        updated_at = v_completed_at
    WHERE id = p_user_id;

    -- 5. Seal telemetry record
    INSERT INTO stage_telemetry (user_id, stage_number, completed_at, duration_seconds, updated_at)
    VALUES (p_user_id, p_stage_number, v_completed_at, v_duration, NOW())
    ON CONFLICT (user_id, stage_number) DO UPDATE SET
        completed_at = v_completed_at,
        duration_seconds = v_duration,
        updated_at = NOW();
END;
$$;

GRANT EXECUTE ON FUNCTION complete_stage_and_award_points(UUID, INT, INT, BOOLEAN, TIMESTAMPTZ, INT) TO service_role;
