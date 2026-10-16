import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { createAdminUploadUrl } from '@/lib/storage';

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

    const { uploadUrl, token, storagePath, s3Key, expiresIn } = await createAdminUploadUrl(
      Number(stageNumber),
      filename
    );

    return NextResponse.json({
      uploadUrl,
      token,
      storagePath,
      s3Key, // Kept for backwards compatibility
      expiresIn,
    });
  } catch (error: any) {
    console.error('[API /admin/storage-upload error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate Supabase Storage signed upload URL' },
      { status: 500 }
    );
  }
}
