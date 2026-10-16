import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { createAdminUploadUrl } from '@/lib/s3';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stageNumber, filename, adminSecret } = body;

    const authHeader = req.headers.get('x-admin-secret');
    const secret = adminSecret || authHeader;

    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!stageNumber || !filename) {
      return NextResponse.json(
        { error: 'stageNumber and filename are required' },
        { status: 400 }
      );
    }

    const { uploadUrl, s3Key, expiresIn } = await createAdminUploadUrl(
      Number(stageNumber),
      filename
    );

    return NextResponse.json({
      uploadUrl,
      s3Key,
      expiresIn,
    });
  } catch (error: any) {
    console.error('[API /admin/s3-upload error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate S3 presigned upload URL' },
      { status: 500 }
    );
  }
}
