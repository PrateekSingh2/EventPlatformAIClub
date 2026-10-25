-- Authoritative seminar hall seating (synced from admin export / PDF baseline).
-- Does not modify team_registration_submissions.

CREATE TABLE IF NOT EXISTS seminar_hall_assignments (
    assignment_key TEXT PRIMARY KEY,
    seminar_hall TEXT NOT NULL,
    merged_team_name TEXT NOT NULL,
    source_team_names JSONB NOT NULL DEFAULT '[]'::jsonb,
    submission_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_seminar_hall_assignments_hall
    ON seminar_hall_assignments (seminar_hall);

COMMENT ON TABLE seminar_hall_assignments IS
    'Frozen seminar hall seating per merged squad; assignment_key = sorted source team names.';

ALTER TABLE seminar_hall_assignments ENABLE ROW LEVEL SECURITY;
