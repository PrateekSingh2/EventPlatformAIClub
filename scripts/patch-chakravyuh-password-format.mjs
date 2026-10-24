/**
 * Adds PASSWORD_FORMAT.md + START_HERE pointer to Chakravyuh case-study ZIPs
 * without re-packaging encrypted STAGE_02.zip entries.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const TARGETS = [
  {
    zip: path.join(ROOT, '../docs/chakravyuh/Chakravyuh_Case_Study_01.zip'),
    rootFolder: 'Chakravyuh_Case_Study_01',
    title: 'Chakravyuh Case Study 01 — The Flash-Sale Collapse',
    stage1Format: 'HHMM-<WORKFLOW>',
    stage1Example: '1234-PROFILE',
    stage1Hints: [
      'HHMM = alert UTC time (24h, no colon)',
      'WORKFLOW = affected workflow token in UPPERCASE',
    ],
  },
  {
    zip: path.join(ROOT, 'apps/web/public/case-study-archive.zip'),
    rootFolder: 'Chakravyuh_Case_Study_02',
    title: 'Chakravyuh Case Study 02',
    stage1Format: 'SEV<N>-<JOURNEY>-<HHMM>',
    stage1Example: 'SEV3-PROFILE-0915',
    stage1Hints: [
      'N = severity level digit from matrix',
      'JOURNEY = driving journey uppercase',
      'HHMM = first minute of qualifying SLO breach (UTC)',
    ],
  },
];

const GLOBAL = `# Unlock password format

| Rule | Requirement |
|------|-------------|
| Case | **UPPERCASE** unless a stage README says otherwise |
| Characters | Letters, digits, hyphen \`-\` only — **no spaces** |
| Arena | Type the derived token exactly in the contest unlock field |
| Source | Derive from evidence in the **current** stage folder README |

Each \`STAGE_XX/README.md\` includes a **PASSWORD** or **Unlock** section with a format template.
Replace placeholders with values from that stage's evidence — example lines show **shape only**.
`;

function passwordFormatMd(meta) {
  const hints = meta.stage1Hints.map((h) => `- ${h}`).join('\n');
  return `# Password format — ${meta.title}

${GLOBAL}

## Stage 01 → \`STAGE_02.zip\`

\`\`\`
${meta.stage1Format}
\`\`\`

${hints}

Example shape only: \`${meta.stage1Example}\`

## Stages 02–12

After each decrypt, open that stage's \`README.md\` for the next \`STAGE_XX.zip\` format template.
Bonus stages (if present) follow the same pattern.
`;
}

function startHereAppend() {
  return `

## Password format (quick link)

See \`PASSWORD_FORMAT.md\` in this folder for global rules and the Stage 01 unlock template.
Every inner \`STAGE_XX/README.md\` documents the next zip password **format** (not the answer).
`;
}

function patchZip(meta) {
  if (!fs.existsSync(meta.zip)) {
    console.warn(`Skip missing ${meta.zip}`);
    return;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chak-patch-'));
  execSync(`unzip -q -o ${JSON.stringify(meta.zip)} -d ${JSON.stringify(tmp)}`);

  const root = path.join(tmp, meta.rootFolder);
  if (!fs.existsSync(root)) {
    throw new Error(`Expected folder ${meta.rootFolder} inside ${meta.zip}`);
  }

  fs.writeFileSync(path.join(root, 'PASSWORD_FORMAT.md'), passwordFormatMd(meta));

  const startHere = path.join(root, 'START_HERE.md');
  if (fs.existsSync(startHere)) {
    let text = fs.readFileSync(startHere, 'utf8');
    if (!text.includes('PASSWORD_FORMAT.md')) {
      fs.writeFileSync(startHere, text.trimEnd() + startHereAppend());
    }
  }

  const rules = path.join(root, 'RULES_AND_SCORING.md');
  if (fs.existsSync(rules)) {
    let text = fs.readFileSync(rules, 'utf8');
    if (!text.includes('PASSWORD_FORMAT.md')) {
      fs.appendFileSync(
        rules,
        `\n- Unlock keys: see \`PASSWORD_FORMAT.md\` and each stage README for **format templates** (UPPERCASE, hyphens, no spaces).\n`
      );
    }
  }

  execSync(`cd ${JSON.stringify(tmp)} && zip -q -r ${JSON.stringify(meta.zip)} ${JSON.stringify(meta.rootFolder)}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`Patched ${meta.zip}`);
}

for (const t of TARGETS) {
  patchZip(t);
}
