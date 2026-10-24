import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

function resolvePasswordKeyPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'data/PASSWORD_KEY.json'),
    path.join(process.cwd(), 'examples/case-studies/PASSWORD_KEY.json'),
    path.join(process.cwd(), '../../examples/case-studies/PASSWORD_KEY.json'),
    path.join(process.cwd(), '../../../examples/case-studies/PASSWORD_KEY.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export async function GET(req: NextRequest) {
  const adminSecret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');

  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keyPath = resolvePasswordKeyPath();
  if (!keyPath) {
    return NextResponse.json(
      { error: 'PASSWORD_KEY.json not found on server. Deploy examples/case-studies or upload keys separately.' },
      { status: 404 }
    );
  }

  try {
    const raw = fs.readFileSync(keyPath, 'utf8');
    const parsed = JSON.parse(raw);
    return NextResponse.json(parsed, {
      headers: {
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to read answer keys';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
