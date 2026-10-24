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

  // Strip stage wrapper folder if present (e.g. STAGE_01/, STAGE_02/, BONUS_11/)
  clean = clean.replace(/^(STAGE_\d+|BONUS_\d+|Stage_\d+|bonus_\d+)[/]/i, '');

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
  allowedCopyFilename: string = ''
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

    // 1. Check for nested next-stage zip archive
    let nextZipEntry: any = null;
    for (const entry of validEntries) {
      if (entry.filename.toLowerCase().endsWith('.zip')) {
        nextZipEntry = entry;
        break;
      }
    }

    let nextZipBlob: Blob | undefined;
    let nextZipFilename: string | undefined;

    if (nextZipEntry) {
      nextZipFilename = nextZipEntry.filename.split('/').pop() || nextZipEntry.filename;
      try {
        const uintWriter = new Uint8ArrayWriter();
        const nextZipBytes = await (nextZipEntry as any).getData(uintWriter, { password });
        nextZipBlob = new Blob([nextZipBytes], { type: 'application/zip' });
      } catch (zipExtractErr: any) {
        if (
          zipExtractErr?.message?.toLowerCase().includes('password') ||
          zipExtractErr?.name === 'ZipCryptoError' ||
          zipExtractErr?.name === 'AesError'
        ) {
          await zipReader.close();
          throw new ZipEngineError(
            password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
            'Password required to decrypt nested stage archive.'
          );
        }
        throw zipExtractErr;
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
      hasNextZip: Boolean(nextZipBlob),
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
export async function extractInnerZipBlob(
  outerZipBlob: Blob,
  innerZipEntryName: string
): Promise<Blob> {
  const blobReader = new BlobReader(outerZipBlob);
  const zipReader = new ZipReader(blobReader);
  const entries = await zipReader.getEntries();

  const target = entries.find(
    (e: any) =>
      !e.directory &&
      (e.filename.toLowerCase() === innerZipEntryName.toLowerCase() ||
        e.filename.toLowerCase().endsWith('/' + innerZipEntryName.toLowerCase()) ||
        e.filename.split('/').pop()?.toLowerCase() === innerZipEntryName.toLowerCase())
  );

  if (!target) {
    // If not found by name, pick the first .zip file inside
    const anyZip = entries.find((e: any) => !e.directory && e.filename.toLowerCase().endsWith('.zip'));
    if (anyZip) {
      const uintWriter = new Uint8ArrayWriter();
      const uint8Array = await (anyZip as any).getData(uintWriter);
      await zipReader.close();
      return new Blob([uint8Array], { type: 'application/zip' });
    }

    await zipReader.close();
    throw new ZipEngineError(
      'EXTRACTION_FAILED',
      `Inner archive "${innerZipEntryName}" not found in outer ZIP.`
    );
  }

  const uintWriter = new Uint8ArrayWriter();
  const uint8Array = await (target as any).getData(uintWriter);
  await zipReader.close();
  return new Blob([uint8Array], { type: 'application/zip' });
}

/**
 * Lists all file entries inside an outer ZIP blob without extracting.
 */
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
