import { NextRequest, NextResponse } from 'next/server';
import { verifyParticipantToken } from '@/lib/auth';
import { getSupabaseAdmin, isSupabaseConfigured } from '@/lib/supabase';
import { recordLocalTelemetryPing } from '@/lib/local-telemetry';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accessToken, stageNumber, type } = body;
    const latencyMs = Number.isFinite(body.latencyMs)
      ? Math.min(10000, Math.max(0, Number(body.latencyMs)))
      : undefined;

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

    const supportedTypes = [
      'tab_switch',
      'fullscreen_exit',
      'multi_monitor_detected',
      'devtools_timing',
      'window_size_discrepancy',
    ];
    if (!supportedTypes.includes(type)) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    if (!isSupabaseConfigured) {
      recordLocalTelemetryPing(user, stageNum, type, latencyMs);
      return NextResponse.json({ ok: true, storage: 'local-demo' });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // Query current telemetry record to increment safely
    const { data: telemetry } = await supabaseAdmin
      .from('stage_telemetry')
      .select('id, tab_switches, fullscreen_exits, multi_monitor_detected, devtools_timing_flags, devtools_probe_latency_ms, window_size_discrepancies')
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
      } else if (type === 'devtools_timing') {
        updates.devtools_timing_flags = ((telemetry as any).devtools_timing_flags || 0) + 1;
        if (latencyMs !== undefined) updates.devtools_probe_latency_ms = latencyMs;
        updates.flag_reason = 'Heuristic signal: DevTools console getter was evaluated';
      } else if (type === 'window_size_discrepancy') {
        updates.window_size_discrepancies = ((telemetry as any).window_size_discrepancies || 0) + 1;
        updates.flag_reason = 'Heuristic signal: Browser outer/inner width difference exceeded 160px';
      }

      const { error: updateError } = await supabaseAdmin
        .from('stage_telemetry')
        .update(updates)
        .eq('id', telemetry.id);

      // Fallback in case multi_monitor_detected column is pending DB migration
      if (updateError && ['multi_monitor_detected', 'devtools_timing', 'window_size_discrepancy'].includes(type)) {
        const fallbackFlagReason = type === 'multi_monitor_detected'
          ? 'Anti-Cheat Alert: Multi-monitor or detached window activity detected'
          : type === 'devtools_timing'
            ? 'Heuristic signal: DevTools console getter was evaluated'
            : 'Heuristic signal: Browser outer/inner width difference exceeded 160px';
        await supabaseAdmin
          .from('stage_telemetry')
          .update({
            updated_at: new Date().toISOString(),
            flag_reason: fallbackFlagReason,
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
      if (type === 'devtools_timing') {
        newRecord.devtools_timing_flags = 1;
        if (latencyMs !== undefined) newRecord.devtools_probe_latency_ms = latencyMs;
        newRecord.flag_reason = 'Heuristic signal: DevTools console getter was evaluated';
      }
      if (type === 'window_size_discrepancy') {
        newRecord.window_size_discrepancies = 1;
        newRecord.flag_reason = 'Heuristic signal: Browser outer/inner width difference exceeded 160px';
      }

      const { error: insertError } = await supabaseAdmin
        .from('stage_telemetry')
        .insert(newRecord);

      if (insertError && ['multi_monitor_detected', 'devtools_timing', 'window_size_discrepancy'].includes(type)) {
        delete newRecord.multi_monitor_detected;
        delete newRecord.devtools_timing_flags;
        delete newRecord.window_size_discrepancies;
        newRecord.flag_reason = type === 'multi_monitor_detected'
          ? 'Anti-Cheat Alert: Multi-monitor or detached window activity detected'
          : type === 'devtools_timing'
            ? 'Heuristic signal: DevTools console getter was evaluated'
            : 'Heuristic signal: Browser outer/inner width difference exceeded 160px';
        await supabaseAdmin.from('stage_telemetry').insert(newRecord);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    // Non-blocking telemetry failure - return silent 200 or 500 without impacting participant UX
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
