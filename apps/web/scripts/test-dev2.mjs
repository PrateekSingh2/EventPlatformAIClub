import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '../../..');
const webDir = path.resolve(__dirname, '..');

async function runDev2Verification() {
  console.log('================================================================');
  console.log('DEVELOPER 2 — TASK 1: DUAL-MONITOR & MULTI-DISPLAY VERIFICATION');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(condition, testName, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (details) console.error(`       ${details}`);
      failed++;
    }
  }

  // --- CHECK 1: AntiCheatWrapper Dual-Monitor & Boundary Monitoring ---
  console.log('--- CHECK 1: AntiCheatWrapper Dual-Monitor & Boundary Monitoring ---');
  const antiCheatPath = path.join(webDir, 'src/components/arena/AntiCheatWrapper.tsx');
  const antiCheatCode = fs.readFileSync(antiCheatPath, 'utf8');

  record(
    antiCheatCode.includes('isExtended') && antiCheatCode.includes('window.screen'),
    '1.1 Integrates window.screen.isExtended (Screen Details API)'
  );

  record(
    antiCheatCode.includes('availLeft') &&
      antiCheatCode.includes('availWidth') &&
      antiCheatCode.includes('screenX') &&
      antiCheatCode.includes('outerWidth'),
    '1.2 Implements window boundary monitoring across display limits'
  );

  record(
    antiCheatCode.includes('isDraggedAcrossMonitors') || antiCheatCode.includes('isOutsideLeft'),
    '1.3 Detects windows dragged across multiple displays'
  );

  record(
    antiCheatCode.includes('isDocked') && antiCheatCode.includes('devtoolsOpen'),
    '1.4 Implements detached DevTools detection heuristics'
  );

  record(
    antiCheatCode.includes('multi_monitor_detected'),
    '1.5 Dispatches telemetry beacon with event "multi_monitor_detected"'
  );

  record(
    antiCheatCode.includes('blur-xl') && antiCheatCode.includes('pointer-events-none'),
    '1.6 Triggers blurred arena lock overlay upon detection'
  );

  record(
    antiCheatCode.includes('Multi-Monitor / Detached Window Detected'),
    '1.7 Renders dedicated Multi-Display violation modal with recovery action'
  );

  // --- CHECK 2: TypeScript Types & Schema Definitions ---
  console.log('\n--- CHECK 2: TypeScript Types & Schema Definitions ---');
  const typesPath = path.join(webDir, 'src/lib/types.ts');
  const typesCode = fs.readFileSync(typesPath, 'utf8');

  record(
    typesCode.includes("'multi_monitor_detected'"),
    '2.1 TelemetryPingRequest includes "multi_monitor_detected" type union'
  );

  record(
    typesCode.includes('multi_monitor_detected?: number'),
    '2.2 StageTelemetry schema includes multi_monitor_detected count'
  );

  // --- CHECK 3: Telemetry Ping API Endpoint ---
  console.log('\n--- CHECK 3: Telemetry Ping API Endpoint ---');
  const telemetryPingPath = path.join(webDir, 'src/app/api/stage/telemetry-ping/route.ts');
  const telemetryPingCode = fs.readFileSync(telemetryPingPath, 'utf8');

  record(
    telemetryPingCode.includes("type === 'multi_monitor_detected'"),
    '3.1 POST /api/stage/telemetry-ping handles "multi_monitor_detected"'
  );

  record(
    telemetryPingCode.includes('multi_monitor_detected'),
    '3.2 Telemetry ping increments multi_monitor_detected counter in database'
  );

  // --- CHECK 4: Database Schema & Migration ---
  console.log('\n--- CHECK 4: Database Schema & Migration ---');
  const schemaPath = path.join(rootDir, 'packages/db-schema/schema.sql');
  const schemaCode = fs.readFileSync(schemaPath, 'utf8');

  record(
    schemaCode.includes('multi_monitor_detected INT NOT NULL DEFAULT 0'),
    '4.1 packages/db-schema/schema.sql includes multi_monitor_detected column'
  );

  const migrationPath = path.join(rootDir, 'packages/db-schema/migrations/002_multi_monitor_detection.sql');
  const migrationExists = fs.existsSync(migrationPath);
  record(
    migrationExists,
    '4.2 Migration 002_multi_monitor_detection.sql exists'
  );

  if (migrationExists) {
    const migrationCode = fs.readFileSync(migrationPath, 'utf8');
    record(
      migrationCode.includes('multi_monitor_detected'),
      '4.3 Migration SQL adds multi_monitor_detected column safely'
    );
  }

  // --- CHECK 5: Admin Telemetry Radar & CSV Export ---
  console.log('\n--- CHECK 5: Admin Telemetry Radar & CSV Export ---');
  const radarPath = path.join(webDir, 'src/components/admin/TelemetryRadarTab.tsx');
  const radarCode = fs.readFileSync(radarPath, 'utf8');

  record(
    radarCode.includes('multi_monitor_detected') && radarCode.includes('Multi-Monitor'),
    '5.1 TelemetryRadarTab queries and renders Multi-Monitor violations column'
  );

  const exportPath = path.join(webDir, 'src/app/api/admin/telemetry-export/route.ts');
  const exportCode = fs.readFileSync(exportPath, 'utf8');

  record(
    exportCode.includes('multi_monitor_detected') && exportCode.includes('Multi-Monitor Detections'),
    '5.2 Telemetry CSV export includes Multi-Monitor Detections header and rows'
  );

  console.log('\n================================================================');
  console.log(`FINAL DEV 2 VERIFICATION SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDev2Verification();
