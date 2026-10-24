import { getSupabaseAdmin } from '@/lib/supabase';

export const STAGES_BUCKET = 'stages';

/**
 * Ensures that the private 'stages' bucket exists in Supabase Storage.
 * Called lazily when uploading or requesting signed URLs.
 */
export async function ensureStagesBucketExists(): Promise<void> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) {
      console.warn('[Supabase Storage] Warning listing buckets:', listError.message);
      return;
    }

    const bucketExists = buckets?.some((b: any) => b.name === STAGES_BUCKET || b.id === STAGES_BUCKET);
    if (!bucketExists) {
      const { error: createError } = await supabaseAdmin.storage.createBucket(STAGES_BUCKET, {
        public: false,
        fileSizeLimit: 52428800, // 50MB limit per stage ZIP
        allowedMimeTypes: ['application/zip', 'application/x-zip-compressed'],
      });
      if (createError) {
        console.warn('[Supabase Storage] Could not auto-create bucket:', createError.message);
      }
    }
  } catch (err: any) {
    console.warn('[Supabase Storage] Exception ensuring bucket:', err.message);
  }
}

/**
 * Generates a Supabase Storage Signed Upload URL for Admin direct browser-to-storage uploads.
 * Offloads all file handling to the client browser (0 Netlify server memory overhead).
 * Valid for 300 seconds (5 minutes).
 */
export async function createAdminUploadUrl(
  stageNumber: number,
  filename: string
): Promise<{ uploadUrl: string; token: string; storagePath: string; s3Key: string; expiresIn: number }> {
  await ensureStagesBucketExists();
  const supabaseAdmin = getSupabaseAdmin();

  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `stage-${stageNumber}/${Date.now()}-${cleanFilename}`;
  const expiresIn = 300; // 5 minutes

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create Supabase signed upload URL');
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path || storagePath,
    s3Key: data.path || storagePath, // Alias for backward compatibility
    expiresIn,
  };
}

/**
 * Generates a short-lived (60s) Supabase Storage Signed Download URL for Participant archive retrieval.
 * The URL expires in 60 seconds to prevent unauthorized external distribution.
 */
export async function createParticipantDownloadUrl(
  storagePath: string
): Promise<{ downloadUrl: string; expiresIn: number }> {
  const supabaseAdmin = getSupabaseAdmin();
  const expiresIn = 60; // 60 seconds

  // Clean path in case it was stored with a leading prefix or bucket name
  const cleanPath = storagePath.replace(/^stages\//, '').replace(/^\/+/, '');

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUrl(cleanPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || `Failed to generate signed download URL for ${cleanPath}`);
  }

  return {
    downloadUrl: data.signedUrl,
    expiresIn,
  };
}

/**
 * Generates a Supabase Storage Signed Upload URL for a per-token archive upload.
 * Used in the bulk stage archive upload flow.
 * Valid for 600 seconds (10 minutes) to accommodate large multi-ZIP uploads.
 */
export async function createTokenArchiveUploadUrl(
  accessToken: string
): Promise<{ uploadUrl: string; token: string; storagePath: string; expiresIn: number }> {
  await ensureStagesBucketExists();
  const supabaseAdmin = getSupabaseAdmin();

  const cleanToken = accessToken.replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase();
  const storagePath = `token-archives/${cleanToken}/archive.zip`;
  const expiresIn = 600;

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create token archive signed upload URL');
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path || storagePath,
    expiresIn,
  };
}

/**
 * Generates a short-lived (120s) Supabase Storage Signed Download URL
 * for a participant's unique token archive bundle (outer ZIP containing all stages).
 * URL is intentionally short-lived since the browser caches the blob in IndexedDB after first fetch.
 */

/**
 * Generates a Supabase Storage Signed Upload URL for a team-unique archive upload.
 * Ensures each team receives a dedicated storage location, and all members of that team
 * will download the exact same ZIP archive.
 */
/** Shared case-study pool object (upload once, many teams reference the same path). */
export async function createCaseStudyPoolUploadUrl(
  poolKey: string
): Promise<{ uploadUrl: string; token: string; storagePath: string; expiresIn: number; poolKey: string }> {
  await ensureStagesBucketExists();
  const supabaseAdmin = getSupabaseAdmin();

  const cleanKey = poolKey.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 80);
  const storagePath = `case-study-pool/${cleanKey}/archive.zip`;
  const expiresIn = 600;

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create pool archive signed upload URL');
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path || storagePath,
    expiresIn,
    poolKey: cleanKey,
  };
}

export async function createTeamArchiveUploadUrl(
  teamIdentifier: string
): Promise<{ uploadUrl: string; token: string; storagePath: string; expiresIn: number }> {
  await ensureStagesBucketExists();
  const supabaseAdmin = getSupabaseAdmin();

  const cleanKey = teamIdentifier.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
  const storagePath = `team-archives/${cleanKey}/archive.zip`;
  const expiresIn = 600;

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUploadUrl(storagePath);

  if (error || !data) {
    throw new Error(error?.message || 'Failed to create team archive signed upload URL');
  }

  return {
    uploadUrl: data.signedUrl,
    token: data.token,
    storagePath: data.path || storagePath,
    expiresIn,
  };
}

export async function createTokenArchiveDownloadUrl(
  storagePath: string
): Promise<{ downloadUrl: string; expiresIn: number }> {
  const supabaseAdmin = getSupabaseAdmin();
  const expiresIn = 180;

  const cleanPath = storagePath.replace(/^stages\//, '').replace(/^\/+/, '');

  const { data, error } = await supabaseAdmin.storage
    .from(STAGES_BUCKET)
    .createSignedUrl(cleanPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message || `Failed to generate signed download URL for token archive at ${cleanPath}`);
  }

  return {
    downloadUrl: data.signedUrl,
    expiresIn,
  };
}