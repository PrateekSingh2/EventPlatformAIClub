-- Performance indexes for 200–250 participant load (does not modify row data).
-- Safe to run alongside existing form / team_registration_submissions data.

CREATE INDEX IF NOT EXISTS idx_users_participant_leaderboard
  ON users (total_score DESC, total_time_seconds ASC NULLS LAST, updated_at ASC)
  WHERE role = 'participant';

CREATE INDEX IF NOT EXISTS idx_users_participant_email
  ON users (email)
  WHERE role = 'participant';

CREATE INDEX IF NOT EXISTS idx_token_archives_access_token
  ON token_archives (access_token);

CREATE INDEX IF NOT EXISTS idx_stage_telemetry_user_id
  ON stage_telemetry (user_id);
