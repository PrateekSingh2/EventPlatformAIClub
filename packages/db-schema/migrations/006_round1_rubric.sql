-- ==============================================================================
-- MIGRATION 006: ROUND 1 HACKATHON EVALUATION RUBRIC & INDEPENDENT STANDINGS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS round1 (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_name TEXT NOT NULL,
    judge_name TEXT NOT NULL,
    theme TEXT NOT NULL,
    
    -- Mandatory Rubric Criterion Scores
    score_prompt_clarity NUMERIC NOT NULL DEFAULT 0 CHECK (score_prompt_clarity >= 0 AND score_prompt_clarity <= 20),
    score_functional_impl NUMERIC NOT NULL DEFAULT 0 CHECK (score_functional_impl >= 0 AND score_functional_impl <= 25),
    score_ui_ux NUMERIC NOT NULL DEFAULT 0 CHECK (score_ui_ux >= 0 AND score_ui_ux <= 15),
    score_problem_solving NUMERIC NOT NULL DEFAULT 0 CHECK (score_problem_solving >= 0 AND score_problem_solving <= 15),
    score_prompt_iteration NUMERIC NOT NULL DEFAULT 0 CHECK (score_prompt_iteration >= 0 AND score_prompt_iteration <= 10),
    score_creativity NUMERIC NOT NULL DEFAULT 0 CHECK (score_creativity >= 0 AND score_creativity <= 5),
    score_live_demo NUMERIC NOT NULL DEFAULT 0 CHECK (score_live_demo >= 0 AND score_live_demo <= 10),
    
    -- Calculated Automatically (Total 100 marks)
    total_score NUMERIC NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
    
    -- Optional Criteria Comments / Evidence
    comments_prompt_clarity TEXT DEFAULT '',
    comments_functional_impl TEXT DEFAULT '',
    comments_ui_ux TEXT DEFAULT '',
    comments_problem_solving TEXT DEFAULT '',
    comments_prompt_iteration TEXT DEFAULT '',
    comments_creativity TEXT DEFAULT '',
    comments_live_demo TEXT DEFAULT '',
    
    -- Optional General Judge Notes
    judge_notes TEXT DEFAULT '',
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for leaderboard fast sorting and search
CREATE INDEX IF NOT EXISTS idx_round1_total_score ON round1 (total_score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_round1_team_name ON round1 (team_name);

-- Row Level Security (RLS)
ALTER TABLE round1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow select round1" ON round1;
CREATE POLICY "Allow select round1" ON round1 FOR SELECT USING (true);

DROP POLICY IF EXISTS "Service role full access round1" ON round1;
CREATE POLICY "Service role full access round1" ON round1 FOR ALL 
    USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow insert round1" ON round1;
CREATE POLICY "Allow insert round1" ON round1 FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update round1" ON round1;
CREATE POLICY "Allow update round1" ON round1 FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow delete round1" ON round1;
CREATE POLICY "Allow delete round1" ON round1 FOR DELETE USING (true);

-- Enable Realtime
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'round1'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE round1;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
