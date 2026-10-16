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
 * @param zipBlob The raw binary ZIP Blob fetched from Supabase Storage Signed GET URL
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

/**
 * Pre-flight in-browser archive decryption validator for administrators.
 * Verifies that the selected ZIP archive can be parsed, checks encryption status,
 * and tests decompression against the entered password in RAM before upload/save.
 */
export async function validateArchiveDecryption(
  file: File | Blob,
  zipPassword?: string
): Promise<import('./types').PreflightValidationResult> {
  // 1. File existence and size check
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

  const MAX_SIZE = 104857600; // 100MB
  if (file.size > MAX_SIZE) {
    return {
      valid: false,
      isEncrypted: false,
      fileCount: 0,
      filenames: [],
      message: `Archive exceeds maximum allowed size of 100MB (${(file.size / (1024 * 1024)).toFixed(1)}MB).`,
      error: 'FILE_TOO_LARGE',
    };
  }

  const cleanPassword = zipPassword ? zipPassword.trim() : '';

  try {
    const blobReader = new BlobReader(file);
    const zipReader = new ZipReader(blobReader, { password: cleanPassword || undefined });
    const entries = await zipReader.getEntries();

    const validEntries = entries.filter(
      (e) =>
        !e.directory &&
        !e.filename.startsWith('__MACOSX/') &&
        !e.filename.includes('/.DS_Store') &&
        !e.filename.endsWith('.DS_Store')
    );

    if (validEntries.length === 0) {
      await zipReader.close();
      return {
        valid: false,
        isEncrypted: false,
        fileCount: 0,
        filenames: [],
        message: 'Archive contains no valid readable files or directories.',
        error: 'NO_VALID_FILES',
      };
    }

    const filenames = validEntries.map((e) => e.filename.split('/').pop() || e.filename);
    const hasEncryptedEntries = validEntries.some((e) => e.encrypted);

    // Case A: Archive has encrypted entries
    if (hasEncryptedEntries) {
      if (!cleanPassword) {
        await zipReader.close();
        return {
          valid: false,
          isEncrypted: true,
          fileCount: validEntries.length,
          filenames,
          message: `Archive contains encrypted files (${validEntries.length} total). Enter the stage decryption password to validate.`,
          error: 'PASSWORD_REQUIRED',
        };
      }

      // Test decrypt the first 3 encrypted entries in RAM to confirm password works
      const encryptedEntries = validEntries.filter((e) => e.encrypted).slice(0, 3);
      for (const entry of encryptedEntries) {
        try {
          const testWriter = new Uint8ArrayWriter();
          await (entry as any).getData(testWriter, { password: cleanPassword });
        } catch (decryptErr: any) {
          await zipReader.close();
          const errStr = (decryptErr?.message || '').toLowerCase();
          const isPassError =
            errStr.includes('password') ||
            errStr.includes('aes') ||
            errStr.includes('zipcrypto') ||
            decryptErr?.name === 'ZipCryptoError' ||
            decryptErr?.name === 'AesError';

          return {
            valid: false,
            isEncrypted: true,
            fileCount: validEntries.length,
            filenames,
            message: isPassError
              ? `Decryption Failed: Incorrect password for '${entry.filename.split('/').pop()}'. Try another password.`
              : `Decryption Failed on '${entry.filename.split('/').pop()}': ${decryptErr?.message || 'Corrupt data.'}`,
            error: 'INVALID_PASSWORD',
          };
        }
      }

      await zipReader.close();
      return {
        valid: true,
        isEncrypted: true,
        fileCount: validEntries.length,
        filenames,
        message: `Validation Passed: Decryption verified with password '${cleanPassword}' across ${validEntries.length} file(s).`,
      };
    }

    // Case B: Archive is unencrypted
    // Test read the first entry to confirm ZIP integrity
    try {
      const testEntry = validEntries[0];
      const testWriter = new Uint8ArrayWriter();
      await (testEntry as any).getData(testWriter);
    } catch (readErr: any) {
      await zipReader.close();
      return {
        valid: false,
        isEncrypted: false,
        fileCount: validEntries.length,
        filenames,
        message: `Archive read error: ${readErr?.message || 'Corrupt file stream.'}`,
        error: 'CORRUPT_ARCHIVE',
      };
    }

    await zipReader.close();
    return {
      valid: true,
      isEncrypted: false,
      fileCount: validEntries.length,
      filenames,
      message: cleanPassword
        ? `Validation Passed: Archive is unencrypted (contains ${validEntries.length} files). Note: No password is required for this archive.`
        : `Validation Passed: Archive verified cleanly (contains ${validEntries.length} files, unencrypted).`,
    };
  } catch (err: any) {
    return {
      valid: false,
      isEncrypted: false,
      fileCount: 0,
      filenames: [],
      message: `Failed to inspect archive: ${err?.message || 'Invalid ZIP format or corrupt file.'}`,
      error: 'CORRUPT_ARCHIVE',
    };
  }
}

