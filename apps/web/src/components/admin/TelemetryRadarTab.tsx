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
  Download,
  Ban,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';

interface TelemetryRadarTabProps {
  adminSecret: string;
}

export function TelemetryRadarTab({ adminSecret }: TelemetryRadarTabProps) {
  const [telemetryRecords, setTelemetryRecords] = useState<StageTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterOnlyFlagged, setFilterOnlyFlagged] = useState(false);
  const [search, setSearch] = useState('');

  // CSV Export State
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Disqualification Modal State
  const [disqualifyCandidate, setDisqualifyCandidate] = useState<{
    userId: string;
    userName: string;
    userEmail: string;
  } | null>(null);
  const [disqualifyReason, setDisqualifyReason] = useState('Confirmed anti-cheat violations and speed-run threshold anomalies.');
  const [disqualifying, setDisqualifying] = useState(false);
  const [disqualifyError, setDisqualifyError] = useState<string | null>(null);

  const handleExportCsv = async () => {
    try {
      setExportingCsv(true);
      setExportError(null);
      const res = await fetch('/api/admin/telemetry-export', {
        headers: { 'x-admin-secret': adminSecret },
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to export CSV report');
      }

      const blob = await res.blob();
      const contentDisposition = res.headers.get('content-disposition');
      let filename = `anti-cheat-report-${new Date().toISOString().split('T')[0]}.csv`;
      if (contentDisposition) {
        const match = contentDisposition.match(/filename="?([^"]+)"?/);
        if (match && match[1]) filename = match[1];
      }

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setExportError(err.message || 'CSV export failed');
    } finally {
      setExportingCsv(false);
    }
  };

  const handleDisqualifyParticipant = async () => {
    if (!disqualifyCandidate) return;

    setDisqualifying(true);
    setDisqualifyError(null);

    try {
      const res = await fetch('/api/admin/disqualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: disqualifyCandidate.userId,
          reason: disqualifyReason,
          adminSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to disqualify participant');
      }

      // Mark user in local telemetry records
      setTelemetryRecords((prev) =>
        prev.map((rec) => {
          if (rec.user_id === disqualifyCandidate.userId) {
            return {
              ...rec,
              flagged_too_fast: true,
              flag_reason: `DISQUALIFIED: ${disqualifyReason}`,
              user: rec.user
                ? {
                    ...rec.user,
                    role: 'disqualified',
                    is_disqualified: true,
                    is_flagged: true,
                  } as any
                : rec.user,
            };
          }
          return rec;
        })
      );

      setDisqualifyCandidate(null);
      fetchTelemetry();
    } catch (err: any) {
      setDisqualifyError(err.message || 'Failed to disqualify participant');
    } finally {
      setDisqualifying(false);
    }
  };

  const handleReinstate = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/disqualify', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, adminSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reinstate');

      setTelemetryRecords((prev) =>
        prev.map((rec) => {
          if (rec.user_id === userId) {
            return {
              ...rec,
              user: rec.user
                ? ({
                    ...rec.user,
                    role: 'participant',
                    is_disqualified: false,
                  } as any)
                : rec.user,
            };
          }
          return rec;
        })
      );
      fetchTelemetry();
    } catch (err: any) {
      alert(err.message || 'Failed to reinstate participant');
    }
  };

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
        id: 't-0',
        user_id: '00000000-0000-0000-0000-000000000001',
        stage_number: 1,
        started_at: new Date(Date.now() - 180000).toISOString(),
        completed_at: new Date(Date.now() - 40000).toISOString(),
        duration_seconds: 22,
        tab_switches: 3,
        fullscreen_exits: 2,
        flagged_too_fast: true,
        flag_reason: 'Suspicious Telemetry: Multiple tab switches during active stage',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        user: {
          name: 'Alex Mercer (Contestant)',
          email: 'alex.mercer@aiclub.org',
          total_score: 150,
          current_stage: 1,
          is_flagged: true,
        },
      },
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Live Stream</span>
            <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-mono">
              <Radio className="w-3 h-3 animate-pulse" /> ACTIVE
            </span>
          </div>
          <div className="text-2xl font-extrabold text-white font-mono mt-1">
            {telemetryRecords.length}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Stage telemetry events recorded</p>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Suspicious Speed-Runs</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-2xl font-extrabold text-rose-400 font-mono mt-1">
            {telemetryRecords.filter((r) => r.flagged_too_fast).length}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Stages completed &lt; min threshold</p>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Fullscreen Exits</span>
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-2xl font-extrabold text-amber-400 font-mono mt-1">
            {telemetryRecords.reduce((acc, r) => acc + (r.fullscreen_exits || 0), 0)}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Total arena departures</p>
        </div>

        <div className="p-4 rounded-xl glass-panel border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span>Tab Switches</span>
            <Eye className="w-3.5 h-3.5 text-violet-400" />
          </div>
          <div className="text-2xl font-extrabold text-violet-400 font-mono mt-1">
            {telemetryRecords.reduce((acc, r) => acc + (r.tab_switches || 0), 0)}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">Total background blurs</p>
        </div>
      </div>

      {/* Telemetry Radar Table */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Radar className="w-4 h-4 text-rose-400 animate-spin" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Live Anti-Cheat & Telemetry Radar
            </h3>
          </div>

          <div className="flex items-center gap-3">
            {exportError && (
              <span className="text-xs text-rose-400 font-mono flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                {exportError}
              </span>
            )}

            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {exportingCsv ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating CSV...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export Anti-Cheat Report</span>
                </>
              )}
            </button>

            <button
              onClick={() => setFilterOnlyFlagged(!filterOnlyFlagged)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border ${
                filterOnlyFlagged
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Filter className="w-3 h-3" />
              Flagged Only ({totalFlagged})
            </button>

            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search participant or alert..."
                className="w-48 sm:w-64 px-3 py-1.5 pl-8 text-xs text-white bg-slate-900 border border-slate-700 rounded-lg focus:border-cyan-400 font-mono"
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

                  const isDisqualified =
                    rec.user?.role === 'disqualified' ||
                    (rec.user as any)?.is_disqualified === true;

                  return (
                    <tr
                      key={rec.id}
                      className={`transition-colors ${
                        isDisqualified
                          ? 'bg-rose-950/40 border-l-2 border-l-rose-500'
                          : isRedFlag
                          ? 'bg-rose-950/20 hover:bg-rose-950/30'
                          : 'hover:bg-slate-900/40'
                      }`}
                    >
                      <td className="px-4 py-3 font-sans">
                        <div className="font-semibold text-white flex items-center gap-1.5">
                          {rec.user?.name || 'Unknown User'}
                          {isDisqualified && (
                            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-600 text-rose-400 font-bold">
                              SUSPENDED
                            </span>
                          )}
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
                        {isDisqualified ? (
                          <div className="flex flex-col gap-0.5">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-500 rounded-full w-fit">
                              <Ban className="w-3 h-3 text-rose-400" />
                              DISQUALIFIED
                            </span>
                            <span className="text-[10px] text-rose-400 font-sans max-w-[200px] truncate" title={rec.flag_reason || 'Disqualified'}>
                              {rec.flag_reason || 'Fair-play violation sanction'}
                            </span>
                          </div>
                        ) : isRedFlag ? (
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
                        {isDisqualified ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] text-rose-400 font-mono italic mr-1">
                              Suspended
                            </span>
                            <button
                              onClick={() => handleReinstate(rec.user_id)}
                              className="px-2 py-1 text-[10px] font-bold text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900 rounded border border-emerald-800/60 transition-colors cursor-pointer flex items-center gap-1"
                              title="Reinstate participant credentials"
                            >
                              <RotateCcw className="w-3 h-3 text-emerald-400" />
                              <span>Reinstate</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-1.5">
                            {isRedFlag && (
                              <button
                                onClick={() => handleClearFlag(rec.id, rec.user_id)}
                                className="px-2 py-1 text-[10px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded border border-slate-700 transition-colors cursor-pointer"
                              >
                                Clear
                              </button>
                            )}
                            <button
                              onClick={() =>
                                setDisqualifyCandidate({
                                  userId: rec.user_id,
                                  userName: rec.user?.name || 'Unknown User',
                                  userEmail: rec.user?.email || 'N/A',
                                })
                              }
                              className="px-2 py-1 text-[10px] font-bold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 rounded border border-rose-800/60 transition-colors cursor-pointer flex items-center gap-1"
                              title="Disqualify participant from tournament"
                            >
                              <Ban className="w-3 h-3 text-rose-400" />
                              <span>Disqualify</span>
                            </button>
                          </div>
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

      {/* Disqualification Confirmation Modal */}
      {disqualifyCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 glass-panel rounded-2xl border border-rose-500/60 shadow-2xl space-y-4 text-left bg-slate-950">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400">
                <Ban className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Confirm Participant Disqualification</h3>
                <p className="text-xs text-rose-400">Irreversible tournament sanction</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-xs font-bold text-white">{disqualifyCandidate.userName}</div>
              <div className="text-[11px] font-mono text-slate-400">{disqualifyCandidate.userEmail}</div>
              <div className="text-[10px] font-mono text-slate-500">ID: {disqualifyCandidate.userId}</div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Disqualifying this participant will immediately lock their arena session, revoke stage decryption permissions, prevent any further submissions, and broadcast a real-time suspension notice to their browser.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                Disqualification Reason (Displayed to Participant):
              </label>
              <textarea
                value={disqualifyReason}
                onChange={(e) => setDisqualifyReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-rose-400 focus:outline-none resize-none font-mono"
              />
            </div>

            {disqualifyError && (
              <p className="text-xs text-rose-400 font-medium">{disqualifyError}</p>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDisqualifyCandidate(null)}
                disabled={disqualifying}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisqualifyParticipant}
                disabled={disqualifying}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl shadow-neon-rose transition-all cursor-pointer disabled:opacity-50"
              >
                {disqualifying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Disqualifying...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Enforce Disqualification</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
