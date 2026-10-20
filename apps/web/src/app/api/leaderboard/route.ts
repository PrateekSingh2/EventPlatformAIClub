import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabaseAdmin = getSupabaseAdmin();

    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, role, access_token, total_score, current_stage, is_flagged, is_disqualified, created_at, updated_at')
      .eq('role', 'participant')
      .order('total_score', { ascending: false })
      .order('updated_at', { ascending: true })
      .limit(500);

    if (error) {
      console.warn('[GET /api/leaderboard error]:', error.message);
      return NextResponse.json({ success: false, users: [] }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      users: users || [],
    });
  } catch (err: any) {
    console.error('[API GET /api/leaderboard exception]:', err);
    return NextResponse.json({ success: false, users: [] }, { status: 500 });
  }
}
