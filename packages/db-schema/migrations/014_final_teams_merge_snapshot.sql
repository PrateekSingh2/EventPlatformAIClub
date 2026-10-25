-- Persist Team Merger manual map so Final Teams sync stays deterministic (same merge every time).

ALTER TABLE final_teams_config
    ADD COLUMN IF NOT EXISTS merge_auto BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS merge_manual_map JSONB;

COMMENT ON COLUMN final_teams_config.merge_manual_map IS 'submission_id → leader submission_id JSON object from Team Merger; used when syncing to final_teams';
