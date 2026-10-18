-- Persist failed stage-key attempts and enforce cooldowns atomically.
ALTER TABLE stage_telemetry
    ADD COLUMN IF NOT EXISTS password_failed_attempts INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS password_cooldown_until TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS excessive_password_guesses INT NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION register_stage_password_failure(
    p_user_id UUID,
    p_stage_number INT
)
RETURNS TABLE (
    failed_attempts INT,
    cooldown_until TIMESTAMPTZ,
    cooldown_seconds INT,
    excessive BOOLEAN,
    blocked BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_attempts INT;
    current_cooldown TIMESTAMPTZ;
    current_excessive INT;
    next_attempts INT;
    next_cooldown TIMESTAMPTZ;
    next_cooldown_seconds INT;
BEGIN
    INSERT INTO stage_telemetry (user_id, stage_number)
    VALUES (p_user_id, p_stage_number)
    ON CONFLICT (user_id, stage_number) DO NOTHING;

    SELECT COALESCE(st.password_failed_attempts, 0), st.password_cooldown_until,
           COALESCE(st.excessive_password_guesses, 0)
      INTO current_attempts, current_cooldown, current_excessive
      FROM stage_telemetry st
     WHERE st.user_id = p_user_id AND st.stage_number = p_stage_number
     FOR UPDATE;

    IF current_cooldown IS NOT NULL AND current_cooldown > NOW() THEN
        RETURN QUERY SELECT current_attempts, current_cooldown,
            CEIL(EXTRACT(EPOCH FROM (current_cooldown - NOW())))::INT,
            current_excessive > 0, TRUE;
        RETURN;
    END IF;

    next_attempts := current_attempts + 1;
    next_cooldown_seconds := CASE
        WHEN next_attempts >= 5 THEN 60
        WHEN next_attempts >= 3 THEN 15
        ELSE 0
    END;
    next_cooldown := CASE
        WHEN next_cooldown_seconds > 0 THEN NOW() + make_interval(secs => next_cooldown_seconds)
        ELSE NULL
    END;

    UPDATE stage_telemetry
       SET password_failed_attempts = next_attempts,
           password_cooldown_until = next_cooldown,
           excessive_password_guesses = CASE
               WHEN next_attempts = 5 THEN current_excessive + 1
               ELSE current_excessive
           END,
           flag_reason = CASE
               WHEN next_attempts = 5 THEN 'Anti-Cheat Alert: Excessive password guesses (5 incorrect attempts)'
               ELSE flag_reason
           END,
           updated_at = NOW()
     WHERE user_id = p_user_id AND stage_number = p_stage_number;

    RETURN QUERY SELECT next_attempts, next_cooldown, next_cooldown_seconds,
        (CASE WHEN next_attempts = 5 THEN current_excessive + 1 ELSE current_excessive END) > 0,
        FALSE;
END;
$$;

REVOKE ALL ON FUNCTION register_stage_password_failure(UUID, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION register_stage_password_failure(UUID, INT) TO service_role;
