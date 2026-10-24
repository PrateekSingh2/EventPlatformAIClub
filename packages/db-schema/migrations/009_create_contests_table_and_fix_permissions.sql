-- ==============================================================================
-- 009_create_contests_table_and_fix_permissions.sql
-- 1. Creates the contests table in Supabase so contest creation persists to DB
-- 2. Configures RLS and permissions for seamless admin and client access
-- 3. Drops UNIQUE constraint on users.access_token so team members can share tokens
-- 4. Ensures ON DELETE CASCADE on stage_telemetry foreign key
-- ==============================================================================

-- 1. Create contests table if not already created
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

COMMENT ON TABLE contests IS 'Historical and active contests with generated cryptographic token batches and stage manifests';

-- Ensure all columns exist on contests
ALTER TABLE contests ADD COLUMN IF NOT EXISTS stages JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS tokens JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE contests ADD COLUMN IF NOT EXISTS teams_count INT NOT NULL DEFAULT 1;

-- 2. Ensure team columns exist on users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS team_size TEXT;

-- 3. Drop UNIQUE constraint on access_token so multiple teammates can share their team token
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_token_key;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_access_token_unique;

-- Create fast lookup indexes
CREATE INDEX IF NOT EXISTS idx_users_access_token ON users (access_token);
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 4. Performance indexes for contests
CREATE INDEX IF NOT EXISTS idx_contests_status ON contests (status);
CREATE INDEX IF NOT EXISTS idx_contests_created_at ON contests (created_at DESC);

-- 5. Row Level Security & Access Policies on contests
ALTER TABLE contests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to contests" ON contests;
CREATE POLICY "Allow service_role full access to contests"
ON contests FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read access to contests" ON contests;
CREATE POLICY "Allow public read access to contests"
ON contests FOR SELECT
TO anon, authenticated
USING (true);

-- 6. Permissions Grants
GRANT ALL ON contests TO service_role;
GRANT SELECT ON contests TO anon, authenticated;

-- 7. Ensure stage_telemetry foreign key to users has ON DELETE CASCADE
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'stage_telemetry_user_id_fkey'
    ) THEN
        ALTER TABLE stage_telemetry DROP CONSTRAINT stage_telemetry_user_id_fkey;
        ALTER TABLE stage_telemetry
        ADD CONSTRAINT stage_telemetry_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
    END IF;
END $$;
