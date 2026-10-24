-- Team registration public form (service-role API writes only)
CREATE TABLE IF NOT EXISTS team_registration_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    members JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT team_registration_submissions_team_name_key UNIQUE (team_name),
    CONSTRAINT team_registration_submissions_members_is_array CHECK (jsonb_typeof(members) = 'array')
);

COMMENT ON TABLE team_registration_submissions IS 'Public team registration form submissions (4 member slots in members JSONB)';

CREATE INDEX IF NOT EXISTS idx_team_registration_submissions_created_at
    ON team_registration_submissions (created_at DESC);

ALTER TABLE team_registration_submissions ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT policies for anon or authenticated: only service_role (API routes) can read/write.
