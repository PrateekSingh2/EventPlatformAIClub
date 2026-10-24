-- Migration 007: Support team-level unique ZIP archive distribution
-- Ensures that token_archives can track team_name so all members of the same team
-- share the same unique archive, while no two different teams share an archive.

ALTER TABLE IF EXISTS token_archives
ADD COLUMN IF NOT EXISTS team_name TEXT;

CREATE INDEX IF NOT EXISTS idx_token_archives_team ON token_archives (team_name);
