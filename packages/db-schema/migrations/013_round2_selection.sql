-- Round 2 team selection (subset of locked final_teams) and optional case-study pool mapping.

CREATE TABLE IF NOT EXISTS round2_selection (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    selected_team_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
    pool_assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO round2_selection (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE round2_selection ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access round2_selection" ON round2_selection;
CREATE POLICY "Service role full access round2_selection" ON round2_selection FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE round2_selection IS 'Admin-selected final teams for Round 2; pool_assignments maps team_key → case-study pool folder name';
