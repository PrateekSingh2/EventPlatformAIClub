-- Editable Round 2 draft roster (PDF shortlist preview before token generation).

ALTER TABLE round2_selection
    ADD COLUMN IF NOT EXISTS draft_roster JSONB,
    ADD COLUMN IF NOT EXISTS workflow_phase TEXT NOT NULL DEFAULT 'edit';

COMMENT ON COLUMN round2_selection.draft_roster IS 'Editable Round 2 teams/members JSON; when set, admin UI uses this instead of full final_teams picker.';
COMMENT ON COLUMN round2_selection.workflow_phase IS 'edit | tokens_ready | ops';
