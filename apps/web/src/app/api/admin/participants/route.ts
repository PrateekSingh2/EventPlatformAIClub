import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, generateAccessToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminSecret =
      req.headers.get('x-admin-secret') ||
      req.nextUrl.searchParams.get('adminSecret');

    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const includeTelemetry = req.nextUrl.searchParams.get('telemetry') === '1';
    const supabaseAdmin = getSupabaseAdmin();

    const rosterSelect =
      'id, name, email, access_token, team_name, team_size, role, total_score, current_stage, is_flagged, is_disqualified, is_completed, created_at, updated_at, contest_started_at, stage_timestamps, stage_durations, total_time_seconds, last_stage_completed_at';

    const { data: users, error } = includeTelemetry
      ? await supabaseAdmin
          .from('users')
          .select(`${rosterSelect}, stage_telemetry(user_id, stage_number, duration_seconds, score_awarded, flagged_too_fast, completed_at)`)
          .order('created_at', { ascending: false })
          .limit(500)
      : await supabaseAdmin
          .from('users')
          .select(rosterSelect)
          .order('created_at', { ascending: false })
          .limit(500);

    if (error) {
      console.warn('[GET /admin/participants query warning]:', error.message);
      return NextResponse.json({ participants: [] });
    }

    return NextResponse.json(
      { participants: users || [] },
      {
        headers: {
          'Cache-Control': includeTelemetry ? 'private, no-store' : 'private, max-age=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    console.error('[API GET /admin/participants error]:', error);
    return NextResponse.json({ participants: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { participants, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!Array.isArray(participants) || participants.length === 0) {
      return NextResponse.json(
        { error: 'participants array is required and must not be empty' },
        { status: 400 }
      );
    }

    const cleanParticipants: Array<{
      email: string;
      name: string;
      team_name: string | null;
      team_size: string | null;
      role: 'participant';
      access_token: string;
    }> = [];

    const seenEmails = new Set<string>();
    const teamTokens = new Map<string, string>();

    // First pass: collect any pre-assigned tokens for teams
    for (const p of participants) {
      const teamName = (p.team_name || p.teamName || '').trim();
      const customToken = (p.access_token || p.token || '').trim().toUpperCase();
      if (teamName && customToken && !teamTokens.has(teamName.toLowerCase())) {
        teamTokens.set(teamName.toLowerCase(), customToken);
      }
    }

    for (const p of participants) {
      const email = (p.email || '').trim().toLowerCase();
      const name = (p.name || '').trim();
      const team_name = (p.team_name || p.teamName || '').trim() || null;
      const team_size = (p.team_size || p.teamSize || '').trim() || null;
      const customToken = (p.access_token || p.token || '').trim().toUpperCase();

      if (!email || !email.includes('@')) {
        continue;
      }
      if (seenEmails.has(email)) {
        continue;
      }

      seenEmails.add(email);

      let tokenForUser = customToken;
      if (team_name) {
        const teamKey = team_name.toLowerCase();
        if (!teamTokens.has(teamKey)) {
          teamTokens.set(teamKey, customToken || generateAccessToken());
        }
        tokenForUser = teamTokens.get(teamKey)!;
      } else if (!tokenForUser) {
        tokenForUser = generateAccessToken();
      }

      cleanParticipants.push({
        email,
        name: name || email.split('@')[0],
        team_name,
        team_size,
        role: 'participant',
        access_token: tokenForUser,
      });
    }

    if (cleanParticipants.length === 0) {
      return NextResponse.json(
        { error: 'No valid participant records found in payload' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Try upserting with team_name and team_size
    let data: any[] | null = null;
    let error: any = null;

    try {
      const res = await supabaseAdmin
        .from('users')
        .upsert(cleanParticipants, {
          onConflict: 'email',
          ignoreDuplicates: false,
        })
        .select('id, email, name, team_name, team_size, role, access_token, total_score, current_stage');
      data = res.data;
      error = res.error;
    } catch (e: any) {
      error = e;
    }

    // Fallback if team_name column not yet present in users table
    if (error && (error.message?.includes('team_name') || error.message?.includes('column'))) {
      console.warn('[Participants Import]: team_name column not found in database, falling back to base columns');
      const baseParticipants = cleanParticipants.map((p) => ({
        email: p.email,
        name: p.name,
        role: p.role,
        access_token: p.access_token,
      }));
      const resFallback = await supabaseAdmin
        .from('users')
        .upsert(baseParticipants, {
          onConflict: 'email',
          ignoreDuplicates: false,
        })
        .select('id, email, name, role, access_token, total_score, current_stage');
      data = resFallback.data;
      error = resFallback.error;
    }

    if (error) throw error;

    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      participants: data || [],
    });
  } catch (error: any) {
    console.error('[API POST /admin/participants error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to import participants' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const adminSecret =
      req.headers.get('x-admin-secret') ||
      req.nextUrl.searchParams.get('adminSecret');

    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, userId, email, all } = body;
    const targetId = id || userId;

    const supabaseAdmin = getSupabaseAdmin();

    if (all === true) {
      // Clear all participants and dependent telemetry records
      try {
        const { data: participantUsers } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('role', 'participant');

        if (participantUsers && participantUsers.length > 0) {
          const userIds = participantUsers.map((u: any) => u.id);
          await supabaseAdmin
            .from('stage_telemetry')
            .delete()
            .in('user_id', userIds);
        }
      } catch (telemetryErr) {
        console.warn('[DELETE participants all telemetry cleanup warning]:', telemetryErr);
      }

      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('role', 'participant');

      if (error) throw error;
      return NextResponse.json({ success: true, message: 'All participants deleted' });
    }

    if (targetId) {
      // Delete any dependent stage_telemetry records first to avoid foreign key violations
      try {
        await supabaseAdmin
          .from('stage_telemetry')
          .delete()
          .eq('user_id', targetId);
      } catch (telemetryErr) {
        console.warn(`[DELETE participant ${targetId} telemetry cleanup warning]:`, telemetryErr);
      }

      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('id', targetId);

      if (error) throw error;
      return NextResponse.json({ success: true, message: `Participant ${targetId} deleted` });
    }

    if (email) {
      const cleanEmail = email.trim().toLowerCase();
      try {
        const { data: existingUser } = await supabaseAdmin
          .from('users')
          .select('id')
          .eq('email', cleanEmail)
          .maybeSingle();

        if (existingUser?.id) {
          await supabaseAdmin
            .from('stage_telemetry')
            .delete()
            .eq('user_id', existingUser.id);
        }
      } catch (telemetryErr) {
        console.warn(`[DELETE participant ${cleanEmail} telemetry cleanup warning]:`, telemetryErr);
      }

      const { error } = await supabaseAdmin
        .from('users')
        .delete()
        .eq('email', cleanEmail);

      if (error) throw error;
      return NextResponse.json({ success: true, message: `Participant ${cleanEmail} deleted` });
    }

    return NextResponse.json(
      { error: 'Please provide participant id, email, or all: true to delete' },
      { status: 400 }
    );
  } catch (error: any) {
    console.error('[API DELETE /admin/participants error]:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete participant' },
      { status: 500 }
    );
  }
}
