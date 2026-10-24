ALTER TABLE team_registration_submissions
ADD COLUMN IF NOT EXISTS squad_merge_opt_in BOOLEAN;

COMMENT ON COLUMN team_registration_submissions.squad_merge_opt_in IS
  'True = user wants a 4th assigned member (eligible for merger). False = exclude from auto/manual merge. NULL = not a 3-member squad prompt case.';
