import { NextRequest, NextResponse } from 'next/server';
import { POST as handlePost, GET as handleGet } from '@/app/api/contest/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  return handleGet();
}

export async function POST(req: NextRequest) {
  return handlePost(req);
}
