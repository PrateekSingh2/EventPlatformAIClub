import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSecret } from '@/lib/auth';
import { getSupabaseAdmin, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

import { recordLocalDisqualification, removeLocalDisqualification } from '@/lib/disqualification';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, reason, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid userId' },
        { status: 400 }
      );
    }

    const cleanReason =
      typeof reason === 'string' && reason.trim()
        ? reason.trim()
        : 'Disqualified by tournament administrator for fair-play rule violations.';

    let updatedUser: any = null;

    try {
      const supabaseAdmin = getSupabaseAdmin();

      // Ensure user is not an administrator
      const { data: targetUser, error: fetchErr } = await supabaseAdmin
        .from('users')
        .select('id, name, email, role')
        .eq('id', userId)
        .maybeSingle();

      if (targetUser && targetUser.role === 'admin') {
        return NextResponse.json(
          { success: false, error: 'Cannot disqualify an administrator account.' },
          { status: 400 }
        );
      }

      // Update user role to 'disqualified' and set audit fields
      const { data, error } = await supabaseAdmin
        .from('users')
        .update({
          role: 'disqualified',
          is_disqualified: true,
          disqualified_at: new Date().toISOString(),
          disqualification_reason: cleanReason,
          is_flagged: true,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId)
        .select()
        .single();

      if (!error && data) {
        updatedUser = data;
      }
    } catch (err: any) {
      console.warn('[Disqualify API] Supabase error:', err.message);
    }

    // Record in local cache
    recordLocalDisqualification(userId);

    // Broadcast real-time suspension event to connected clients
    try {
      const isSupabaseConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');
      if (isSupabaseConfigured) {
        const payload = {
          userId,
          reason: cleanReason,
          timestamp: new Date().toISOString(),
        };
        const channel = supabase.channel('participant-status');
        const userChannel = supabase.channel(`participant-status-${userId}`);
        Promise.race([
          Promise.all([
            channel.send({ type: 'broadcast', event: 'disqualified', payload }),
            userChannel.send({ type: 'broadcast', event: 'disqualified', payload }),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), 1000)),
        ]).catch(() => {});
      }
    } catch {
      // Ignore realtime delivery warnings
    }

    return NextResponse.json({
      success: true,
      message: 'Participant has been successfully disqualified.',
      user: updatedUser || {
        id: userId,
        role: 'disqualified',
        is_disqualified: true,
        disqualification_reason: cleanReason,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to disqualify participant' },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, adminSecret } = body;

    const secret = adminSecret || req.headers.get('x-admin-secret');
    if (!verifyAdminSecret(secret)) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized: Invalid admin secret key' },
        { status: 401 }
      );
    }

    if (!userId || typeof userId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid userId' },
        { status: 400 }
      );
    }

    try {
      const supabaseAdmin = getSupabaseAdmin();
      await supabaseAdmin
        .from('users')
        .update({
          role: 'participant',
          is_disqualified: false,
          disqualified_at: null,
          disqualification_reason: null,
        })
        .eq('id', userId);
    } catch {
      // Ignore
    }

    removeLocalDisqualification(userId);

    // Broadcast real-time reinstatement event to connected clients
    try {
      const isSupabaseConfigured =
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');
      if (isSupabaseConfigured) {
        const payload = { userId, timestamp: new Date().toISOString() };
        const channel = supabase.channel('participant-status');
        const userChannel = supabase.channel(`participant-status-${userId}`);
        Promise.race([
          Promise.all([
            channel.send({ type: 'broadcast', event: 'reinstated', payload }),
            userChannel.send({ type: 'broadcast', event: 'reinstated', payload }),
          ]),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), 1000)),
        ]).catch(() => {});
      }
    } catch {
      // Ignore realtime delivery warnings
    }

    return NextResponse.json({
      success: true,
      message: 'Participant has been successfully reinstated.',
      userId,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to reinstate participant' },
      { status: 500 }
    );
  }
}
