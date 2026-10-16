import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * AWS S3 Bucket CORS Configuration JSON:
 * Apply this exact JSON configuration in your AWS S3 Console (Bucket -> Permissions -> Cross-origin resource sharing):
 *
 * [
 *   {
 *     "AllowedHeaders": ["*"],
 *     "AllowedMethods": ["GET", "PUT", "HEAD"],
 *     "AllowedOrigins": [
 *       "http://localhost:3000",
 *       "https://*.netlify.app",
 *       "https://your-custom-domain.com"
 *     ],
 *     "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
 *     "MaxAgeSeconds": 3600
 *   }
 * ]
 */
export const S3_CORS_CONFIGURATION_JSON = JSON.stringify(
  [
    {
      AllowedHeaders: ['*'],
      AllowedMethods: ['GET', 'PUT', 'HEAD'],
      AllowedOrigins: [
        'http://localhost:3000',
        'https://*.netlify.app',
        process.env.NEXT_PUBLIC_APP_URL || '*',
      ],
      ExposeHeaders: ['ETag', 'Content-Length', 'Content-Type'],
      MaxAgeSeconds: 3600,
    },
  ],
  null,
  2
);

// Netlify reserves AWS_* environment variables; we strictly use MY_AWS_*
const region = process.env.MY_AWS_REGION || 'us-east-1';
const accessKeyId = process.env.MY_AWS_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.MY_AWS_SECRET_ACCESS_KEY || '';
const bucketName = process.env.MY_AWS_S3_BUCKET_NAME || '';

let s3ClientInstance: S3Client | null = null;

export function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    if (!accessKeyId || !secretAccessKey) {
      console.warn(
        '[S3 Warning] MY_AWS_ACCESS_KEY_ID or MY_AWS_SECRET_ACCESS_KEY is missing. S3 presigned operations will fail.'
      );
    }
    s3ClientInstance = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }
  return s3ClientInstance;
}

/**
 * Generates an AWS S3 Presigned PUT URL for Admin direct browser-to-S3 uploads.
 * Valid for 300 seconds (5 minutes).
 */
export async function createAdminUploadUrl(
  stageNumber: number,
  filename: string
): Promise<{ uploadUrl: string; s3Key: string; expiresIn: number }> {
  const client = getS3Client();
  const cleanFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const s3Key = `stages/stage-${stageNumber}/${Date.now()}-${cleanFilename}`;
  const expiresIn = 300; // 5 minutes

  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
    ContentType: 'application/zip',
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn });
  return { uploadUrl, s3Key, expiresIn };
}

/**
 * Generates an AWS S3 Presigned GET URL for Participant archive retrieval.
 * Valid for strictly 60 seconds to prevent unauthorized distribution.
 */
export async function createParticipantDownloadUrl(
  s3Key: string
): Promise<{ downloadUrl: string; expiresIn: number }> {
  const client = getS3Client();
  const expiresIn = 60; // 60 seconds

  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key,
  });

  const downloadUrl = await getSignedUrl(client, command, { expiresIn });
  return { downloadUrl, expiresIn };
}
