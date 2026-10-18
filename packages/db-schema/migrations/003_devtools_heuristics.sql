-- Track client-side DevTools heuristics separately from tab-switch and display counts.
ALTER TABLE stage_telemetry
    ADD COLUMN IF NOT EXISTS devtools_timing_flags INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS devtools_probe_latency_ms DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS window_size_discrepancies INT NOT NULL DEFAULT 0;
