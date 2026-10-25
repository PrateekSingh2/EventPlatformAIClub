-- Stage bypass (participant skipped warnings; no points for that stage unlock).

CREATE TABLE IF NOT EXISTS stage_bypasses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    stage_number INT NOT NULL CHECK (stage_number >= 1),
    team_name TEXT,
    bypassed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    points_awarded INT NOT NULL DEFAULT 0,
    UNIQUE (user_id, stage_number)
);

CREATE INDEX IF NOT EXISTS idx_stage_bypasses_team ON stage_bypasses (team_name);
CREATE INDEX IF NOT EXISTS idx_stage_bypasses_stage ON stage_bypasses (stage_number);

ALTER TABLE stage_bypasses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access stage_bypasses" ON stage_bypasses;
CREATE POLICY "Service role full access stage_bypasses" ON stage_bypasses FOR ALL
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE stage_bypasses IS 'Participant bypass-this-stage flow; unlock password revealed with zero points.';
