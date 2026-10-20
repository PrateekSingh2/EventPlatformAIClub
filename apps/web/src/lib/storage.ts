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
