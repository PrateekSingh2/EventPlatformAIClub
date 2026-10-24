import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** Returns this deployment's outbound IP (for Brevo / firewall allowlists). */
export async function GET(req: NextRequest) {
  const secret =
    req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
  if (!verifyAdminSecret(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const res = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
    const data = (await res.json()) as { ip?: string };
    const ip = data.ip?.trim();
    if (!ip) {
      return NextResponse.json({ error: 'Could not resolve egress IP' }, { status: 502 });
    }
    return NextResponse.json({
      ip,
      hint: 'Add this IP in Brevo → Settings → Security → Authorized IPs. Vercel egress may change unless Static IPs are enabled.',
    });
  } catch {
    return NextResponse.json({ error: 'Failed to detect egress IP' }, { status: 502 });
  }
}
