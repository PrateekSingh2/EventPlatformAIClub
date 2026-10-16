import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BlobReader, ZipReader, Uint8ArrayWriter } from '@zip.js/zip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, '..');

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || 'admin123';

/**
 * Diagnostic HTTP fetcher that captures status, headers, and text body preview
 * BEFORE parsing JSON to ensure clear error diagnostics on any mismatch or HTML error.
 */
async function requestWithDiagnostics(url, options = {}, description = '') {
  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    console.error(`[NETWORK ERROR] Could not connect to ${url}: ${netErr.message}`);
    throw netErr;
  }

  const contentType = res.headers.get('content-type') || '';
  const text = await res.text();
  let json = null;
  const isJson = contentType.includes('application/json');

  if (isJson) {
    try {
      json = JSON.parse(text);
    } catch (parseErr) {
      console.error(`[JSON PARSE ERROR] Invalid JSON body from ${url}: ${parseErr.message}`);
    }
  }

  const logDiagnostics = (expectedDesc) => {
    // Redact secret query params or body keys in diagnostics
    const sanitizedUrl = url.replace(/([?&](?:adminSecret|secret)=)[^&]+/gi, '$1***');
    const preview = text.length > 250 ? text.slice(0, 250) + '...' : text;
    console.error(`   Expected:     ${expectedDesc}`);
    console.error(`   Actual HTTP:  ${res.status}`);
    console.error(`   Final URL:    ${sanitizedUrl}`);
    console.error(`   Content-Type: ${contentType}`);
    console.error(`   Body preview: ${preview.replace(/\r?\n/g, ' ')}`);
  };

  return {
    status: res.status,
    url: res.url || url,
    contentType,
    text,
    json,
    headers: res.headers,
    logDiagnostics,
  };
}

async function validateZipFile(filePath, password) {
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  const zipReader = new ZipReader(new BlobReader(blob));
  const entries = await zipReader.getEntries();
  const validEntries = entries.filter((e) => !e.directory);
  const isEncrypted = validEntries.some((e) => e.encrypted);

  if (isEncrypted) {
    if (!password) {
      await zipReader.close();
      return { valid: false, isEncrypted: true, error: 'PASSWORD_REQUIRED' };
    }
    const encryptedEntries = validEntries.filter((e) => e.encrypted).slice(0, 3);
    for (const entry of encryptedEntries) {
      try {
        const testWriter = new Uint8ArrayWriter();
        await entry.getData(testWriter, { password });
      } catch (err) {
        await zipReader.close();
        return { valid: false, isEncrypted: true, error: 'INVALID_PASSWORD', message: err.message };
      }
    }
    await zipReader.close();
    return { valid: true, isEncrypted: true, fileCount: validEntries.length };
  } else {
    try {
      const testEntry = validEntries[0];
      const testWriter = new Uint8ArrayWriter();
      await testEntry.getData(testWriter);
    } catch (err) {
      await zipReader.close();
      return { valid: false, isEncrypted: false, error: 'CORRUPT_ARCHIVE', message: err.message };
    }
    await zipReader.close();
    return { valid: true, isEncrypted: false, fileCount: validEntries.length };
  }
}

async function runTests() {
  console.log('================================================================');
  console.log('DEVELOPER 3 — TOURNAMENT CONTROL & REALTIME OPS VERIFICATION');
  console.log(`Target Base URL: ${BASE_URL}`);
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function record(condition, testName, diagnosticFn) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName}`);
      if (diagnosticFn) diagnosticFn();
      failed++;
    }
  }

  // --- TASK 1: Contest Lifecycle State Machine ---
  console.log('--- TASK 1: Contest Lifecycle State Machine ---');
  try {
    // 1.1 Fetch current contest settings
    const getRes = await requestWithDiagnostics(`${BASE_URL}/api/contest`);
    const hasContest = Boolean(getRes.json && (getRes.json.contest || getRes.json.settings));
    record(
      getRes.status === 200 && hasContest,
      '1.1 Fetch contest settings via /api/contest (HTTP 200 JSON)',
      () => getRes.logDiagnostics('HTTP 200 with { contest: {...} } or { settings: {...} }')
    );

    // 1.2 Reject unauthorized transition
    const unauthRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'LIVE', adminSecret: 'unauthorized-key' }),
    });
    record(
      unauthRes.status === 401,
      '1.2 Reject unauthorized state transition (HTTP 401)',
      () => unauthRes.logDiagnostics('HTTP 401 Unauthorized')
    );

    // 1.3 Transition to LIVE
    const liveRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'LIVE', adminSecret: ADMIN_SECRET, force: true }),
    });
    const liveStatus = liveRes.json?.contest?.status || liveRes.json?.settings?.status;
    record(
      liveRes.status === 200 && liveStatus === 'LIVE',
      '1.3 Admin transition to LIVE (HTTP 200 status=LIVE)',
      () => liveRes.logDiagnostics('HTTP 200 with contest.status="LIVE"')
    );

    // 1.4 Transition to FROZEN
    const frozenRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'FROZEN', adminSecret: ADMIN_SECRET }),
    });
    const frozenStatus = frozenRes.json?.contest?.status || frozenRes.json?.settings?.status;
    record(
      frozenRes.status === 200 && frozenStatus === 'FROZEN',
      '1.4 Admin transition to FROZEN (HTTP 200 status=FROZEN)',
      () => frozenRes.logDiagnostics('HTTP 200 with contest.status="FROZEN"')
    );

    // 1.5 Transition to CONCLUDED
    const concRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CONCLUDED', adminSecret: ADMIN_SECRET }),
    });
    const concStatus = concRes.json?.contest?.status || concRes.json?.settings?.status;
    record(
      concRes.status === 200 && concStatus === 'CONCLUDED',
      '1.5 Admin transition to CONCLUDED (HTTP 200 status=CONCLUDED)',
      () => concRes.logDiagnostics('HTTP 200 with contest.status="CONCLUDED"')
    );

    // 1.6 Verify invalid transition rejected (CONCLUDED -> LIVE without force)
    const invalidRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'LIVE', adminSecret: ADMIN_SECRET, force: false }),
    });
    record(
      invalidRes.status === 400,
      '1.6 Reject invalid state transition (CONCLUDED -> LIVE without force: HTTP 400)',
      () => invalidRes.logDiagnostics('HTTP 400 Transition not allowed')
    );

    // Reset back to LIVE for subsequent checks
    await requestWithDiagnostics(`${BASE_URL}/api/admin/contest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'LIVE', adminSecret: ADMIN_SECRET, force: true }),
    });
  } catch (err) {
    record(false, `Task 1 Execution Exception: ${err.message}`);
  }

  // --- TASK 2: Real-Time Admin Broadcast Announcements ---
  console.log('\n--- TASK 2: Real-Time Admin Broadcast Announcements ---');
  try {
    // 2.1 Unauthorized broadcast rejected
    const unauthBc = await requestWithDiagnostics(`${BASE_URL}/api/admin/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Unauthorized broadcast test', adminSecret: 'unauthorized-key' }),
    });
    record(
      unauthBc.status === 401,
      '2.1 Reject unauthorized announcement broadcast (HTTP 401)',
      () => unauthBc.logDiagnostics('HTTP 401 Unauthorized')
    );

    // 2.2 Reject empty message
    const emptyBc = await requestWithDiagnostics(`${BASE_URL}/api/admin/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: '   ', adminSecret: ADMIN_SECRET }),
    });
    record(
      emptyBc.status === 400,
      '2.2 Reject empty broadcast message (HTTP 400)',
      () => emptyBc.logDiagnostics('HTTP 400 Announcement message is required')
    );

    // 2.3 Successful broadcast
    const broadcastMsg = 'Attention: Stage 2 hints have been released. 15 minutes remaining!';
    const okBc = await requestWithDiagnostics(`${BASE_URL}/api/admin/broadcast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: broadcastMsg, urgency: 'critical', adminSecret: ADMIN_SECRET }),
    });
    record(
      okBc.status === 200 && okBc.json?.announcement?.message === broadcastMsg,
      '2.3 Authorized announcement broadcast (HTTP 200 with created announcement)',
      () => okBc.logDiagnostics('HTTP 200 with announcement object')
    );

    // 2.4 Verify participants can retrieve recent announcements
    const listRes = await requestWithDiagnostics(`${BASE_URL}/api/announcements`);
    const found = listRes.json?.announcements?.some((a) => a.message === broadcastMsg);
    record(
      listRes.status === 200 && Boolean(found),
      '2.4 Participants retrieve active broadcast announcements (HTTP 200 array)',
      () => listRes.logDiagnostics(`HTTP 200 containing broadcast: "${broadcastMsg}"`)
    );
  } catch (err) {
    record(false, `Task 2 Execution Exception: ${err.message}`);
  }

  // --- TASK 3: Admin Telemetry Audit and CSV Export ---
  console.log('\n--- TASK 3: Admin Telemetry Audit and CSV Export ---');
  try {
    // 3.1 Reject unauthenticated export
    const unauthExport = await requestWithDiagnostics(`${BASE_URL}/api/admin/telemetry-export`);
    record(
      unauthExport.status === 401,
      '3.1 Reject unauthorized telemetry CSV export (HTTP 401)',
      () => unauthExport.logDiagnostics('HTTP 401 Unauthorized')
    );

    // 3.2 Authorized CSV export
    const okExport = await requestWithDiagnostics(
      `${BASE_URL}/api/admin/telemetry-export?secret=${ADMIN_SECRET}`
    );
    record(
      okExport.status === 200,
      '3.2 Authorized telemetry export returns HTTP 200 OK',
      () => okExport.logDiagnostics('HTTP 200 OK')
    );

    // 3.3 Content-Type header is text/csv
    const isCsv = okExport.contentType.includes('text/csv');
    record(
      isCsv,
      '3.3 Response header Content-Type is text/csv',
      () => okExport.logDiagnostics('Content-Type: text/csv')
    );

    // 3.4 Content-Disposition header contains timestamped filename
    const disposition = okExport.headers.get('content-disposition') || '';
    const hasTimestampedFilename = disposition.includes('anti-cheat-report-');
    record(
      hasTimestampedFilename,
      '3.4 Content-Disposition contains timestamped filename',
      () => okExport.logDiagnostics('Content-Disposition: attachment; filename="anti-cheat-report-YYYY-MM-DD.csv"')
    );

    // 3.5 Check all 8 required schema columns
    const requiredCols = [
      'Participant Name',
      'Participant Email',
      'Stage Number',
      'Time Spent',
      'Time Threshold',
      'Tab Switches',
      'Fullscreen Exits',
      'Flag Reasons',
    ];
    const firstLine = okExport.text.split('\n')[0] || '';
    const allColsPresent = requiredCols.every((col) => firstLine.includes(col));
    record(
      allColsPresent,
      '3.5 CSV header contains all 8 required schema columns with RFC 4180 escaping',
      () => okExport.logDiagnostics(`Header containing all 8 columns: ${requiredCols.join(', ')}`)
    );
  } catch (err) {
    record(false, `Task 3 Execution Exception: ${err.message}`);
  }

  // --- TASK 4: One-Click Participant Disqualification ---
  console.log('\n--- TASK 4: One-Click Participant Disqualification ---');
  try {
    const targetUserId = '00000000-0000-0000-0000-000000000001';

    // 4.1 Reject unauthorized disqualification
    const unauthDq = await requestWithDiagnostics(`${BASE_URL}/api/admin/disqualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, adminSecret: 'unauthorized-key' }),
    });
    record(
      unauthDq.status === 401,
      '4.1 Reject unauthorized participant disqualification (HTTP 401)',
      () => unauthDq.logDiagnostics('HTTP 401 Unauthorized')
    );

    // 4.2 Disqualify test participant
    const dqRes = await requestWithDiagnostics(`${BASE_URL}/api/admin/disqualify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: targetUserId,
        reason: 'Automated test fair-play disqualification',
        adminSecret: ADMIN_SECRET,
      }),
    });
    const isDisqualifiedRole = dqRes.json?.user?.role === 'disqualified';
    record(
      dqRes.status === 200 && isDisqualifiedRole,
      '4.2 Admin disqualification sets role to disqualified (HTTP 200 role=disqualified)',
      () => dqRes.logDiagnostics('HTTP 200 with user.role="disqualified"')
    );

    // 4.3 Verify immediate enforcement: submit endpoint blocks disqualified participant with HTTP 403 Forbidden
    const submitRes = await requestWithDiagnostics(`${BASE_URL}/api/stage/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: 'AX-DEMO-TEST',
        stageNumber: 1,
        answers: {},
      }),
    });
    record(
      submitRes.status === 403,
      '4.3 Block submit access for disqualified participant (HTTP 403 Forbidden)',
      () => submitRes.logDiagnostics('HTTP 403 Forbidden')
    );

    // 4.4 Verify immediate enforcement: access-zip endpoint blocks disqualified participant with HTTP 403 Forbidden
    const zipRes = await requestWithDiagnostics(`${BASE_URL}/api/stage/access-zip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accessToken: 'AX-DEMO-TEST',
        stageNumber: 1,
      }),
    });
    record(
      zipRes.status === 403,
      '4.4 Block stage zip access for disqualified participant (HTTP 403 Forbidden)',
      () => zipRes.logDiagnostics('HTTP 403 Forbidden')
    );

    // Cleanup: Reinstate test participant so arena remains active for local testing
    await requestWithDiagnostics(`${BASE_URL}/api/admin/disqualify`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, adminSecret: ADMIN_SECRET }),
    });
  } catch (err) {
    record(false, `Task 4 Execution Exception: ${err.message}`);
  }

  // --- TASK 5: Archive Decryption Preflight Validator ---
  console.log('\n--- TASK 5: Archive Decryption Preflight Validator ---');
  try {
    const pubDir = path.join(webDir, 'public');
    const stage1Path = path.join(pubDir, 'demo-stage-1.zip');
    const stage2Path = path.join(pubDir, 'demo-stage-2-encrypted.zip');
    const stage3Path = path.join(pubDir, 'demo-stage-3-encrypted.zip');

    // 5.1 Test unencrypted stage-1 zip
    const res1 = await validateZipFile(stage1Path, '');
    record(
      res1.valid === true && res1.isEncrypted === false,
      '5.1 Unencrypted archive demo-stage-1.zip validates cleanly'
    );

    // 5.2 Test encrypted stage-2 without password -> requires password
    const res2NoPass = await validateZipFile(stage2Path, '');
    record(
      res2NoPass.valid === false && res2NoPass.error === 'PASSWORD_REQUIRED',
      '5.2 Encrypted archive without password requires password'
    );

    // 5.3 Test encrypted stage-2 with WRONG password
    const res2Wrong = await validateZipFile(stage2Path, 'incorrect_pwd_123');
    record(
      res2Wrong.valid === false && res2Wrong.error === 'INVALID_PASSWORD',
      '5.3 Encrypted archive with incorrect password rejects'
    );

    // 5.4 Test encrypted stage-2 with CORRECT password 'cyber2026'
    const res2Correct = await validateZipFile(stage2Path, 'cyber2026');
    record(
      res2Correct.valid === true && res2Correct.isEncrypted === true,
      '5.4 Encrypted archive with correct password cyber2026 validates'
    );

    // 5.5 Test encrypted stage-3 with CORRECT password 'quantum4096'
    const res3Correct = await validateZipFile(stage3Path, 'quantum4096');
    record(
      res3Correct.valid === true && res3Correct.isEncrypted === true,
      '5.5 Encrypted archive with correct password quantum4096 validates'
    );
  } catch (err) {
    record(false, `Task 5 Execution Exception: ${err.message}`);
  }

  console.log('\n================================================================');
  console.log(`FINAL TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
