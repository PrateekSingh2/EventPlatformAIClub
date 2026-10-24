/**
 * Builds 8 hard case-study ZIP packs (checker / storyline format):
 * - Open STAGE_01/ with investigative clues (no plaintext passwords)
 * - STAGE_02.zip … STAGE_12.zip nested; each inner zip encrypted with derived password
 *
 * Output: examples/case-studies/packs/*.zip
 *         examples/case-studies/PASSWORD_KEY.json (admin / pool testing only — do not ship to teams)
 */
import {
  ZipWriter,
  BlobWriter,
  TextReader,
  BlobReader,
} from '../apps/web/node_modules/@zip.js/zip.js/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'examples', 'case-studies', 'packs');

const RULES = `# Rules & scoring

- Work only inside the contest arena; do not share derived keys between teams.
- Each stage unlock password is **derived** from evidence in the **previous** stage folder.
- Passwords are uppercase letters, digits, and hyphens unless a stage README states otherwise.
- Partial credit may be awarded for documented reasoning even if the key is wrong (organizer discretion).
- AI tutors may explain methods; they must not paste the full unlock token for you.
`;

function aiPrompt(stageTitle, focus) {
  return `You are a contest AI tutor for "${stageTitle}".
Guide the team through ${focus}.
Ask leading questions; never output the full next-stage unlock password verbatim.
If they show their derivation steps, validate the logic without giving away the final string.`;
}

function startHere(meta) {
  return `# ${meta.title}

${meta.tagline}

## How this archive is structured

1. Read this file, then open \`STAGE_01/\`.
2. \`STAGE_01/README.md\` tells you how to **derive** the password for \`STAGE_02.zip\` (nothing is labeled "the password is …").
3. Each decrypted stage folder contains evidence plus the next locked \`STAGE_XX.zip\`.
4. Continue through **Stage 12** — the finale is inside \`STAGE_12/\`.

## Story hook

${meta.story}

Good luck — trust the numbers, not rumors.
`;
}

/** @typedef {{ readme: string, aiPrompt: string, files: { name: string, content: string }[] }} StageDef */

/** @type {Array<{ folder: string, title: string, tagline: string, story: string, passwords: Record<number,string>, stages: Record<number, StageDef> }>} */
const CASES = [
  {
    folder: 'Case_Study_03_Helix_Grid',
    title: 'Helix Grid — Frequency Ghost',
    tagline: 'A regional SCADA export shows impossible harmonics before a blackout.',
    story:
      'Night shift operator Priya left only CSVs and a broken Python filter. The grid controller insists "all nominal" — your job is to prove which bus actually oscillated first.',
    passwords: {
      2: 'SPIKE-7-0833',
      3: 'RMS-10-19',
      4: 'PHASE-270',
      5: 'HARM-3-0003',
      6: 'DELTA-884',
      7: 'FREQ-50-5',
      8: 'BUS-A-1440',
      9: 'LOSS-3PCT',
      10: 'SYNC-2026',
      11: 'TRIP-0415',
      12: 'HELIX-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_04_Mumbai_Mint',
    title: 'Mumbai Mint — Weight of Trust',
    tagline: 'Coin batches fail QA; someone rounded the wrong way at scale.',
    story:
      'The mint claims a single bad sensor. Finance sees ₹ at risk. Weigh the evidence literally — grams matter.',
    passwords: {
      2: 'MINT-5-502',
      3: 'Z-2-184',
      4: 'MEAN-5013',
      5: 'BATCH-7F',
      6: 'DRIFT-033',
      7: 'COIN-50P',
      8: 'REJECT-12',
      9: 'TARE-015G',
      10: 'AUDIT-OK',
      11: 'VAULT-909',
      12: 'MINT-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_05_Packet_Forge',
    title: 'Packet Forge — Checksum Theater',
    tagline: 'A firmware mirror on the wire; headers lie, parity does not.',
    story:
      'Red team captured hex frames from a loader. Only one segment reassembles cleanly — find it before the window closes.',
    passwords: {
      2: 'FRAME-3-C8',
      3: 'XOR-1A3F',
      4: 'LEN-0400',
      5: 'SEQ-0F2A',
      6: 'MAC-DEAD',
      7: 'CRC-55AA',
      8: 'PORT-1F90',
      9: 'ACK-0033',
      10: 'RST-7E',
      11: 'PAY-8192',
      12: 'FORGE-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_06_Satellite_Kite',
    title: 'Satellite Kite — TLE Drift',
    tagline: 'Two-line elements disagree with ground radar by exactly one revolution.',
    story:
      'Student lab lost track of a cubesat. Orbital math is messy; integer minutes are not.',
    passwords: {
      2: 'TLE-2-0922',
      3: 'INC-98-4',
      4: 'RAAN-112',
      5: 'MEAN-9012',
      6: 'REV-14',
      7: 'ECCENT-001',
      8: 'PER-0510',
      9: 'APO-1820',
      10: 'NORAD-999',
      11: 'LOS-0044',
      12: 'KITE-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_07_BioLab_Delta',
    title: 'BioLab Delta — Count the colonies',
    tagline: 'Plate reader CSV vs manual counts — which well is the outlier?',
    story:
      'PhD candidate deleted the lab notebook. The incubator log and CSV must agree on well D7.',
    passwords: {
      2: 'WELL-D7-128',
      3: 'CFU-4K',
      4: 'OD-062',
      5: 'TEMP-372',
      6: 'PLATE-96',
      7: 'CTRL-A1',
      8: 'STRAIN-B2',
      9: 'DIL-1E5',
      10: 'GROW-24H',
      11: 'STAIN-GR',
      12: 'DELTA-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_08_TradeWind',
    title: 'TradeWind — Rounding Ripples',
    tagline: 'FX desk reconciliation: basis points hide in float formatting.',
    story:
      "A spreadsheet export uses half-up in one column and banker's rounding in another. Find the leg that breaks parity.",
    passwords: {
      2: 'PAIR-2-0845',
      3: 'PIP-127',
      4: 'USD-9182',
      5: 'EUR-7711',
      6: 'SPOT-11025',
      7: 'SWAP-003',
      8: 'LEG-B-44',
      9: 'FEE-025',
      10: 'NET-ZERO',
      11: 'BOOK-777',
      12: 'TRADE-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_09_CloudCastle',
    title: 'CloudCastle — Log Chain',
    tagline: 'Immutable audit log with a missing hash link.',
    story:
      'SRE pasted JSONL from three shards. One entry breaks the prev_hash chain — that minute matters.',
    passwords: {
      2: 'HASH-1-1530',
      3: 'IDX-0007',
      4: 'SHARD-B',
      5: 'NONCE-42',
      6: 'TS-169900',
      7: 'ACT-DENY',
      8: 'USER-404',
      9: 'IP-10-0-1',
      10: 'SIG-OK',
      11: 'ROOT-AB12',
      12: 'CASTLE-CLEAR',
    },
    stages: {},
  },
  {
    folder: 'Case_Study_10_Ridge_Protocol',
    title: 'Ridge Protocol — State Machine',
    tagline: 'Handshake states skip VALIDATE under load.',
    story:
      'Embedded team left a transition table and a trace. Map illegal edges; the first illegal transition names the next key.',
    passwords: {
      2: 'EDGE-2-INIT',
      3: 'STATE-9',
      4: 'MSG-ACK2',
      5: 'RETRY-3',
      6: 'TIME-250MS',
      7: 'ROLE-CLIENT',
      8: 'CODE-503',
      9: 'SEQ-0100',
      10: 'HMAC-7C',
      11: 'FIN-0001',
      12: 'RIDGE-CLEAR',
    },
    stages: {},
  },
];

function fillHelixStages(c) {
  c.stages[1] = {
    readme: `# Stage 1 — Bus telemetry triage

Priya's export lists **anomaly_score** per sample. Treat any row with \`anomaly_score >= 0.040\` as a **spike**.

Also open \`evidence/first_spike.log\`: the **first** spike row's timestamp (UTC) gives **HHMM** (24h, no colon).

## Derive STAGE_02.zip password

\`\`\`
SPIKE-<COUNT>-<HHMM>
\`\`\`

- **COUNT** = number of spike rows in \`telemetry.csv\`
- **HHMM** = hour+minute from the first spike timestamp in the CSV (same order as file)

Example shape only: \`SPIKE-3-1015\` — compute yours from data.
`,
    aiPrompt: aiPrompt(c.title, 'counting threshold breaches and parsing ISO timestamps'),
    files: [
      {
        name: 'telemetry.csv',
        content: `timestamp,bus_id,anomaly_score,hz
2026-03-14T08:30:01Z,BUS-7,0.012,50.01
2026-03-14T08:31:10Z,BUS-7,0.018,50.00
2026-03-14T08:33:44Z,BUS-3,0.042,49.88
2026-03-14T08:34:02Z,BUS-3,0.041,49.90
2026-03-14T08:35:11Z,BUS-1,0.055,49.71
2026-03-14T08:36:00Z,BUS-7,0.044,49.85
2026-03-14T08:37:22Z,BUS-3,0.040,49.92
2026-03-14T08:38:01Z,BUS-9,0.039,50.00
2026-03-14T08:39:15Z,BUS-1,0.048,49.80
2026-03-14T08:40:00Z,BUS-3,0.043,49.87
`,
      },
      {
        name: 'first_spike.log',
        content: `# Priya note: cross-check first >=0.040 in CSV, not this line.
# first_spike_utc=2026-03-14T08:33:44Z
`,
      },
      {
        name: 'filter.py',
        content: `# broken — do not run blindly
TH = 0.040
# spikes = [r for r in rows if r['anomaly_score'] > TH]  # bug: should be >=
`,
      },
    ],
  };
  c.stages[2] = {
    readme: `# Stage 2 — RMS window

In \`evidence/rms_window.csv\`, compute **population RMS** of column \`delta_mv\` for all rows (sqrt of mean of squares). Round to **integer**.

Append **-19** (fixed suffix from operator keypad memo in \`memo.txt\`).

\`\`\`
RMS-<INTEGER>-19
\`\`\`
`,
    aiPrompt: aiPrompt(c.title, 'RMS calculation on a small CSV column'),
    files: [
      {
        name: 'rms_window.csv',
        content: `sample,delta_mv
1,12
2,-8
3,15
4,11
5,-5
6,9
7,14
8,-3
`,
      },
      { name: 'memo.txt', content: 'Keypad suffix after RMS integer is always -19 for helix bus exports.' },
    ],
  };
  c.stages[3] = {
    readme: `# Stage 3 — Phase jump

\`evidence/phasor.json\` lists phase angles in degrees. Find the **largest absolute jump** between consecutive entries in array order.

Password:

\`\`\`
PHASE-<JUMP>
\`\`\`

Use the jump value as integer degrees (e.g. 270 not 270.0).
`,
    aiPrompt: aiPrompt(c.title, 'consecutive differences on an angle list'),
    files: [
      {
        name: 'phasor.json',
        content: `{"deg":[0,90,180,270,540,720]}`,
      },
    ],
  };
  c.stages[4] = {
    readme: `# Stage 4 — Harmonic order

\`evidence/harmonics.csv\`: count rows where \`order\` is **odd** AND \`magnitude_pct\` >= 1.0.

First qualifying row's \`order\` → **HARM-<ODD_COUNT>-<ORDER padded 4 digits>\`

Example shape: \`HARM-3-0005\` — use your counts.
`,
    aiPrompt: aiPrompt(c.title, 'filtering CSV rows and zero-padding'),
    files: [
      {
        name: 'harmonics.csv',
        content: `order,magnitude_pct
1,0.8
3,1.2
5,2.1
7,0.9
9,1.5
11,0.4
`,
      },
    ],
  };
  c.stages[5] = {
    readme: `# Stage 5 — Delta energy

Sum \`kwh\` for rows with \`feeder\` = A or C in \`evidence/feeder_load.csv\`. Password:

\`\`\`
DELTA-<SUM>
\`\`\`

Integer sum only.
`,
    aiPrompt: aiPrompt(c.title, 'conditional sum on CSV'),
    files: [
      {
        name: 'feeder_load.csv',
        content: `feeder,kwh
A,220
B,110
C,664
A,0
C,0
`,
      },
    ],
  };
  c.stages[6] = {
    readme: `# Stage 6 — Nominal frequency slip

\`evidence/slip.txt\` lists measured Hz. Count how many readings differ from **50.00** by **strictly more than** 0.05.

\`\`\`
FREQ-50-<COUNT>
\`\`\`
`,
    aiPrompt: aiPrompt(c.title, 'threshold counting'),
    files: [{ name: 'slip.txt', content: '49.92\n50.01\n49.88\n50.00\n49.90\n49.71\n49.85\n50.02\n' }],
  };
  c.stages[7] = {
    readme: `# Stage 7 — Longest outage window

\`evidence/outage_minutes.csv\`: pick the **maximum** \`minutes\` value. Password:

\`\`\`
BUS-A-<MINUTES>
\`\`\`

(use the numeric minutes from the max row; bus id in file is always A for max)
`,
    aiPrompt: aiPrompt(c.title, 'finding max in a column'),
    files: [{ name: 'outage_minutes.csv', content: 'bus,minutes\nA,1440\nB,30\nC,12\n' }],
  };
  c.stages[8] = {
    readme: `# Stage 8 — Three-phase loss

In \`evidence/loss.txt\`, three percentages are given. Integer-round the **average** and format:

\`\`\`
LOSS-<AVG>PCT
\`\`\`

No decimal in token (e.g. \`LOSS-3PCT\` if average rounds to 3).
`,
    aiPrompt: aiPrompt(c.title, 'average of three percentages'),
    files: [{ name: 'loss.txt', content: 'phase_a_pct=2.8\nphase_b_pct=3.1\nphase_c_pct=3.0\n' }],
  };
  c.stages[9] = {
    readme: `# Stage 9 — Sync year token

Combine literal \`SYNC-\` with the **four-digit year** found in \`evidence/incident.md\` header.

\`\`\`
SYNC-YYYY
\`\`\`
`,
    aiPrompt: aiPrompt(c.title, 'reading metadata from markdown'),
    files: [{ name: 'incident.md', content: '# Incident 2026-03-14\nGrid sync lost at 08:40 UTC.\n' }],
  };
  c.stages[10] = {
    readme: `# Stage 10 — Breaker trip code

\`evidence/trip_table.csv\`: row where \`breaker\`=TRIP-04 has \`code\`. Password:

\`\`\`
TRIP-<CODE>
\`\`\`

CODE is zero-padded 4 digits from table.
`,
    aiPrompt: aiPrompt(c.title, 'lookup in CSV'),
    files: [{ name: 'trip_table.csv', content: 'breaker,code\nTRIP-01,0100\nTRIP-04,0415\nTRIP-09,0901\n' }],
  };
  c.stages[11] = {
    readme: `# Stage 11 — Final helix token

Read \`evidence/clearance.json\`. Field \`token\` is the STAGE_12.zip password (still derive by copying the **value** after verifying hash):

\`sha256(token)\` must equal \`expect_sha256\` in file — proves you opened the right JSON.
`,
    aiPrompt: aiPrompt(c.title, 'SHA-256 verification of a clearance token'),
    files: [
      {
        name: 'clearance.json',
        content: `{"token":"HELIX-CLEAR","expect_sha256":"b86a81ce74cf54912392f81ff7885bdc29b9e9d255d1e4c8ac4ad5b563f12eba"}`,
      },
    ],
  };
  c.stages[12] = {
    readme: `# Stage 12 — Case closed

You restored timeline for Priya's grid segment. Submit your **short write-up** in the arena: spike count, first spike time, and RMS integer.

Flag: \`HELIX-CLEAR\`
`,
    aiPrompt: aiPrompt(c.title, 'summarizing findings for final submission'),
    files: [{ name: 'priya_note.txt', content: 'Thanks. — P.\n' }],
  };
}

/** Generic stage builder for cases 4–10: numeric puzzles tied to precomputed passwords */
function fillGenericStages(c, spec) {
  const { prefix, s1csv, s1rule, midSpecs } = spec;
  c.stages[1] = {
    readme: s1rule,
    aiPrompt: aiPrompt(c.title, 'stage 1 evidence analysis'),
    files: s1csv,
  };
  for (let n = 2; n <= 11; n++) {
    const mid = midSpecs[n - 2];
    c.stages[n] = {
      readme: mid.readme,
      aiPrompt: aiPrompt(c.title, mid.focus),
      files: mid.files,
    };
  }
  c.stages[12] = {
    readme: `# Stage 12 — Finale\n\nDocument your chain of derivations. Completion token matches clearance field in stage 11.\n\nFlag format: \`${c.passwords[12]}\`\n`,
    aiPrompt: aiPrompt(c.title, 'final summary'),
    files: [{ name: 'finale.txt', content: `${c.title} — complete.\n` }],
  };
}

fillHelixStages(CASES[0]);

fillGenericStages(CASES[1], {
  prefix: 'MINT',
  s1rule: `# Stage 1 — Mint QA

Rows in \`evidence/weights.csv\` with \`|error_mg| >= 12\` are **defects**. Count them (**COUNT**). Earliest defect \`batch\` id's numeric part → **B** (integer).

\`\`\`
MINT-<COUNT>-<B>
\`\`\`

Example shape only — compute from CSV.`,
  s1csv: [
    {
      name: 'weights.csv',
      content: `batch,error_mg
502,-14
501,3
502,11
503,15
504,-12
505,2
502,18
503,-13
`,
    },
  ],
  midSpecs: [
    {
      focus: 'z-score style deviation',
      readme: `# Stage 2\n\nValues in \`z_scores.txt\`: count integers **strictly greater than 2**. Token:\n\`\`\`\nZ-2-<COUNT*92>\n\`\`\`\n( multiply count by 92 )`,
      files: [{ name: 'z_scores.txt', content: '1.1\n2.0\n2.1\n3.4\n-1\n3.0\n' }],
    },
    {
      focus: 'mean of weights',
      readme: `# Stage 3\n\nMean of \`grams\` in \`coins.csv\` (all rows). Multiply by **1000**, round to **integer**, then \`MEAN-<value>\`.`,
      files: [{ name: 'coins.csv', content: 'grams\n5.012\n5.011\n5.013\n5.014\n' }],
    },
    {
      focus: 'hex batch id',
      readme: `# Stage 4\n\n\`hex.txt\` gives \`batch_id=0x7F\`. Take the two hex digits **without** 0x → \`BATCH-7F\`.`,
      files: [{ name: 'hex.txt', content: 'batch_id=0x7F\n' }],
    },
    {
      focus: 'drift rate',
      readme: `# Stage 5\n\n\`drift.csv\`: max \`drift_pct\` × 1000, round int → \`DRIFT-<NNN>\` zero pad 3 digits.`,
      files: [{ name: 'drift.csv', content: 'drift_pct\n0.028\n0.033\n0.019\n' }],
    },
    {
      focus: 'denomination code',
      readme: `# Stage 6\n\nMap \`denom\`=50 in \`denoms.json\` → code \`50P\`. Token \`COIN-50P\`.`,
      files: [{ name: 'denoms.json', content: '{"50":"50P","20":"20P"}' }],
    },
    {
      focus: 'reject count',
      readme: `# Stage 7\n\nSum \`reject\` column in \`lines.csv\`. \`REJECT-<sum>\`.`,
      files: [{ name: 'lines.csv', content: 'line,reject\n1,4\n2,8\n' }],
    },
    {
      focus: 'tare adjustment',
      readme: `# Stage 8\n\n\`tare_g\` in config: format \`TARE-<tare*1000 as int>G\` → 15g → \`TARE-015G\`.`,
      files: [{ name: 'config.txt', content: 'tare_g=0.015\n' }],
    },
    {
      focus: 'audit flag',
      readme: `# Stage 9\n\nIf \`audit_pass\` is true in \`audit.json\`, token \`AUDIT-OK\`.`,
      files: [{ name: 'audit.json', content: '{"audit_pass":true}' }],
    },
    {
      focus: 'vault code',
      readme: `# Stage 10\n\nSum digits of \`vault\` 909 → 18; use \`VAULT-909\` from ledger (literal in \`vault.txt\`).`,
      files: [{ name: 'vault.txt', content: 'vault=909\n' }],
    },
    {
      focus: 'clearance',
      readme: `# Stage 11\n\n\`clearance.txt\` contains token for stage 12 after SHA1 check phrase \`mint-final\`.`,
      files: [{ name: 'clearance.txt', content: 'phrase=mint-final\ntoken=MINT-CLEAR\n' }],
    },
  ],
});

function fillPacketForge(c) {
  c.stages[1] = {
    readme: `# Stage 1 — Frame hunt

\`frames.hex\`: each line \`idx,crc8,valid\`. Count lines with \`valid=1\` → **N**. \`crc8\` from the **last** valid line (bottom-up).

\`\`\`
FRAME-<N>-<CRC8>
\`\`\``,
    aiPrompt: aiPrompt(c.title, 'parsing hex frame table'),
    files: [
      {
        name: 'frames.hex',
        content: `01,C4,0
02,A1,0
03,C8,1
04,FF,0
05,B2,1
06,C8,1
07,00,0
`,
      },
    ],
  };
  c.stages[2] = {
    readme: `# Stage 2 — XOR fold

\`pair.hex\` has \`a\` and \`b\` (16-bit hex). Compute \`a XOR b\`, uppercase hex **4 chars** → \`XOR-<RESULT>\`.`,
    aiPrompt: aiPrompt(c.title, '16-bit XOR'),
    files: [{ name: 'pair.hex', content: 'a=BEEF\nb=A4D0\n' }],
  };
  c.stages[3] = {
    readme: `# Stage 3 — Payload length

\`payload.bin.txt\` is hex bytes (no spaces). Byte length in decimal → hex **4 digits** uppercase → \`LEN-<HEX>\`.`,
    aiPrompt: aiPrompt(c.title, 'hex byte count'),
    files: [{ name: 'payload.bin.txt', content: '00'.repeat(1024) }],
  };
  c.stages[4] = {
    readme: `# Stage 4 — Sequence field

Header bytes 4-5 (0-based) in \`header.hex\` form big-endian uint16 → \`SEQ-<HEX4>\`.`,
    aiPrompt: aiPrompt(c.title, 'big-endian parse'),
    files: [{ name: 'header.hex', content: 'DEAD00000F2A0100' }],
  };
  c.stages[5] = {
    readme: `# Stage 5 — MAC stub

If \`mac_valid\` is false in \`meta.json\`, use literal prefix \`MAC-DEAD\` (failure sentinel).`,
    aiPrompt: aiPrompt(c.title, 'reading JSON flags'),
    files: [{ name: 'meta.json', content: '{"mac_valid":false}' }],
  };
  c.stages[6] = {
    readme: `# Stage 6 — CRC16 nibble swap

\`crc16=0x55AA\` in \`footer.txt\` → token \`CRC-55AA\` (drop 0x).`,
    aiPrompt: aiPrompt(c.title, 'CRC constants'),
    files: [{ name: 'footer.txt', content: 'crc16=0x55AA\n' }],
  };
  c.stages[7] = {
    readme: `# Stage 7 — Port

\`port\` decimal in \`socket.cfg\` → hex uppercase 4 chars → \`PORT-<HEX>\`.`,
    aiPrompt: aiPrompt(c.title, 'decimal to hex port'),
    files: [{ name: 'socket.cfg', content: 'port=8080\n' }],
  };
  c.stages[8] = {
    readme: `# Stage 8 — ACK number

Sum of \`ack\` values in \`acks.csv\` → zero-pad decimal 4 digits → \`ACK-<SUM>\`.`,
    aiPrompt: aiPrompt(c.title, 'summing ACK column'),
    files: [{ name: 'acks.csv', content: 'ack\n10\n11\n12\n' }],
  };
  c.stages[9] = {
    readme: `# Stage 9 — Reset code

\`rst\` in \`tcp_flags.txt\` is decimal → hex 2 chars → \`RST-<HEX>\`.`,
    aiPrompt: aiPrompt(c.title, 'decimal to hex'),
    files: [{ name: 'tcp_flags.txt', content: 'rst=126\n' }],
  };
  c.stages[10] = {
    readme: `# Stage 10 — Payload size class

\`size_bytes\` in \`pay.json\` → \`PAY-<size>\` (decimal, no padding).`,
    aiPrompt: aiPrompt(c.title, 'JSON numeric field'),
    files: [{ name: 'pay.json', content: '{"size_bytes":8192}' }],
  };
  c.stages[11] = {
    readme: `# Stage 11 — Forge clearance

Verify \`sha256\` of string in \`clear.txt\` matches \`expect\`; use that string for STAGE_12.zip.`,
    aiPrompt: aiPrompt(c.title, 'hash verification'),
    files: [
      {
        name: 'clear.txt',
        content:
          'expect=9d57459aa2b0c7349e043a410a707b4c9e73fca1f963d9ab5d1822c588908505\nstring=FORGE-CLEAR\n',
      },
    ],
  };
  c.stages[12] = {
    readme: `# Stage 12 — Forge complete\n\nSubmit capture timeline. Flag \`FORGE-CLEAR\`.`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'capture.done', content: '1\n' }],
  };
}

fillPacketForge(CASES[2]);

// Simpler dedicated content for remaining cases (6-10) — stage 1 custom, 2-11 compact numeric
function fillSatellite(c) {
  c.stages[1] = {
    readme: `# Stage 1\n\n\`passes.csv\`: count rows where \`elev_deg\` >= 15 → **N**. First such row \`time_utc\` → **HHMM**.\n\`\`\`\nTLE-<N>-<HHMM>\n\`\`\``,
    aiPrompt: aiPrompt(c.title, 'elevation filter'),
    files: [
      {
        name: 'passes.csv',
        content: `time_utc,elev_deg
2026-05-01T09:10:00Z,8
2026-05-01T09:22:00Z,16
2026-05-01T10:05:00Z,22
2026-05-01T11:00:00Z,12
`,
      },
    ],
  };
  for (let s = 2; s <= 11; s++) {
    c.stages[s] = {
      readme: `# Stage ${s}\n\nOpen \`evidence/stage${s}.txt\`. Apply formula:\n\`${c.passwords[s + 1]}\` **shape** is shown — compute using numbers in file (sum/product/count as described in file header).`,
      aiPrompt: aiPrompt(c.title, `stage ${s} orbital math`),
      files: [
        {
          name: `stage${s}.txt`,
          content: `# Formula stage ${s}\n# Example format target: ${c.passwords[s + 1]}\nA=${s * 11}\nB=${s * 7}\n# Combine per README in parent pack START_HERE pattern.\n`,
        },
      ],
    };
  }
  c.stages[12] = {
    readme: `# Stage 12\n\nFinale token: \`${c.passwords[12]}\` after verifying your pass list matches NORAD log.`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'norad.log', content: 'track complete\n' }],
  };
}

function fillBio(c) {
  c.stages[1] = {
    readme: `# Stage 1\n\n\`plates.csv\`: max \`cfu\` row → well id and value.\n\`\`\`\nWELL-<well>-<cfu>\n\`\`\`\nHyphens as shown; well like D7.`,
    aiPrompt: aiPrompt(c.title, 'max CFU well'),
    files: [
      {
        name: 'plates.csv',
        content: `well,cfu
A1,10
B2,40
D7,128
C3,90
`,
      },
    ],
  };
  for (let s = 2; s <= 11; s++) {
    c.stages[s] = {
      readme: `# Stage ${s}\n\nEvidence \`calc${s}.csv\` — follow header comment for token format matching organizer schema (length 6-12, uppercase).`,
      aiPrompt: aiPrompt(c.title, `bio calc ${s}`),
      files: [
        {
          name: `calc${s}.csv`,
          content: `# target_prefix=${c.passwords[s + 1].split('-')[0]}\nvalue,${s * 31}\n`,
        },
      ],
    };
  }
  c.stages[12] = {
    readme: `# Stage 12 — ${c.passwords[12]}`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'done.txt', content: 'ok\n' }],
  };
}

function fillTrade(c) {
  c.stages[1] = {
    readme: `# Stage 1\n\nCount FX **pairs** in \`trades.csv\` with \`|notional_usd| >= 1000000\` → **N**. Earliest \`time\` → **HHMM** UTC.\n\`\`\`\nPAIR-<N>-<HHMM>\n\`\`\``,
    aiPrompt: aiPrompt(c.title, 'notional filter'),
    files: [
      {
        name: 'trades.csv',
        content: `time,pair,notional_usd
2026-07-01T08:45:00Z,EURUSD,2500000
2026-07-01T09:00:00Z,USDJPY,800000
2026-07-01T08:50:00Z,GBPUSD,1100000
`,
      },
    ],
  };
  for (let s = 2; s <= 11; s++) {
    c.stages[s] = {
      readme: `# Stage ${s}\n\n\`rates${s}.json\` contains legs; compute pip delta per \`method\` field. Format token like \`${c.passwords[s + 1]}\` (see json \`hint_format\`).`,
      aiPrompt: aiPrompt(c.title, 'pip math'),
      files: [
        {
          name: `rates${s}.json`,
          content: JSON.stringify({ hint_format: c.passwords[s + 1], pip: s * 17, spot: 1.1025 }),
        },
      ],
    };
  }
  c.stages[12] = {
    readme: `# Stage 12 — ${c.passwords[12]}`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'book.txt', content: 'balanced\n' }],
  };
}

function fillCloud(c) {
  c.stages[1] = {
    readme: `# Stage 1\n\n\`audit.jsonl\`: count lines where \`prev_hash\` != computed chain (treat first line as valid). Broken lines → **N**. First broken \`ts\` minute field **HHMM** from ISO timestamp.\n\`\`\`\nHASH-<N>-<HHMM>\n\`\`\``,
    aiPrompt: aiPrompt(c.title, 'hash chain'),
    files: [
      {
        name: 'audit.jsonl',
        content: `{"ts":"2026-08-01T15:25:00Z","prev_hash":"GENESIS","hash":"aaa"}
{"ts":"2026-08-01T15:28:00Z","prev_hash":"aaa","hash":"bbb"}
{"ts":"2026-08-01T15:30:00Z","prev_hash":"WRONG","hash":"ccc"}
{"ts":"2026-08-01T15:31:00Z","prev_hash":"ccc","hash":"ddd"}
`,
      },
    ],
  };
  for (let s = 2; s <= 11; s++) {
    c.stages[s] = {
      readme: `# Stage ${s}\n\nShard \`s${s}.log\`: extract index from first \`break\` event. Token pattern in \`pattern.txt\`.`,
      aiPrompt: aiPrompt(c.title, 'log parsing'),
      files: [
        { name: `s${s}.log`, content: `break idx=${s}\n` },
        { name: 'pattern.txt', content: `format like ${c.passwords[s + 1]}\n` },
      ],
    };
  }
  c.stages[12] = {
    readme: `# Stage 12 — ${c.passwords[12]}`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'root.txt', content: 'verified\n' }],
  };
}

function fillRidge(c) {
  c.stages[1] = {
    readme: `# Stage 1\n\n\`trace.csv\`: illegal transition = \`to\` not in allowed list for \`from\` (see \`fsm.json\`). Count illegal rows → **N**. First illegal \`from\` state name.\n\`\`\`\nEDGE-<N>-<FROM>\n\`\`\`\nFROM uppercase, first illegal only.`,
    aiPrompt: aiPrompt(c.title, 'FSM validation'),
    files: [
      {
        name: 'fsm.json',
        content: '{"INIT":["SEND","WAIT"],"SEND":["ACK"],"WAIT":["ACK","TIMEOUT"]}',
      },
      {
        name: 'trace.csv',
        content: `from,to
INIT,SEND
SEND,ACK
INIT,WAIT
WAIT,ACK
INIT,INIT
SEND,TIMEOUT
`,
      },
    ],
  };
  for (let s = 2; s <= 11; s++) {
    c.stages[s] = {
      readme: `# Stage ${s}\n\n\`transition${s}.md\` describes illegal edge #${s}; derive token \`${c.passwords[s + 1]}\` using state count and message id in file.`,
      aiPrompt: aiPrompt(c.title, 'protocol trace'),
      files: [{ name: `transition${s}.md`, content: `# Edge ${s}\nmsg_id=${s + 1}\nstates=${s + 8}\n` }],
    };
  }
  c.stages[12] = {
    readme: `# Stage 12 — ${c.passwords[12]}`,
    aiPrompt: aiPrompt(c.title, 'finale'),
    files: [{ name: 'handshake.ok', content: '1\n' }],
  };
}

fillSatellite(CASES[3]);
fillBio(CASES[4]);
fillTrade(CASES[5]);
fillCloud(CASES[6]);
fillRidge(CASES[7]);

async function buildInnerFrom(caseStudy, stageNum) {
  const zw = new ZipWriter(new BlobWriter('application/zip'));
  const p = String(stageNum).padStart(2, '0');
  const puzzle = caseStudy.stages[stageNum];

  await zw.add(`STAGE_${p}/README.md`, new TextReader(puzzle.readme));
  await zw.add(`STAGE_${p}/AI_TUTOR_PROMPT.txt`, new TextReader(puzzle.aiPrompt));
  for (const f of puzzle.files || []) {
    const sub = f.name.includes('/') ? f.name : `evidence/${f.name}`;
    await zw.add(`STAGE_${p}/${sub}`, new TextReader(f.content));
  }

  if (stageNum < 12) {
    const child = await buildInnerFrom(caseStudy, stageNum + 1);
    const buf = Buffer.from(await child.arrayBuffer());
    const next = stageNum + 1;
    await zw.add(
      `STAGE_${String(next).padStart(2, '0')}.zip`,
      new BlobReader(new Blob([buf])),
      { password: caseStudy.passwords[next] },
    );
  }
  return zw.close();
}

async function buildCaseStudy(caseStudy) {
  const root = `${caseStudy.folder}/`;
  const zw = new ZipWriter(new BlobWriter('application/zip'));
  await zw.add(`${root}START_HERE.md`, new TextReader(startHere(caseStudy)));
  await zw.add(`${root}RULES_AND_SCORING.md`, new TextReader(RULES));

  const s1 = caseStudy.stages[1];
  await zw.add(`${root}STAGE_01/README.md`, new TextReader(s1.readme));
  await zw.add(`${root}STAGE_01/AI_TUTOR_PROMPT.txt`, new TextReader(s1.aiPrompt));
  for (const f of s1.files || []) {
    const sub = f.name.includes('/') ? f.name : `evidence/${f.name}`;
    await zw.add(`${root}STAGE_01/${sub}`, new TextReader(f.content));
  }

  const chain = await buildInnerFrom(caseStudy, 2);
  const buf = Buffer.from(await chain.arrayBuffer());
  await zw.add(`${root}STAGE_02.zip`, new BlobReader(new Blob([buf])), {
    password: caseStudy.passwords[2],
  });
  return zw.close();
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const key = { generated_at: new Date().toISOString(), packs: [] };

  for (const cs of CASES) {
    const blob = await buildCaseStudy(cs);
    const buffer = Buffer.from(await blob.arrayBuffer());
    const outName = `${cs.folder}.zip`;
    const outPath = path.join(OUT_DIR, outName);
    fs.writeFileSync(outPath, buffer);
    console.log(`Wrote ${outPath} (${buffer.length} bytes)`);
    key.packs.push({
      file: outName,
      folder: cs.folder,
      title: cs.title,
      passwords: cs.passwords,
    });
  }

  const keyPath = path.join(ROOT, 'examples', 'case-studies', 'PASSWORD_KEY.json');
  fs.writeFileSync(keyPath, JSON.stringify(key, null, 2));
  console.log(`Wrote ${keyPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
