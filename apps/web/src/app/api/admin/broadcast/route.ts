import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { createAnnouncement, getRecentAnnouncements } from '@/lib/announcements';
import { AnnouncementUrgency } from '@/lib/types';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    const announcements = await getRecentAnnouncements(20);
    return NextResponse.json({ success: true, announcements });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch announcements' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, urgency, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { success: false, error: 'Announcement message is required' },
        { status: 400 }
      );
    }

    const validUrgencies: AnnouncementUrgency[] = ['info', 'warning', 'critical'];
    const chosenUrgency: AnnouncementUrgency = validUrgencies.includes(urgency)
      ? urgency
      : 'info';

    const announcement = await createAnnouncement(message, chosenUrgency, 'admin');

    return NextResponse.json({ success: true, announcement });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to broadcast announcement' },
      { status: 500 }
    );
  }
}
