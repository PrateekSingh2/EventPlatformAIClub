#!/usr/bin/env node
/**
 * Build PDF roster from scripts/data/final-teams-participants.csv
 *
 * Usage: node scripts/generate-final-teams-pdf.mjs
 * Output: scripts/data/final-teams-participants.pdf
 *
 * Uses pdfkit from a local install if present, else /tmp/ep-pdfgen (auto-created).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, '..');
const csvPath = path.join(repoRoot, 'scripts/data/final-teams-participants.csv');
const outPath = path.join(repoRoot, 'scripts/data/final-teams-participants.pdf');

function ensurePdfKit() {
  const localPkg = path.join(repoRoot, 'node_modules/pdfkit');
  if (fs.existsSync(localPkg)) {
    return createRequire(path.join(repoRoot, 'package.json'));
  }
  const tmpRoot = '/tmp/ep-pdfgen';
  const tmpPkg = path.join(tmpRoot, 'node_modules/pdfkit');
  if (!fs.existsSync(tmpPkg)) {
    fs.mkdirSync(tmpRoot, { recursive: true });
    if (!fs.existsSync(path.join(tmpRoot, 'package.json'))) {
      execSync('npm init -y', { cwd: tmpRoot, stdio: 'ignore' });
    }
    execSync('npm install pdfkit --silent', { cwd: tmpRoot, stdio: 'inherit' });
  }
  return createRequire(path.join(tmpRoot, 'package.json'));
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') {
      out.push(cur);
      cur = '';
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function loadRows() {
  const text = fs.readFileSync(csvPath, 'utf8').trim();
  const lines = text.split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line);
    const row = {};
    header.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

const require = ensurePdfKit();
const PDFDocument = require('pdfkit');
const rows = loadRows();
const generated = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
const out = fs.createWriteStream(outPath);
doc.pipe(out);

const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
const col = {
  num: 22,
  team: pageW * 0.22,
  size: 36,
  p: (pageW - 22 - pageW * 0.22 - 36) / 4,
};

doc.fontSize(18).font('Helvetica-Bold').text('Final Teams — Participant Roster', { align: 'left' });
doc.moveDown(0.3);
doc.fontSize(9).font('Helvetica').fillColor('#505050').text(`Squads: ${rows.length}  ·  Generated: ${generated} (IST)`);
doc.moveDown(0.8);
doc.fillColor('#000000');

function drawHeader(y) {
  doc.fontSize(7).font('Helvetica-Bold').fillColor('#ffffff');
  doc.rect(doc.page.margins.left, y, pageW, 16).fill('#1e4078');
  let x = doc.page.margins.left + 4;
  doc.fillColor('#ffffff');
  doc.text('#', x, y + 4, { width: col.num - 4 });
  x += col.num;
  doc.text('Team (merged)', x, y + 4, { width: col.team - 4 });
  x += col.team;
  doc.text('Size', x, y + 4, { width: col.size - 4 });
  x += col.size;
  for (let i = 1; i <= 4; i++) {
    doc.text(`P${i}`, x, y + 4, { width: col.p - 4 });
    x += col.p;
  }
  doc.fillColor('#000000');
  return y + 18;
}

let y = drawHeader(doc.y);
const rowH = 28;
const bottom = doc.page.height - doc.page.margins.bottom;

function ensureSpace(need) {
  if (y + need > bottom) {
    doc.addPage({ size: 'A4', layout: 'landscape', margin: 36 });
    y = drawHeader(doc.page.margins.top);
  }
}

rows.forEach((r, idx) => {
  ensureSpace(rowH);
  if (idx % 2 === 0) {
    doc.rect(doc.page.margins.left, y - 2, pageW, rowH).fill('#f4f6fa');
    doc.fillColor('#000000');
  }
  doc.fontSize(6.5).font('Helvetica');
  let x = doc.page.margins.left + 4;
  const lineY = y + 3;
  doc.text(String(idx + 1), x, lineY, { width: col.num - 4, lineBreak: false });
  x += col.num;
  doc.text(r.team_name_merged || '', x, lineY, { width: col.team - 6, height: rowH - 4 });
  x += col.team;
  doc.text(r.team_size || '', x, lineY, { width: col.size - 4 });
  x += col.size;
  for (const key of ['participant1', 'participant2', 'participant3', 'participant4']) {
    doc.text(r[key] || '', x, lineY, { width: col.p - 6, height: rowH - 4 });
    x += col.p;
  }
  y += rowH;
});

doc.end();
out.on('finish', () => console.log('Wrote', outPath));
