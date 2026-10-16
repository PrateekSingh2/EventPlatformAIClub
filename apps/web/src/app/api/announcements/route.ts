import { NextResponse } from 'next/server';
import { getRecentAnnouncements } from '@/lib/announcements';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const announcements = await getRecentAnnouncements(5);
    return NextResponse.json(
      { success: true, announcements },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}
