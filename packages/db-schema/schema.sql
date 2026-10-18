CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('stages', 'stages', false, 104857600,
        ARRAY['application/zip', 'application/x-zip-compressed'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 104857600;

-- stages
CREATE TABLE IF NOT EXISTS stages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stage_number INT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    s3_key TEXT DEFAULT '',
    is_password_protected BOOLEAN NOT NULL DEFAULT false,
    zip_password TEXT DEFAULT '',
    allowed_copy_filename TEXT NOT NULL DEFAULT '',
    min_expected_seconds INT NOT NULL DEFAULT 60,
    points INT NOT NULL DEFAULT 100,
    quiz_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- contest_settings
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

-- users
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

-- stage_telemetry
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

-- announcements
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'info' CHECK (urgency IN ('info', 'warning', 'critical')),
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_total_score ON users (total_score DESC);
CREATE INDEX IF NOT EXISTS idx_stages_stage_number ON stages (stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_user_stage ON stage_telemetry (user_id, stage_number);
CREATE INDEX IF NOT EXISTS idx_telemetry_flagged ON stage_telemetry (flagged_too_fast);

-- RPC
CREATE OR REPLACE FUNCTION complete_stage_and_award_points(
    p_user_id UUID, p_stage_number INT, p_points INT, p_is_flagged BOOLEAN
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    UPDATE users
    SET total_score = total_score + p_points,
        current_stage = GREATEST(current_stage, p_stage_number + 1),
        is_flagged = is_flagged OR p_is_flagged,
        updated_at = NOW()
    WHERE id = p_user_id;

    UPDATE stage_telemetry
    SET completed_at = NOW(),
        duration_seconds = EXTRACT(EPOCH FROM (NOW() - started_at))::INT,
        updated_at = NOW()
    WHERE user_id = p_user_id AND stage_number = p_stage_number;
END;
$$;

-- RLS
ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE contest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read user leaderboard" ON users;
CREATE POLICY "Public read user leaderboard" ON users FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read stages manifest" ON stages;
CREATE POLICY "Public read stages manifest" ON stages FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read telemetry" ON stage_telemetry;
CREATE POLICY "Public read telemetry" ON stage_telemetry FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public insert telemetry" ON stage_telemetry;
CREATE POLICY "Public insert telemetry" ON stage_telemetry FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Public update telemetry" ON stage_telemetry;
CREATE POLICY "Public update telemetry" ON stage_telemetry FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Public read contest_settings" ON contest_settings;
CREATE POLICY "Public read contest_settings" ON contest_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read announcements" ON announcements;
CREATE POLICY "Public read announcements" ON announcements FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access stages" ON stages;
CREATE POLICY "Service role full access stages" ON stages FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access users" ON users;
CREATE POLICY "Service role full access users" ON users FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access telemetry" ON stage_telemetry;
CREATE POLICY "Service role full access telemetry" ON stage_telemetry FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access contest_settings" ON contest_settings;
CREATE POLICY "Service role full access contest_settings" ON contest_settings FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access announcements" ON announcements;
CREATE POLICY "Service role full access announcements" ON announcements FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Realtime
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['users', 'stage_telemetry', 'contest_settings', 'announcements']
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime' AND tablename = t
        ) THEN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        END IF;
    END LOOP;
END $$;

-- Make the API see the new tables right away
NOTIFY pgrst, 'reload schema';