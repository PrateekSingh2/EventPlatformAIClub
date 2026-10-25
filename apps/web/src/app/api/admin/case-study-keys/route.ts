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

function resolveChakravyuhKeyPath(): string | null {
  const candidates = [
    path.join(process.cwd(), 'data/chakravyuh-password-key.json'),
    path.join(process.cwd(), 'examples/case-studies/chakravyuh-password-key.json'),
    path.join(process.cwd(), '../../examples/case-studies/chakravyuh-password-key.json'),
    path.join(process.cwd(), '../../../examples/case-studies/chakravyuh-password-key.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function mergePasswordKeyFiles(): { generated_at?: string; packs: unknown[] } | null {
  const mainPath = resolvePasswordKeyPath();
  if (!mainPath) return null;
  const parsed = JSON.parse(fs.readFileSync(mainPath, 'utf8')) as {
    generated_at?: string;
    packs?: { folder?: string; file?: string }[];
  };
  const chakPath = resolveChakravyuhKeyPath();
  if (!chakPath) return parsed as { generated_at?: string; packs: unknown[] };
  const chak = JSON.parse(fs.readFileSync(chakPath, 'utf8')) as { packs?: unknown[] };
  const seen = new Set((parsed.packs || []).map((p) => p.folder || p.file));
  const prepend = (chak.packs || []).filter((raw): raw is { folder?: string; file?: string } => {
    if (!raw || typeof raw !== 'object') return false;
    const p = raw as { folder?: string; file?: string };
    const id = p.folder || p.file;
    return Boolean(id && !seen.has(id));
  });
  return { ...parsed, packs: [...prepend, ...(parsed.packs || [])] };
}

export async function GET(req: NextRequest) {
  const adminSecret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');

  if (!verifyAdminSecret(adminSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = mergePasswordKeyFiles();
  if (!parsed) {
    return NextResponse.json(
      { error: 'PASSWORD_KEY.json not found on server. Deploy examples/case-studies or upload keys separately.' },
      { status: 404 }
    );
  }

  try {
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
