import fs from 'fs';
import path from 'path';
import bundledMain from '../../data/PASSWORD_KEY.json';
import bundledChak from '../../data/chakravyuh-password-key.json';

export type CaseStudyPackKeys = {
  file?: string;
  folder?: string;
  title?: string;
  passwords: Record<string, string>;
};

/** Supabase pool folder name → PASSWORD_KEY.json `folder` */
export const POOL_KEY_TO_PACK_FOLDER: Record<string, string> = {
  chakravyuh_case_study_01: 'Chakravyuh_Case_Study_01',
  chakravyuh_case_study_02: 'Chakravyuh_Case_Study_02',
  case_study_03_helix_grid: 'Case_Study_03_Helix_Grid',
  case_study_04_mumbai_mint: 'Case_Study_04_Mumbai_Mint',
  case_study_05_packet_forge: 'Case_Study_05_Packet_Forge',
  case_study_06_satellite_kite: 'Case_Study_06_Satellite_Kite',
  case_study_07_biolab_delta: 'Case_Study_07_BioLab_Delta',
  case_study_08_tradewind: 'Case_Study_08_TradeWind',
  case_study_09_cloudcastle: 'Case_Study_09_CloudCastle',
  case_study_10_ridge_protocol: 'Case_Study_10_Ridge_Protocol',
};

let cachedCatalog: CaseStudyPackKeys[] | null = null;

function resolvePasswordKeyPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'data/PASSWORD_KEY.json'),
    path.join(cwd, 'apps/web/data/PASSWORD_KEY.json'),
    path.join(cwd, 'examples/case-studies/PASSWORD_KEY.json'),
    path.join(cwd, '../../examples/case-studies/PASSWORD_KEY.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function resolveChakravyuhKeyPath(): string | null {
  const cwd = process.cwd();
  const candidates = [
    path.join(cwd, 'data/chakravyuh-password-key.json'),
    path.join(cwd, 'apps/web/data/chakravyuh-password-key.json'),
    path.join(cwd, 'examples/case-studies/chakravyuh-password-key.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function mergePasswordCatalog(
  main: { packs?: CaseStudyPackKeys[] },
  chak: { packs?: CaseStudyPackKeys[] }
): CaseStudyPackKeys[] {
  const packs = [...(main.packs || [])];
  const seen = new Set(packs.map((p) => p.folder || p.file));
  for (const p of chak.packs || []) {
    const id = p.folder || p.file;
    if (id && !seen.has(id)) {
      packs.unshift(p);
      seen.add(id);
    }
  }
  return packs;
}

export function loadCaseStudyPasswordCatalog(): CaseStudyPackKeys[] {
  if (cachedCatalog) return cachedCatalog;

  // Bundled at build time so Vercel/serverless always has keys (fs paths are unreliable).
  let packs = mergePasswordCatalog(
    bundledMain as { packs?: CaseStudyPackKeys[] },
    bundledChak as { packs?: CaseStudyPackKeys[] }
  );

  const mainPath = resolvePasswordKeyPath();
  if (mainPath) {
    try {
      const parsed = JSON.parse(fs.readFileSync(mainPath, 'utf8')) as { packs?: CaseStudyPackKeys[] };
      packs = mergePasswordCatalog(parsed, { packs });
    } catch {
      /* keep bundled */
    }
  }

  cachedCatalog = packs;
  return cachedCatalog;
}

export function poolKeyFromStoragePath(storagePath: string): string | null {
  const clean = storagePath
    .replace(/^\/+/, '')
    .trim()
    .replace(/^stages\//, '');
  const m = clean.match(/(?:^|\/)case-study-pool\/([^/]+)\/archive\.zip$/i);
  return m ? m[1] : null;
}

export function getPackPasswordsByPoolKey(poolKey: string): Record<string, string> | null {
  const folder = POOL_KEY_TO_PACK_FOLDER[poolKey];
  if (!folder) return null;
  const pack = loadCaseStudyPasswordCatalog().find((p) => p.folder === folder);
  return pack?.passwords ?? null;
}

export function getPackPasswordsByStoragePath(storagePath: string): Record<string, string> | null {
  const poolKey = poolKeyFromStoragePath(storagePath);
  if (poolKey) return getPackPasswordsByPoolKey(poolKey);
  return null;
}

export function getStagePasswordForStoragePath(
  storagePath: string,
  stageNum: number
): string | null {
  const map = getPackPasswordsByStoragePath(storagePath);
  if (!map) return null;
  const pw = map[String(stageNum)] ?? map[stageNum as unknown as string];
  return pw ? String(pw).trim() : null;
}

/** Stages 2–12 in order for `stage_passwords` bulk insert */
export function passwordArrayForPoolKey(poolKey: string): string[] | undefined {
  const map = getPackPasswordsByPoolKey(poolKey);
  if (!map) return undefined;
  const out: string[] = [];
  for (let s = 2; s <= 12; s++) {
    const pw = map[String(s)];
    if (!pw) return undefined;
    out.push(String(pw).trim());
  }
  return out;
}

export function passwordMatchesCaseStudyStage(
  storagePath: string | null | undefined,
  stageNum: number,
  password: string
): boolean {
  if (!storagePath) return false;
  const expected = getStagePasswordForStoragePath(storagePath, stageNum);
  if (!expected) return false;
  return expected.trim().toUpperCase() === password.trim().toUpperCase();
}
