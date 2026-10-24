-- ==============================================================================
-- Migration: 005_contest_completion_lock.sql
-- Enables permanent participant stats locking upon completing all contest stages
-- ==============================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN users.is_completed IS 'Set to true when participant conquers the terminal stage. Locks further modifications to their record.';
COMMENT ON COLUMN users.completed_at IS 'Timestamp of final stage recovery phrase submission / contest completion.';
