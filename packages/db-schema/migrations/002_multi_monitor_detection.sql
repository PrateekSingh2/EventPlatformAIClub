-- ==============================================================================
-- MIGRATION 002: Developer 2 Dual-Monitor & Multi-Display Telemetry
-- Adds multi_monitor_detected metric to stage_telemetry table
-- ==============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'stage_telemetry' AND column_name = 'multi_monitor_detected'
    ) THEN
        ALTER TABLE stage_telemetry ADD COLUMN multi_monitor_detected INT NOT NULL DEFAULT 0;
    END IF;
END $$;
