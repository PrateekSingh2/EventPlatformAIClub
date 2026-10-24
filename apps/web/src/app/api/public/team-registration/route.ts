import { NextRequest, NextResponse } from 'next/server';
import { parseTeamRegistrationBody } from '@/lib/team-registration-form';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const parsed = parseTeamRegistrationBody(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('team_registration_submissions')
      .insert({
        team_name: parsed.data.team_name,
        members: parsed.data.members,
        squad_merge_opt_in: parsed.data.squad_merge_opt_in,
      })
      .select('id, team_name, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'This team name is already registered. Choose another name.' },
          { status: 409 }
        );
      }
      const missingSquadColumn =
        error.message?.includes('squad_merge_opt_in') ||
        error.details?.includes('squad_merge_opt_in');
      if (missingSquadColumn) {
        return NextResponse.json(
          {
            error:
              'Squad opt-in is not enabled on the database yet. Run migration 007_squad_merge_opt_in.sql in Supabase, then try again.',
          },
          { status: 503 }
        );
      }
      if (error.code === 'PGRST205' || error.message?.includes('team_registration_submissions')) {
        return NextResponse.json(
          { error: 'Team merge is not ready yet. Please try again shortly.' },
          { status: 503 }
        );
      }
      console.error('[POST /api/public/team-registration]', error.message);
      return NextResponse.json({ error: 'Could not save team merge' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Team merge submitted successfully.',
      id: data.id,
      team_name: data.team_name,
      created_at: data.created_at,
    });
  } catch (err) {
    console.error('[POST /api/public/team-registration]', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
