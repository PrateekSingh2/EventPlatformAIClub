import { ZipReader, BlobReader, TextWriter, Uint8ArrayWriter } from '@zip.js/zip.js';
import * as XLSX from 'xlsx';
import { ParsedFile, SheetData, ExtractedStageResult, PreflightValidationResult } from './types';

export class ZipEngineError extends Error {
  code: 'PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | 'EXTRACTION_FAILED';

  constructor(code: 'PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | 'EXTRACTION_FAILED', message: string) {
    super(message);
    this.name = 'ZipEngineError';
    this.code = code;
  }
}

const TEXT_EXTENSIONS = new Set([
  'txt', 'md', 'json', 'py', 'js', 'ts', 'jsx', 'tsx', 'html', 'css',
  'log', 'patch', 'diff', 'sql', 'env', 'sh', 'bash', 'yml', 'yaml',
  'ini', 'conf', 'cfg', 'xml', 'prompt', 'toml', 'properties'
]);

/**
 * Computes a clean relative path for a file inside a stage archive.
 * Automatically strips root archive wrapper directories (e.g. "Chakravyuh_Case_Study_02/")
 * and stage folder prefixes (e.g. "STAGE_01/", "STAGE_02/", "BONUS_11/") so files
 * inside folders like "evidence/pager_feed.txt" are cleanly organized.
 */
export function cleanRelativePath(
  rawFilename: string,
  allArchivePaths: string[] = []
): { relativePath: string; folder: string; name: string } {
  let clean = rawFilename.replace(/\\/g, '/').replace(/^\/+/, '');

  // Check if all entries share a single common root folder (e.g. "Chakravyuh_Case_Study_02/")
  if (allArchivePaths.length > 0) {
    const firstSlash = clean.indexOf('/');
    if (firstSlash > 0) {
      const candidateRoot = clean.slice(0, firstSlash + 1);
      const allShare = allArchivePaths.every((p) => {
        const norm = p.replace(/\\/g, '/').replace(/^\/+/, '');
        return norm.startsWith(candidateRoot);
      });
      if (allShare) {
        clean = clean.slice(firstSlash + 1);
      }
    }
  }

  // Strip stage wrapper folder if present (e.g. STAGE_01/, stage1/, BONUS_11/)
  clean = clean.replace(/^(STAGE_\d+|BONUS_\d+|Stage_\d+|bonus_\d+|stage\d+)[/\\]/i, '');

  const parts = clean.split('/');
  const name = parts.pop() || clean;
  const folder = parts.length > 0 ? parts.join('/') : '';

  return {
    relativePath: clean,
    folder,
    name,
  };
}

/**
 * Extracts a stage archive in browser RAM.
 * - Extracts all stage files (markdown, text, logs, code, spreadsheets)
 * - Directly preserves and classifies folder hierarchies (e.g. evidence/)
 * - Identifies any nested stage .zip file and extracts it as a Blob for the next stage
 * - If no inner .zip exists, marks this stage as the terminal / final level
 */
export async function extractStageArchiveInBrowser(
  zipBlob: Blob,
  password?: string,
  allowedCopyFilename: string = '',
  currentStageNumber: number = 1
): Promise<ExtractedStageResult> {
  try {
    const blobReader = new BlobReader(zipBlob);
    const zipReader = new ZipReader(blobReader, { password });
    const rawEntries = await zipReader.getEntries();

    // Filter out OS junk
    const validEntries = rawEntries.filter(
      (e) =>
        !e.directory &&
        !e.filename.startsWith('__MACOSX/') &&
        !e.filename.includes('/__MACOSX/') &&
        !e.filename.includes('.DS_Store') &&
        !e.filename.endsWith('.DS_Store')
    );

    const allPaths = validEntries.map((e) => e.filename);

    // 1. Check for nested next-stage zip archive (prefer stage2.zip, stage3.zip, … over arbitrary .zip)
    const nextZipEntry = pickNextStageZipEntry(validEntries, currentStageNumber);

    let nextZipBlob: Blob | undefined;
    let nextZipFilename: string | undefined;

    if (nextZipEntry) {
      nextZipFilename = nextZipEntry.filename.split('/').pop() || nextZipEntry.filename;
      const nestedEncrypted = Boolean((nextZipEntry as any).encrypted);
      if (nestedEncrypted && !password) {
        // Case-study outer layout: STAGE_02.zip is present but locked until unlock flow.
        nextZipBlob = undefined;
      } else {
        try {
          const uintWriter = new Uint8ArrayWriter();
          const nextZipBytes = await (nextZipEntry as any).getData(
            uintWriter,
            password ? { password } : undefined
          );
          nextZipBlob = new Blob([nextZipBytes], { type: 'application/zip' });
        } catch (zipExtractErr: any) {
          if (
            zipExtractErr?.message?.toLowerCase().includes('password') ||
            zipExtractErr?.name === 'ZipCryptoError' ||
            zipExtractErr?.name === 'AesError'
          ) {
            if (password && nestedEncrypted) {
              // Current unlock key is not for the *next* nested stage zip (different password per stage).
              nextZipBlob = undefined;
            } else {
              await zipReader.close();
              throw new ZipEngineError(
                password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
                'Password required to decrypt nested stage archive.'
              );
            }
          } else {
            throw zipExtractErr;
          }
        }
      }
    }

    // 2. Extract all non-zip files
    const parsedFiles: ParsedFile[] = [];
    let detectedStageTitle: string | undefined;

    for (const entry of validEntries) {
      // Skip the nested zip file from the editor view so it doesn't show as binary noise
      if (entry === nextZipEntry) continue;

      const { relativePath, folder, name } = cleanRelativePath(entry.filename, allPaths);
      const lowerBasename = name.toLowerCase();
      const ext = lowerBasename.split('.').pop() || '';

      const isCopyAllowed =
        Boolean(allowedCopyFilename) &&
        (lowerBasename === allowedCopyFilename.trim().toLowerCase() ||
          lowerBasename.includes('prompt'));

      if (entry.encrypted && !password) {
        await zipReader.close();
        throw new ZipEngineError(
          'PASSWORD_REQUIRED',
          `Archive contains encrypted file '${name}' requiring a decryption password.`
        );
      }

      try {
        if (ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv') {
          // Spreadsheet extraction
          const uintWriter = new Uint8ArrayWriter();
          const uint8Array = await (entry as any).getData(uintWriter, { password });

          const workbook = XLSX.read(uint8Array, {
            type: 'array',
            cellDates: true,
          });

          const sheets: SheetData[] = workbook.SheetNames.map((sheetName) => {
            const worksheet = workbook.Sheets[sheetName];
            const rawData = XLSX.utils.sheet_to_json(worksheet, {
              header: 1,
              defval: '',
              raw: false,
            }) as (string | number | boolean | null)[][];

            return {
              sheetName,
              data: rawData,
              rowCount: rawData.length,
              columnCount: rawData.reduce(
                (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
                0
              ),
            };
          });

          // For CSV / TSV, also extract plain text content for source inspection
          let rawText: string | undefined;
          if (ext === 'csv' || ext === 'tsv') {
            try {
              const decoder = new TextDecoder('utf-8');
              rawText = decoder.decode(uint8Array);
            } catch {}
          }

          parsedFiles.push({
            name,
            path: entry.filename,
            relativePath,
            folder,
            type: 'spreadsheet',
            size: entry.uncompressedSize,
            sheets,
            content: rawText,
            isCopyAllowed,
          });
        } else if (TEXT_EXTENSIONS.has(ext)) {
          // Text / Code / Log / Markdown
          const textWriter = new TextWriter();
          const content = await (entry as any).getData(textWriter, { password });
          const fileType = ext === 'md' ? 'markdown' : 'text';

          // Extract title if this is README.md or START_HERE.md
          if (!detectedStageTitle && (name === 'README.md' || name === 'START_HERE.md')) {
            const firstHeaderMatch = content.match(/^#\s+([^\r\n]+)/m);
            if (firstHeaderMatch && firstHeaderMatch[1]) {
              detectedStageTitle = firstHeaderMatch[1].trim();
            }
          }

          parsedFiles.push({
            name,
            path: entry.filename,
            relativePath,
            folder,
            type: fileType,
            size: entry.uncompressedSize,
            content,
            isCopyAllowed,
          });
        } else {
          // Generic binary representation
          parsedFiles.push({
            name,
            path: entry.filename,
            relativePath,
            folder,
            type: 'binary',
            size: entry.uncompressedSize,
            content: `[Binary file: ${name} (${(entry.uncompressedSize / 1024).toFixed(1)} KB)]`,
            isCopyAllowed,
          });
        }
      } catch (entryErr: any) {
        if (
          entryErr?.message?.toLowerCase().includes('password') ||
          entryErr?.message?.toLowerCase().includes('encrypted') ||
          entryErr?.name === 'ZipCryptoError' ||
          entryErr?.name === 'AesError'
        ) {
          await zipReader.close();
          throw new ZipEngineError(
            password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
            `Failed to decrypt '${name}'. ${password ? 'Invalid password provided.' : 'Password required.'}`
          );
        }
        throw entryErr;
      }
    }

    await zipReader.close();

    // Natural sorting: README.md and START_HERE.md first, then folders, then other files
    parsedFiles.sort((a, b) => {
      const isTopA = a.name === 'START_HERE.md' ? 2 : a.name === 'README.md' ? 1 : 0;
      const isTopB = b.name === 'START_HERE.md' ? 2 : b.name === 'README.md' ? 1 : 0;
      if (isTopA !== isTopB) return isTopB - isTopA;
      if ((a.folder || '') !== (b.folder || '')) {
        return (a.folder || '').localeCompare(b.folder || '');
      }
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    return {
      files: parsedFiles,
      hasNextZip: Boolean(nextZipBlob || nextZipEntry),
      nextZipBlob,
      nextZipFilename,
      stageTitle: detectedStageTitle,
    };
  } catch (err: any) {
    if (err instanceof ZipEngineError) throw err;
    const msg = (err?.message || '').toLowerCase();
    if (msg.includes('password') || msg.includes('encrypted') || err?.name === 'ZipCryptoError' || err?.name === 'AesError') {
      throw new ZipEngineError(
        password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
        password ? 'Incorrect archive password provided.' : 'This stage archive is password protected.'
      );
    }
    throw new ZipEngineError('EXTRACTION_FAILED', err?.message || 'Archive decompression failed.');
  }
}

/**
 * Legacy wrapper: extracts archive entries to ParsedFile[] array.
 */
export async function extractZipInBrowser(
  zipBlob: Blob,
  password?: string,
  allowedCopyFilename: string = ''
): Promise<ParsedFile[]> {
  const result = await extractStageArchiveInBrowser(zipBlob, password, allowedCopyFilename);
  return result.files;
}

/**
 * Extracts a single inner (nested) ZIP file entry from an outer ZIP blob.
 */
/** Basenames used for nested stage archives (demo + case-study packs). */
export function stageZipBasenames(stageNum: number): string[] {
  const pad = String(stageNum).padStart(2, '0');
  return [`stage${stageNum}.zip`, `stage_${stageNum}.zip`, `STAGE_${pad}.zip`, `Stage_${pad}.zip`];
}

export async function extractInnerZipBlob(
  outerZipBlob: Blob,
  innerZipEntryName: string,
  password?: string
): Promise<Blob> {
  const blobReader = new BlobReader(outerZipBlob);
  const zipReader = new ZipReader(blobReader, password ? { password } : undefined);
  const entries = await zipReader.getEntries();

  const target = entries.find(
    (e: any) =>
      !e.directory &&
      (e.filename.toLowerCase() === innerZipEntryName.toLowerCase() ||
        e.filename.toLowerCase().endsWith('/' + innerZipEntryName.toLowerCase()) ||
        e.filename.split('/').pop()?.toLowerCase() === innerZipEntryName.toLowerCase())
  );

  if (!target) {
    await zipReader.close();
    throw new ZipEngineError(
      'EXTRACTION_FAILED',
      `Inner archive "${innerZipEntryName}" not found in outer ZIP.`
    );
  }

  if ((target as any).encrypted && !password) {
    await zipReader.close();
    throw new ZipEngineError(
      'PASSWORD_REQUIRED',
      'Password required to decrypt nested stage archive.'
    );
  }

  const uintWriter = new Uint8ArrayWriter();
  const uint8Array = await (target as any).getData(uintWriter, password ? { password } : undefined);
  await zipReader.close();
  return new Blob([uint8Array], { type: 'application/zip' });
}

/** Pull stage N's nested zip from an outer team archive (supports STAGE_NN.zip naming). */
export async function extractStageZipFromOuter(
  outerZipBlob: Blob,
  stageNum: number,
  password?: string
): Promise<Blob> {
  for (const name of stageZipBasenames(stageNum)) {
    try {
      return await extractInnerZipBlob(outerZipBlob, name, password);
    } catch (err) {
      if (err instanceof ZipEngineError && err.code === 'EXTRACTION_FAILED') continue;
      throw err;
    }
  }
  throw new ZipEngineError('EXTRACTION_FAILED', `Stage ${stageNum} nested archive not found in outer ZIP.`);
}

/** True when `password` decrypts `STAGE_NN.zip` inside the team archive (unlock check only). */
export async function verifyStageUnlockPassword(
  outerTokenArchive: Blob,
  stageNumber: number,
  password: string
): Promise<boolean> {
  const clean = password.trim();
  if (!clean || stageNumber < 2) return false;
  try {
    await extractStageZipFromOuter(outerTokenArchive, stageNumber, clean);
    return true;
  } catch {
    return false;
  }
}

/**
 * Lists all file entries inside an outer ZIP blob without extracting.
 */
function pickNextStageZipEntry(
  validEntries: { filename: string; directory?: boolean; encrypted?: boolean }[],
  currentStage = 1
) {
  const zips = validEntries.filter((e) => !e.directory && e.filename.toLowerCase().endsWith('.zip'));
  if (zips.length === 0) return null;

  const numbered = zips
    .map((entry) => {
      const base = entry.filename.split('/').pop() || entry.filename;
      const match = base.match(/^(?:stage_?|STAGE_)(\d+)\.zip$/i);
      return match ? { entry, stageNum: parseInt(match[1], 10) } : null;
    })
    .filter((x): x is { entry: (typeof zips)[0]; stageNum: number } => x !== null)
    .sort((a, b) => a.stageNum - b.stageNum);

  const explicitNext = numbered.find((x) => x.stageNum > currentStage);
  if (explicitNext) return explicitNext.entry;

  if (currentStage === 1) {
    const notStage1 = zips.find((e) => {
      const base = e.filename.split('/').pop() || '';
      return !/^(?:stage_?1|STAGE_01)\.zip$/i.test(base);
    });
    return notStage1 || zips[0];
  }

  return zips[0];
}

/** Count stage slots referenced inside an outer team archive (stage folders + stageN.zip). */
export async function countStagesInOuterArchive(blob: Blob): Promise<number> {
  const entries = await listZipEntries(blob);
  const stageNums = new Set<number>([1]);

  for (const entry of entries) {
    const zipMatch = entry.filename.match(/(?:^|[/\\])(?:stage_?|STAGE_)(\d+)\.zip$/i);
    if (zipMatch) stageNums.add(parseInt(zipMatch[1], 10));

    const dirMatch = entry.filename.match(/(?:^|[/\\])(?:stage_?|STAGE_)(\d+)[/\\]/i);
    if (dirMatch) stageNums.add(parseInt(dirMatch[1], 10));
  }

  return Math.max(...stageNums);
}

/**
 * Stage 1 blob: prefer embedded stage1.zip; otherwise the outer archive (nested-chain format).
 */
export async function resolveStageOneBlob(outerZipBlob: Blob): Promise<Blob> {
  try {
    return await extractInnerZipBlob(outerZipBlob, 'stage1.zip');
  } catch {
    return outerZipBlob;
  }
}

/**
 * Resolves the ZIP blob for stage N unlock / decryption (bundle `stageN.zip` or nested chain).
 */
export async function resolveNextStageZipBlob(
  outerTokenArchive: Blob,
  nextStageNumber: number,
  options?: {
    prefetched?: Blob | null;
    stagePasswords?: Record<number, string>;
  }
): Promise<Blob | null> {
  if (options?.prefetched) return options.prefetched;
  if (nextStageNumber < 2) return null;

  const passwords = options?.stagePasswords ?? {};

  try {
    return await extractStageZipFromOuter(outerTokenArchive, nextStageNumber, passwords[nextStageNumber]);
  } catch (err) {
    if (err instanceof ZipEngineError && err.code === 'PASSWORD_REQUIRED' && !passwords[nextStageNumber]) {
      return null;
    }
    if (!(err instanceof ZipEngineError && err.code === 'EXTRACTION_FAILED')) {
      throw err;
    }
  }

  try {
    let currentBlob = await resolveStageOneBlob(outerTokenArchive);
    for (let stage = 2; stage <= nextStageNumber; stage++) {
      const stagePass = passwords[stage];
      try {
        currentBlob = await extractStageZipFromOuter(currentBlob, stage, stagePass);
        continue;
      } catch (innerErr) {
        if (innerErr instanceof ZipEngineError && innerErr.code === 'PASSWORD_REQUIRED' && !stagePass) {
          return null;
        }
        if (!(innerErr instanceof ZipEngineError && innerErr.code === 'EXTRACTION_FAILED')) {
          throw innerErr;
        }
      }

      const parentStage = stage - 1;
      const parentPass = parentStage >= 2 ? passwords[parentStage] : undefined;
      const extracted = await extractStageArchiveInBrowser(currentBlob, parentPass, '', parentStage);
      if (extracted.nextZipBlob) {
        currentBlob = extracted.nextZipBlob;
        continue;
      }
      if (extracted.hasNextZip) {
        if (!stagePass) return null;
        const withPass = await extractStageArchiveInBrowser(currentBlob, stagePass, '', parentStage);
        if (!withPass.nextZipBlob) return null;
        currentBlob = withPass.nextZipBlob;
        continue;
      }
      if (stage === nextStageNumber) return currentBlob;
      return null;
    }
    return currentBlob;
  } catch {
    return null;
  }
}

/** Pick a sensible default file tab after stage extraction. */
export function pickDefaultStageFile(files: ParsedFile[]): ParsedFile | undefined {
  if (files.length === 0) return undefined;
  return (
    files.find((f) => f.name.toLowerCase() === 'ai_tutor_prompt.txt') ||
    files.find((f) => f.name.toLowerCase() === 'ai_prompt.txt') ||
    files.find((f) => f.name.toLowerCase().includes('prompt')) ||
    files.find((f) => f.name.toLowerCase().includes('tutor')) ||
    files.find((f) => f.name === 'START_HERE.md') ||
    files.find((f) => f.name === 'README.md') ||
    files[0]
  );
}

export async function listZipEntries(
  outerZipBlob: Blob
): Promise<Array<{ filename: string; directory: boolean; size: number; encrypted: boolean }>> {
  const blobReader = new BlobReader(outerZipBlob);
  const zipReader = new ZipReader(blobReader);
  const entries = await zipReader.getEntries();
  const result = entries
    .filter(
      (e: any) =>
        !e.filename.startsWith('__MACOSX/') &&
        !e.filename.includes('/.DS_Store') &&
        !e.filename.endsWith('.DS_Store')
    )
    .map((e: any) => ({
      filename: e.filename,
      directory: e.directory,
      size: e.uncompressedSize || 0,
      encrypted: e.encrypted || false,
    }));
  await zipReader.close();
  return result;
}

/**
 * Pre-flight in-browser archive decryption validator for administrators.
 */
export async function validateArchiveDecryption(
  file: File | Blob,
  zipPassword?: string
): Promise<PreflightValidationResult> {
  if (!file || file.size === 0) {
    return {
      valid: false,
      isEncrypted: false,
      fileCount: 0,
      filenames: [],
      message: 'Selected archive is empty (0 bytes).',
      error: 'EMPTY_ARCHIVE',
    };
  }

  const cleanPassword = zipPassword ? zipPassword.trim() : '';

  try {
    const result = await extractStageArchiveInBrowser(file, cleanPassword || undefined);
    return {
      valid: true,
      isEncrypted: Boolean(cleanPassword),
      fileCount: result.files.length,
      filenames: result.files.map((f) => f.relativePath || f.name),
      message: `Archive successfully validated (${result.files.length} readable files${result.hasNextZip ? ', contains next nested stage ZIP: ' + result.nextZipFilename : ', terminal stage'})`,
    };
  } catch (err: any) {
    const isPass = err?.code === 'PASSWORD_REQUIRED' || err?.code === 'INVALID_PASSWORD';
    return {
      valid: false,
      isEncrypted: true,
      fileCount: 0,
      filenames: [],
      message: err.message || 'Validation error',
      error: isPass ? err.code : 'CORRUPT_ARCHIVE',
    };
  }
}
