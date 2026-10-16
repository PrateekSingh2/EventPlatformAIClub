-- ==============================================================================
-- MIGRATION 001: Developer 3 Tournament Operations
-- Adds contest_settings, announcements, and participant disqualification support
-- ==============================================================================

-- 1. Support 'disqualified' role and disqualification metadata on users table
DO $$
BEGIN
    -- Update role CHECK constraint if it exists
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check 
        CHECK (role IN ('admin', 'participant', 'disqualified'));

    -- Add explicit disqualification columns if not present
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'is_disqualified'
    ) THEN
        ALTER TABLE users ADD COLUMN is_disqualified BOOLEAN NOT NULL DEFAULT false;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'disqualified_at'
    ) THEN
        ALTER TABLE users ADD COLUMN disqualified_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'disqualification_reason'
    ) THEN
        ALTER TABLE users ADD COLUMN disqualification_reason TEXT;
    END IF;
END $$;

-- 2. Contest Settings table (authoritative single-row lifecycle state)
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

-- Seed default DRAFT row if empty
INSERT INTO contest_settings (id, status, title)
VALUES ('default', 'DRAFT', 'AI Club Contest')
ON CONFLICT (id) DO NOTHING;

-- 3. Announcements table (real-time admin broadcasts with history)
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message TEXT NOT NULL,
    urgency TEXT NOT NULL DEFAULT 'info' CHECK (urgency IN ('info', 'warning', 'critical')),
    created_by TEXT DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE contest_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    -- Public read policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contest_settings' AND policyname = 'Public read contest_settings') THEN
        CREATE POLICY "Public read contest_settings" ON contest_settings FOR SELECT USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'Public read announcements') THEN
        CREATE POLICY "Public read announcements" ON announcements FOR SELECT USING (true);
    END IF;

    -- Service role full access policies
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contest_settings' AND policyname = 'Service role full access contest_settings') THEN
        CREATE POLICY "Service role full access contest_settings" ON contest_settings FOR ALL
            USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcements' AND policyname = 'Service role full access announcements') THEN
        CREATE POLICY "Service role full access announcements" ON announcements FOR ALL
            USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
    END IF;
END $$;

-- 5. Realtime publication additions
DO $$
BEGIN
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
END $$;
