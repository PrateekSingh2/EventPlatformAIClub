-- Official merged-team roster (source of truth when locked). Does not modify users or form submissions.

CREATE TABLE IF NOT EXISTS final_teams_config (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    locked BOOLEAN NOT NULL DEFAULT false,
    locked_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO final_teams_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS final_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_key TEXT NOT NULL UNIQUE,
    team_name TEXT NOT NULL,
    team_size TEXT NOT NULL DEFAULT 'Solo',
    access_token TEXT NOT NULL,
    members JSONB NOT NULL DEFAULT '[]'::jsonb,
    source_team_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    submission_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    seminar_hall TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_final_teams_team_name ON final_teams (team_name);
CREATE INDEX IF NOT EXISTS idx_final_teams_sort ON final_teams (sort_order, team_name);

ALTER TABLE final_teams_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE final_teams ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access final_teams_config" ON final_teams_config;
CREATE POLICY "Service role full access final_teams_config" ON final_teams_config FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access final_teams" ON final_teams;
CREATE POLICY "Service role full access final_teams" ON final_teams FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE final_teams IS 'Locked roster: merged squads, shared team token, member JSON — canonical for exports and email when locked';
