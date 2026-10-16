import { ZipReader, BlobReader, TextWriter, Uint8ArrayWriter } from '@zip.js/zip.js';
import * as XLSX from 'xlsx';
import { ParsedFile, SheetData } from './types';

export class ZipEngineError extends Error {
  code: 'PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | 'EXTRACTION_FAILED';

  constructor(code: 'PASSWORD_REQUIRED' | 'INVALID_PASSWORD' | 'EXTRACTION_FAILED', message: string) {
    super(message);
    this.name = 'ZipEngineError';
    this.code = code;
  }
}

/**
 * Extracts a ZIP archive strictly in-memory within the client's browser RAM.
 * No data is written to the user's hard drive or persistent disk storage.
 *
 * @param zipBlob The raw binary ZIP Blob fetched from AWS S3 Presigned GET URL
 * @param password Optional password for AES / ZipCrypto encrypted entries
 * @param allowedCopyFilename Whitelisted filename permitted for clipboard copy operations
 */
export async function extractZipInBrowser(
  zipBlob: Blob,
  password?: string,
  allowedCopyFilename: string = ''
): Promise<ParsedFile[]> {
  try {
    const blobReader = new BlobReader(zipBlob);
    const zipReader = new ZipReader(blobReader, { password });
    const entries = await zipReader.getEntries();

    const parsedFiles: ParsedFile[] = [];

    for (const entry of entries) {
      // Skip directory entries and hidden/OS metadata files
      if (
        entry.directory ||
        entry.filename.startsWith('__MACOSX/') ||
        entry.filename.includes('/.DS_Store') ||
        entry.filename.endsWith('.DS_Store')
      ) {
        continue;
      }

      const basename = entry.filename.split('/').pop() || entry.filename;
      const lowerBasename = basename.toLowerCase();
      const isCopyAllowed =
        Boolean(allowedCopyFilename) &&
        lowerBasename === allowedCopyFilename.trim().toLowerCase();

      // Check if entry requires a password
      if (entry.encrypted && !password) {
        await zipReader.close();
        throw new ZipEngineError(
          'PASSWORD_REQUIRED',
          `Archive contains encrypted file '${basename}' requiring a decryption password.`
        );
      }

      try {
        if (
          lowerBasename.endsWith('.txt') ||
          lowerBasename.endsWith('.md') ||
          lowerBasename.endsWith('.json') ||
          lowerBasename.endsWith('.py') ||
          lowerBasename.endsWith('.js') ||
          lowerBasename.endsWith('.html') ||
          lowerBasename.endsWith('.css')
        ) {
          // Extract text content
          const textWriter = new TextWriter();
          const content = await entry.getData(textWriter, { password });
          const fileType = lowerBasename.endsWith('.md') ? 'markdown' : 'text';

          parsedFiles.push({
            name: basename,
            path: entry.filename,
            type: fileType,
            size: entry.uncompressedSize,
            content,
            isCopyAllowed,
          });
        } else if (
          lowerBasename.endsWith('.xlsx') ||
          lowerBasename.endsWith('.xls') ||
          lowerBasename.endsWith('.csv')
        ) {
          // Extract spreadsheet binary and parse via SheetJS in RAM
          const uintWriter = new Uint8ArrayWriter();
          const uint8Array = await entry.getData(uintWriter, { password });

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

            const rowCount = rawData.length;
            const columnCount = rawData.reduce(
              (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
              0
            );

            return {
              sheetName,
              data: rawData,
              rowCount,
              columnCount,
            };
          });

          parsedFiles.push({
            name: basename,
            path: entry.filename,
            type: 'spreadsheet',
            size: entry.uncompressedSize,
            sheets,
            isCopyAllowed,
          });
        } else {
          // Generic binary representation
          parsedFiles.push({
            name: basename,
            path: entry.filename,
            type: 'binary',
            size: entry.uncompressedSize,
            content: `[Binary file preview unavailable for ${basename} (${(entry.uncompressedSize / 1024).toFixed(1)} KB)]`,
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
            `Failed to decrypt '${basename}'. ${password ? 'Invalid password provided.' : 'Password required.'}`
          );
        }
        throw entryErr;
      }
    }

    await zipReader.close();
    return parsedFiles;
  } catch (err: any) {
    if (err instanceof ZipEngineError) {
      throw err;
    }
    const msg = err?.message?.toLowerCase() || '';
    if (msg.includes('password') || msg.includes('encrypted')) {
      throw new ZipEngineError(
        password ? 'INVALID_PASSWORD' : 'PASSWORD_REQUIRED',
        password
          ? 'Incorrect archive password provided.'
          : 'This stage archive is password protected.'
      );
    }
    throw new ZipEngineError('EXTRACTION_FAILED', err?.message || 'Archive decompression failed.');
  }
}
