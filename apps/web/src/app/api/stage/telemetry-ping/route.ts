import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { recordLocalTelemetryPing } from '@/lib/local-telemetry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber, type } = body;

    if (!accessToken || !stageNumber || !type) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const user = await verifyParticipantToken(accessToken);
    if (!user) {
      return NextResponse.json({ ok: false }, { status: 401 });
    }

    if (user.role === 'disqualified' || user.is_disqualified) {
      return NextResponse.json({ ok: false, error: 'Account Suspended for Fair-Play Violations' }, { status: 403 });
    }

    const stageNum = Number(stageNumber);
    if (!Number.isInteger(stageNum) || stageNum < 1) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!['tab_switch', 'fullscreen_exit', 'multi_monitor_detected'].includes(type)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      recordLocalTelemetryPing(user, stageNum, type);
      return NextResponse.json({ ok: true, storage: 'local-demo' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query current telemetry record to increment safely
    const { data: telemetry } = await supabaseAdmin
      .from('stage_telemetry')
      .select('id, tab_switches, fullscreen_exits, multi_monitor_detected')
      .eq('user_id', user.id)
      .eq('stage_number', stageNum)
      .maybeSingle();

    if (telemetry) {
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (type === 'tab_switch') {
        updates.tab_switches = (telemetry.tab_switches || 0) + 1;
      } else if (type === 'fullscreen_exit') {
        updates.fullscreen_exits = (telemetry.fullscreen_exits || 0) + 1;
      } else if (type === 'multi_monitor_detected') {
        updates.multi_monitor_detected = ((telemetry as any).multi_monitor_detected || 0) + 1;
        updates.flag_reason = 'Anti-Cheat Alert: Multi-monitor or detached window activity detected';
      }

      const { error: updateError } = await supabaseAdmin
        .from('stage_telemetry')
        .update(updates)
        .eq('id', telemetry.id);

      // Fallback in case multi_monitor_detected column is pending DB migration
      if (updateError && type === 'multi_monitor_detected') {
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            updated_at: new Date().toISOString(),
            flag_reason: 'Anti-Cheat Alert: Multi-monitor or detached window activity detected',
          })
          .eq('id', telemetry.id);
      }
    } else {
      // Create initial row if it somehow wasn't initialized yet
      const newRecord: Record<string, any> = {
        user_id: user.id,
        stage_number: stageNum,
        started_at: new Date().toISOString(),
        tab_switches: type === 'tab_switch' ? 1 : 0,
        fullscreen_exits: type === 'fullscreen_exit' ? 1 : 0,
      };

      if (type === 'multi_monitor_detected') {
        newRecord.multi_monitor_detected = 1;
        newRecord.flag_reason = 'Anti-Cheat Alert: Multi-monitor or detached window activity detected';
      }

      const { error: insertError } = await supabaseAdmin
        .from('stage_telemetry')
        .insert(newRecord);

      if (insertError && type === 'multi_monitor_detected') {
        delete newRecord.multi_monitor_detected;
        await supabaseAdmin.from('stage_telemetry').insert(newRecord);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Non-blocking telemetry failure - return silent 200 or 500 without impacting participant UX
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
