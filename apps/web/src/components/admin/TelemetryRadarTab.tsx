'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { StageTelemetry } from '@/lib/types';
import {
  Radar,
  Radio,
  AlertTriangle,
  CheckCircle,
  Eye,
  Maximize2,
  Clock,
  ShieldAlert,
  Loader2,
  Search,
  Filter,
} from 'lucide-react';

interface TelemetryRadarTabProps {
  adminSecret: string;
}

export function TelemetryRadarTab({ adminSecret }: TelemetryRadarTabProps) {
  const [telemetryRecords, setTelemetryRecords] = useState<StageTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOnlyFlagged, setFilterOnlyFlagged] = useState(false);
  const [search, setSearch] = useState('');

  const fetchTelemetry = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('stage_telemetry')
        .select(`
          id,
          user_id,
          stage_number,
          started_at,
          completed_at,
          duration_seconds,
          tab_switches,
          fullscreen_exits,
          flagged_too_fast,
          flag_reason,
          created_at,
          updated_at,
          users (
            name,
            email,
            total_score,
            current_stage,
            is_flagged
          )
        `)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const formatted: StageTelemetry[] = (data || []).map((row: any) => ({
        ...row,
        user: Array.isArray(row.users) ? row.users[0] : row.users,
      }));

      if (formatted.length > 0) {
        setTelemetryRecords(formatted);
        return;
      }
    } catch (err) {
      // Fallback to sample telemetry records for preview
    }

    setTelemetryRecords([
      {
        id: 't-1',
        user_id: 'u-1',
        stage_number: 1,
        started_at: new Date(Date.now() - 120000).toISOString(),
        completed_at: new Date(Date.now() - 102000).toISOString(),
        duration_seconds: 18,
        tab_switches: 4,
        fullscreen_exits: 2,
        flagged_too_fast: true,
        flag_reason: 'Speed-Run Alert: Completed Stage 1 in 18s (Admin threshold: 60s)',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: {
          name: 'Devin Thorne',
          email: 'devin@ai-labs.org',
          total_score: 100,
          current_stage: 2,
          is_flagged: true,
        },
      },
      {
        id: 't-2',
        user_id: 'u-2',
        stage_number: 2,
        started_at: new Date(Date.now() - 360000).toISOString(),
        completed_at: new Date(Date.now() - 210000).toISOString(),
        duration_seconds: 150,
        tab_switches: 1,
        fullscreen_exits: 0,
        flagged_too_fast: false,
        flag_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: {
          name: 'Marcus Vance',
          email: 'marcus.v@berkeley.edu',
          total_score: 350,
          current_stage: 3,
          is_flagged: false,
        },
      },
      {
        id: 't-3',
        user_id: 'u-3',
        stage_number: 1,
        started_at: new Date(Date.now() - 600000).toISOString(),
        completed_at: new Date(Date.now() - 520000).toISOString(),
        duration_seconds: 80,
        tab_switches: 0,
        fullscreen_exits: 0,
        flagged_too_fast: false,
        flag_reason: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: {
          name: 'Elena Rostova',
          email: 'erostova@stanford.edu',
          total_score: 300,
          current_stage: 3,
          is_flagged: false,
        },
      },
    ]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTelemetry();

    // Subscribe to real-time telemetry changes
    const channel = supabase
      .channel('admin-telemetry-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_telemetry' },
        () => {
          fetchTelemetry();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Admin action: Clear Flag
  const handleClearFlag = async (telemetryId: string, userId: string) => {
    try {
      await supabase
        .from('stage_telemetry')
        .update({
          flagged_too_fast: false,
          flag_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', telemetryId);

      await supabase
        .from('users')
        .update({
          is_flagged: false,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      fetchTelemetry();
    } catch (err) {
      console.error('Failed to clear flag', err);
    }
  };

  // Filter records
  const filtered = telemetryRecords.filter((rec) => {
    const isSuspicious =
      rec.flagged_too_fast || rec.tab_switches > 2 || rec.fullscreen_exits > 1;
    if (filterOnlyFlagged && !isSuspicious) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = rec.user?.name?.toLowerCase() || '';
    const email = rec.user?.email?.toLowerCase() || '';
    const reason = rec.flag_reason?.toLowerCase() || '';
    return name.includes(q) || email.includes(q) || reason.includes(q);
  });

  const totalFlagged = telemetryRecords.filter(
    (r) => r.flagged_too_fast || r.tab_switches > 2 || r.fullscreen_exits > 1
  ).length;

  return (
    <div className="space-y-6">
      {/* Top Telemetry Radar Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Live Stream</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
              <Radio className="w-3 h-3 animate-pulse" /> ACTIVE
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-white mt-1">
            {telemetryRecords.length}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Stage telemetry events recorded</p>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Suspicious Speed-Runs</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-rose-400 mt-1">
            {telemetryRecords.filter((r) => r.flagged_too_fast).length}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Stages completed &lt; min threshold</p>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Fullscreen Exits</span>
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-amber-400 mt-1">
            {telemetryRecords.reduce((acc, r) => acc + (r.fullscreen_exits || 0), 0)}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Total arena departures</p>
        </div>

        <div className="p-3.5 sm:p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Tab Switches</span>
            <Eye className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="text-xl sm:text-2xl font-extrabold text-violet-400 mt-1">
            {telemetryRecords.reduce((acc, r) => acc + (r.tab_switches || 0), 0)}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Total background blurs</p>
        </div>
      </div>

      {/* Telemetry Radar Table */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-rose-400 animate-spin" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Live Anti-Cheat & Telemetry Radar
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={() => setFilterOnlyFlagged(!filterOnlyFlagged)}
              className={`flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border ${filterOnlyFlagged
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
                }`}
            >
              <Filter className="w-3 h-3" />
              Flagged Only ({totalFlagged})
            </button>

            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search participant or alert..."
                className="w-full sm:w-64 px-3 py-1.5 pl-8 text-xs text-white bg-slate-900 border border-slate-700 rounded-lg focus:border-cyan-400 font-mono"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Participant</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Tab Switches</th>
                <th className="px-4 py-3">Fullscreen Exits</th>
                <th className="px-4 py-3">Anti-Cheat Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
              {loading ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-400" />
                    Connecting to live telemetry stream...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-500">
                    No telemetry records found.
                  </td>
                </tr>
              ) : (
                filtered.map((rec) => {
                  const isRedFlag =
                    rec.flagged_too_fast ||
                    rec.tab_switches > 2 ||
                    rec.fullscreen_exits > 1;

                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${isRedFlag
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : 'hover:bg-slate-900/40'
                        }`}
                    >
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-white">
                          {rec.user?.name || 'Unknown User'}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {rec.user?.email}
                        </div>
                      </td>

                      <td className="px-4 py-3 text-slate-300 font-bold">
                        Stage {rec.stage_number}
                      </td>

                      <td className="px-4 py-3 text-slate-300">
                        {rec.duration_seconds !== null ? (
                          <span
                            className={
                              rec.flagged_too_fast ? 'text-rose-400 font-extrabold' : ''
                            }
                          >
                            {rec.duration_seconds}s
                          </span>
                        ) : (
                          <span className="text-slate-500 italic">In Progress</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            rec.tab_switches > 2 ? 'text-rose-400 font-bold' : 'text-slate-400'
                          }
                        >
                          {rec.tab_switches}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={
                            rec.fullscreen_exits > 1 ? 'text-rose-400 font-bold' : 'text-slate-400'
                          }
                        >
                          {rec.fullscreen_exits}
                        </span>
                      </td>

                      <td className="px-4 py-3">
                        {isRedFlag ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full w-fit">
                              <ShieldAlert className="w-3 h-3" />
                              SUSPICIOUS
                            </span>
                            {rec.flag_reason && (
                              <span className="text-[10px] text-rose-400 font-sans max-w-[200px] truncate" title={rec.flag_reason}>
                                {rec.flag_reason}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                            <CheckCircle className="w-3 h-3" />
                            Clean
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {isRedFlag && (
                          <button
                            onClick={() => handleClearFlag(rec.id, rec.user_id)}
                            className="px-2.5 py-1 text-[10px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors cursor-pointer"
                          >
                            Clear Flag
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
