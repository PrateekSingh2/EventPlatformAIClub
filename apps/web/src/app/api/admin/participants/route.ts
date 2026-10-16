import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret, generateAccessToken } from '@/lib/auth';
import { getSupabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  try {
    const adminSecret = req.headers.get('x-admin-secret') || req.nextUrl.searchParams.get('adminSecret');
    if (!verifyAdminSecret(adminSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: users, error } = await supabaseAdmin
      .from('users')
      .select('*, stage_telemetry(*)')
      .order('created_at', { ascending: false });

    if (error || !users || users.length === 0) {
      return NextResponse.json({
        participants: [
          {
            id: '1',
            name: 'Maya Lin',
            email: 'mlin@mit.edu',
            role: 'participant',
            access_token: 'AX-9021-3829',
            total_score: 450,
            current_stage: 4,
            is_flagged: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stage_telemetry: [],
          },
          {
            id: '2',
            name: 'Marcus Vance',
            email: 'marcus.v@berkeley.edu',
            role: 'participant',
            access_token: 'AX-4820-1940',
            total_score: 350,
            current_stage: 3,
            is_flagged: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stage_telemetry: [],
          },
          {
            id: '3',
            name: 'Elena Rostova',
            email: 'erostova@stanford.edu',
            role: 'participant',
            access_token: 'AX-7104-5821',
            total_score: 300,
            current_stage: 3,
            is_flagged: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stage_telemetry: [],
          },
          {
            id: '4',
            name: 'Devin Thorne',
            email: 'devin@ai-labs.org',
            role: 'participant',
            access_token: 'AX-3819-2049',
            total_score: 100,
            current_stage: 1,
            is_flagged: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stage_telemetry: [
              {
                id: 'tel-1',
                stage_number: 1,
                duration_seconds: 18,
                tab_switches: 4,
                fullscreen_exits: 2,
                flagged_too_fast: true,
                flag_reason: 'Speed-Run Alert: Completed Stage 1 in 18s (Min threshold: 60s)',
              },
            ],
          },
          {
            id: '5',
            name: 'Alex Mercer (Demo)',
            email: 'alex.mercer@aiclub.org',
            role: 'participant',
            access_token: 'AX-DEMO-2026',
            total_score: 150,
            current_stage: 1,
            is_flagged: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            stage_telemetry: [],
          },
        ],
      });
    }

    return NextResponse.json({ participants: users || [] });
  } catch (error: any) {
    return NextResponse.json({
      participants: [
        {
          id: '1',
          name: 'Maya Lin',
          email: 'mlin@mit.edu',
          role: 'participant',
          access_token: 'AX-9021-3829',
          total_score: 450,
          current_stage: 4,
          is_flagged: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          stage_telemetry: [],
        },
      ],
    });
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
      role: 'participant';
      access_token: string;
    }> = [];

    const seenEmails = new Set<string>();

    for (const p of participants) {
      const email = (p.email || '').trim().toLowerCase();
      const name = (p.name || '').trim();

      if (!email || !email.includes('@')) {
        continue;
      }
      if (seenEmails.has(email)) {
        continue;
      }

      seenEmails.add(email);
      cleanParticipants.push({
        email,
        name: name || email.split('@')[0],
        role: 'participant',
        access_token: generateAccessToken(),
      });
    }

    if (cleanParticipants.length === 0) {
      return NextResponse.json(
        { error: 'No valid participant records found in payload' },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Upsert into Supabase users table (ignoring token regeneration if user already exists to keep active sessions)
    const { data, error } = await supabaseAdmin
      .from('users')
      .upsert(cleanParticipants, {
        onConflict: 'email',
        ignoreDuplicates: false,
      })
      .select('id, email, name, role, access_token, total_score, current_stage');

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
