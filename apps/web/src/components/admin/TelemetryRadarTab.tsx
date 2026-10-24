'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { UserTelemetrySummary, StageTelemetry } from '@/lib/types';
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
  ChevronDown,
  ChevronUp,
  Monitor,
  KeyRound,
  Trophy,
  RefreshCw,
  Pause,
  Play,
  Layers,
} from 'lucide-react';

interface TelemetryRadarTabProps {
  adminSecret: string;
}

export function TelemetryRadarTab({ adminSecret }: TelemetryRadarTabProps) {
  const [users, setUsers] = useState<UserTelemetrySummary[]>([]);
  const [rawRecords, setRawRecords] = useState<StageTelemetry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [telemetryError, setTelemetryError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [isAutoRefreshActive, setIsAutoRefreshActive] = useState(true);

  // Expanded user details drawer
  const [expandedUserIds, setExpandedUserIds] = useState<Set<string>>(new Set());

  // Search and Filter states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'flagged' | 'disqualified' | 'clean' | 'completed'>('all');

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

  // Active fetch ref to avoid race conditions
  const isFetchingRef = useRef(false);

  const fetchTelemetry = useCallback(async (isManual = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    if (isManual) setRefreshing(true);

    try {
      setTelemetryError(null);
      const res = await fetch(`/api/admin/telemetry?t=${Date.now()}`, {
        headers: { 'x-admin-secret': adminSecret },
        cache: 'no-store',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load live telemetry');

      setUsers((data.users || []) as UserTelemetrySummary[]);
      setRawRecords((data.records || []) as StageTelemetry[]);
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to load telemetry records', err);
      setTelemetryError(err instanceof Error ? err.message : 'Could not load live telemetry.');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, [adminSecret]);

  // Initial load and periodic polling interval
  useEffect(() => {
    fetchTelemetry();

    if (!isAutoRefreshActive) return;

    const interval = window.setInterval(() => {
      fetchTelemetry();
    }, 3000);

    return () => window.clearInterval(interval);
  }, [fetchTelemetry, isAutoRefreshActive]);

  // Real-time Supabase subscriptions on stage_telemetry & users tables
  useEffect(() => {
    if (!isSupabaseConfigured) return;

    const channel = supabase
      .channel('admin-telemetry-live-feed')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stage_telemetry' },
        () => {
          fetchTelemetry();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          fetchTelemetry();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchTelemetry]);

  const toggleExpandUser = (userId: string) => {
    setExpandedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

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

      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_id === disqualifyCandidate.userId) {
            return {
              ...u,
              is_disqualified: true,
              is_flagged: true,
              role: 'disqualified',
              flag_reasons: [`DISQUALIFIED: ${disqualifyReason}`, ...u.flag_reasons],
            };
          }
          return u;
        })
      );

      setDisqualifyCandidate(null);
      fetchTelemetry(true);
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

      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_id === userId) {
            return {
              ...u,
              is_disqualified: false,
              is_flagged: false,
              role: 'participant',
              current_stage: 1,
              total_score: 0,
              is_completed: false,
              flag_reasons: [],
              total_tab_switches: 0,
              total_fullscreen_exits: 0,
              total_multi_monitor: 0,
              total_devtools_timing: 0,
              total_window_discrepancies: 0,
              total_password_failed_attempts: 0,
              total_excessive_guesses: 0,
              flagged_speedruns: 0,
              stages: [],
            };
          }
          return u;
        })
      );
      fetchTelemetry(true);
    } catch (err: any) {
      alert(err.message || 'Failed to reinstate participant');
    }
  };

  const handleClearFlag = async (userId: string) => {
    try {
      const res = await fetch('/api/admin/telemetry', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          action: 'clear_flag',
          userId,
          adminSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear flag');

      setUsers((prev) =>
        prev.map((u) => {
          if (u.user_id === userId) {
            const wasDisqualified = u.is_disqualified;
            return {
              ...u,
              is_flagged: false,
              is_disqualified: false,
              role: 'participant',
              ...(wasDisqualified ? { current_stage: 1, total_score: 0, is_completed: false, stages: [] } : {}),
              flag_reasons: [],
              total_tab_switches: 0,
              total_fullscreen_exits: 0,
              total_multi_monitor: 0,
              total_devtools_timing: 0,
              total_window_discrepancies: 0,
              total_password_failed_attempts: 0,
              total_excessive_guesses: 0,
              flagged_speedruns: 0,
            };
          }
          return u;
        })
      );

      fetchTelemetry(true);
    } catch (err: any) {
      alert(err.message || 'Failed to clear flag');
    }
  };

  // Filter users based on search and statusFilter
  const filteredUsers = users.filter((u) => {
    if (statusFilter === 'flagged' && (!u.is_flagged || u.is_disqualified)) return false;
    if (statusFilter === 'disqualified' && !u.is_disqualified) return false;
    if (statusFilter === 'clean' && (u.is_flagged || u.is_disqualified)) return false;
    if (statusFilter === 'completed' && !u.is_completed) return false;

    if (!search.trim()) return true;
    const q = search.toLowerCase();
    const name = u.name?.toLowerCase() || '';
    const email = u.email?.toLowerCase() || '';
    const reasons = u.flag_reasons.join(' ').toLowerCase();
    return name.includes(q) || email.includes(q) || reasons.includes(q);
  });

  // Tournament-wide aggregated statistics
  const totalContestants = users.length;
  const totalTabSwitchesAll = users.reduce((acc, u) => acc + (u.total_tab_switches || 0), 0);
  const totalFullscreenExitsAll = users.reduce((acc, u) => acc + (u.total_fullscreen_exits || 0), 0);
  const totalFlaggedCount = users.filter((u) => u.is_flagged && !u.is_disqualified).length;
  const totalDisqualifiedCount = users.filter((u) => u.is_disqualified).length;
  const totalCompletedCount = users.filter((u) => u.is_completed).length;

  return (
    <div className="space-y-6">
      {/* Top Mission Control Telemetry Stats Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Card 1: Active Contestants */}
        <div className="p-4 rounded-2xl glass-panel border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Contestants</span>
            <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-mono font-bold bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded-full">
              <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" /> LIVE
            </span>
          </div>
          <div className="text-2xl font-black text-white mt-1.5 flex items-baseline gap-2">
            <span>{totalContestants}</span>
            <span className="text-xs text-slate-500 font-normal">in arena</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>{totalCompletedCount} finished</span>
            {lastUpdated && <span className="text-[10px] text-slate-500 font-mono">{lastUpdated}</span>}
          </div>
        </div>

        {/* Card 2: Total Tab Switches (Requested directly by user!) */}
        <div className="p-4 rounded-2xl glass-panel border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Total Tab Switches</span>
            <Eye className="w-4 h-4 text-violet-400" />
          </div>
          <div className="text-2xl font-black text-violet-400 mt-1.5 flex items-baseline gap-2">
            <span>{totalTabSwitchesAll}</span>
            <span className="text-xs text-slate-500 font-normal">arena-wide</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Background blur beacons</p>
        </div>

        {/* Card 3: Fullscreen Exits */}
        <div className="p-4 rounded-2xl glass-panel border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Fullscreen Exits</span>
            <Maximize2 className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-400 mt-1.5 flex items-baseline gap-2">
            <span>{totalFullscreenExitsAll}</span>
            <span className="text-xs text-slate-500 font-normal">arena departures</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Window escapes recorded</p>
        </div>

        {/* Card 4: Flagged & Suspicious */}
        <div className="p-4 rounded-2xl glass-panel border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Flagged Contestants</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-400 mt-1.5 flex items-baseline gap-2">
            <span>{totalFlaggedCount}</span>
            <span className="text-xs text-slate-500 font-normal">under review</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Triggered fair-play alerts</p>
        </div>

        {/* Card 5: Disqualified / Sanctioned */}
        <div className="p-4 rounded-2xl glass-panel border border-slate-800 bg-slate-950/60 shadow-lg">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Suspended Accounts</span>
            <Ban className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl font-black text-red-500 mt-1.5 flex items-baseline gap-2">
            <span>{totalDisqualifiedCount}</span>
            <span className="text-xs text-slate-500 font-normal">disqualified</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Permanently revoked</p>
        </div>
      </div>

      {/* Main Monitoring Panel */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-slate-800 bg-slate-950/40 space-y-4">
        {/* Action Header & Live Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Radar className="w-4 h-4 animate-spin text-rose-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white tracking-tight uppercase">
                  Telemetry Radar (One Row Per Contestant)
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-bold border border-slate-700">
                  {filteredUsers.length} shown
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Aggregated anti-cheat forensics across all challenge levels
              </p>
            </div>
          </div>

          {/* Controls: Auto-refresh, Manual refresh, CSV Export, Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setIsAutoRefreshActive(!isAutoRefreshActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                isAutoRefreshActive
                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-700/60 shadow-xs'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-white'
              }`}
              title={isAutoRefreshActive ? 'Pause auto-refresh' : 'Resume auto-refresh'}
            >
              {isAutoRefreshActive ? (
                <>
                  <Pause className="w-3 h-3 text-emerald-400" />
                  <span>Live (3s)</span>
                </>
              ) : (
                <>
                  <Play className="w-3 h-3 text-slate-400" />
                  <span>Paused</span>
                </>
              )}
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchTelemetry(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition-all cursor-pointer disabled:opacity-50"
              title="Force immediate refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} />
              <span>Refresh</span>
            </button>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl bg-emerald-950/80 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {exportingCsv ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Generating CSV...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Export Report</span>
                </>
              )}
            </button>

            {/* Search Input */}
            <div className="relative w-full sm:w-60">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search participant or alert..."
                className="w-full px-3 py-1.5 pl-8 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400 font-mono shadow-inner outline-none transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer border ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-700 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-white'
            }`}
          >
            All Contestants ({users.length})
          </button>
          <button
            onClick={() => setStatusFilter('flagged')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 ${
              statusFilter === 'flagged'
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-rose-400'
            }`}
          >
            <AlertTriangle className="w-3 h-3 text-rose-400" />
            Flagged / Suspicious ({totalFlaggedCount})
          </button>
          <button
            onClick={() => setStatusFilter('disqualified')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 ${
              statusFilter === 'disqualified'
                ? 'bg-red-500/20 text-red-300 border-red-500/40 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-red-400'
            }`}
          >
            <Ban className="w-3 h-3 text-red-400" />
            Disqualified ({totalDisqualifiedCount})
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 ${
              statusFilter === 'completed'
                ? 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-purple-400'
            }`}
          >
            <Trophy className="w-3 h-3 text-purple-400" />
            Completed Contest ({totalCompletedCount})
          </button>
          <button
            onClick={() => setStatusFilter('clean')}
            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 ${
              statusFilter === 'clean'
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                : 'bg-slate-900/60 text-slate-400 border-slate-800/80 hover:text-emerald-400'
            }`}
          >
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            Clean ({users.length - totalFlaggedCount - totalDisqualifiedCount})
          </button>
        </div>

        {/* Primary Monitoring Table - Strictly ONE ROW per Contestant */}
        <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/80">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5">Participant</th>
                <th className="px-3 py-3.5">Current Level</th>
                <th className="px-3 py-3.5">Score</th>
                {/* Total Tab Switch count prominently highlighted */}
                <th className="px-4 py-3.5 text-center bg-slate-800/40 font-bold text-violet-300">
                  <div className="flex items-center justify-center gap-1">
                    <Eye className="w-3 h-3 text-violet-400" />
                    <span>Total Tab Switches</span>
                  </div>
                </th>
                <th className="px-3 py-3.5 text-center">Fullscreen Exits</th>
                <th className="px-3 py-3.5 text-center">Hardware / Probes</th>
                <th className="px-3 py-3.5 text-center">Failed Keys</th>
                <th className="px-4 py-3.5">Anti-Cheat Status</th>
                <th className="px-4 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-rose-400" />
                    Connecting to live anti-cheat radar stream...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    {telemetryError || 'No contestants found matching the filter.'}
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isExpanded = expandedUserIds.has(user.user_id);
                  const isDisqualified = user.is_disqualified;
                  const isSuspicious = user.is_flagged && !isDisqualified;
                  const isHighTabs = user.total_tab_switches > 2;

                  return (
                    <React.Fragment key={user.user_id}>
                      <tr
                        className={`transition-colors font-mono ${
                          isDisqualified
                            ? 'bg-rose-950/30 border-l-4 border-l-rose-500'
                            : isSuspicious
                            ? 'bg-amber-950/20 hover:bg-amber-950/30 border-l-4 border-l-amber-500'
                            : user.is_completed
                            ? 'bg-purple-950/10 hover:bg-purple-950/20'
                            : 'hover:bg-slate-900/40'
                        }`}
                      >
                        {/* 1. Participant Details */}
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-sm">
                              {user.name}
                            </span>
                            {user.is_completed && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.2 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold">
                                <Trophy className="w-2.5 h-2.5 text-purple-400" /> Completed
                              </span>
                            )}
                            {isDisqualified && (
                              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-600 text-rose-400 font-bold">
                                BANNED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                            {user.email}
                          </div>
                        </td>

                        {/* 2. Current Level */}
                        <td className="px-3 py-3 font-mono">
                          <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg bg-slate-900 border border-slate-700 text-cyan-300">
                            <Layers className="w-3 h-3 text-cyan-400" />
                            Stage {user.current_stage}
                          </span>
                        </td>

                        {/* 3. Score */}
                        <td className="px-3 py-3 font-mono">
                          <span className="text-xs font-extrabold text-emerald-400">
                            {user.total_score} PTS
                          </span>
                        </td>

                        {/* 4. TOTAL TAB SWITCHES (Sum across all stages) */}
                        <td className="px-4 py-3 text-center bg-slate-900/30">
                          <span
                            className={`inline-flex items-center justify-center font-bold font-mono px-2.5 py-0.5 rounded-lg text-xs ${
                              isHighTabs
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse font-extrabold text-sm'
                                : user.total_tab_switches > 0
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'text-slate-400 bg-slate-900/60 border border-slate-800'
                            }`}
                          >
                            {user.total_tab_switches}
                          </span>
                        </td>

                        {/* 5. Fullscreen Exits */}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`inline-flex items-center justify-center font-bold font-mono px-2 py-0.5 rounded-lg text-xs ${
                              user.total_fullscreen_exits > 1
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                : 'text-slate-400'
                            }`}
                          >
                            {user.total_fullscreen_exits}
                          </span>
                        </td>

                        {/* 6. Hardware & DevTools Probes */}
                        <td className="px-3 py-3 text-center">
                          {user.total_multi_monitor > 0 || user.total_devtools_timing > 0 || user.total_window_discrepancies > 0 ? (
                            <div className="flex items-center justify-center gap-1.5 text-xs text-amber-400">
                              <Monitor className="w-3.5 h-3.5" />
                              <span className="font-bold">
                                {user.total_multi_monitor + user.total_devtools_timing + user.total_window_discrepancies}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-500 text-xs">0</span>
                          )}
                        </td>

                        {/* 7. Failed Password Attempts */}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`text-xs ${
                              user.total_excessive_guesses > 0
                                ? 'text-rose-400 font-extrabold'
                                : user.total_password_failed_attempts > 0
                                ? 'text-amber-400 font-bold'
                                : 'text-slate-500'
                            }`}
                          >
                            {user.total_password_failed_attempts}
                          </span>
                        </td>

                        {/* 8. Anti-Cheat Overall Status */}
                        <td className="px-4 py-3">
                          {isDisqualified ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-950 text-rose-300 border border-rose-500 rounded-full w-fit">
                                <Ban className="w-3 h-3 text-rose-400" />
                                DISQUALIFIED
                              </span>
                              {user.flag_reasons.length > 0 && (
                                <span className="text-[10px] text-rose-400/90 font-sans max-w-[220px] truncate" title={user.flag_reasons[0]}>
                                  {user.flag_reasons[0]}
                                </span>
                              )}
                            </div>
                          ) : isSuspicious ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit bg-rose-500/20 text-rose-300 border border-rose-500/40">
                                <ShieldAlert className="w-3 h-3 text-rose-400" />
                                SUSPICIOUS
                              </span>
                              {user.flag_reasons.length > 0 && (
                                <span className="text-[10px] text-rose-400/90 font-sans max-w-[220px] truncate" title={user.flag_reasons.join(', ')}>
                                  {user.flag_reasons[0]}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Clean Session
                            </span>
                          )}
                        </td>

                        {/* 9. Action Buttons */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Expand Stage Breakdown Accordion */}
                            <button
                              onClick={() => toggleExpandUser(user.user_id)}
                              className="px-2 py-1 text-[11px] font-semibold rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-colors cursor-pointer flex items-center gap-1"
                              title="Toggle per-stage forensic details"
                            >
                              <span>Stages ({user.stages.length})</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 text-slate-400" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-slate-400" />
                              )}
                            </button>

                            {/* Clear Flag */}
                            {(user.is_flagged || user.flag_reasons.length > 0) && !isDisqualified && (
                              <button
                                onClick={() => handleClearFlag(user.user_id)}
                                className="px-2 py-1 text-[11px] font-semibold text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900 rounded-lg border border-emerald-700/60 transition-colors cursor-pointer flex items-center gap-1"
                                title="Clear all anti-cheat flags"
                              >
                                <CheckCircle className="w-3 h-3 text-emerald-400" />
                                <span>Clear</span>
                              </button>
                            )}

                            {/* Disqualify / Reinstate */}
                            {isDisqualified ? (
                              <button
                                onClick={() => handleReinstate(user.user_id)}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-300 hover:text-white bg-emerald-950/60 hover:bg-emerald-900 rounded-lg border border-emerald-800/60 transition-colors cursor-pointer flex items-center gap-1"
                                title="Reinstate participant credentials"
                              >
                                <RotateCcw className="w-3 h-3 text-emerald-400" />
                                <span>Reinstate</span>
                              </button>
                            ) : (
                              <button
                                onClick={() =>
                                  setDisqualifyCandidate({
                                    userId: user.user_id,
                                    userName: user.name,
                                    userEmail: user.email,
                                  })
                                }
                                className="px-2 py-1 text-[11px] font-bold text-rose-300 hover:text-white bg-rose-950/60 hover:bg-rose-900 rounded-lg border border-rose-800/60 transition-colors cursor-pointer flex items-center gap-1"
                                title="Disqualify contestant from tournament"
                              >
                                <Ban className="w-3 h-3 text-rose-400" />
                                <span>Disqualify</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Per-Stage Forensic Drawer */}
                      {isExpanded && (
                        <tr className="bg-slate-900/70 border-b border-slate-800/80 animate-in fade-in duration-150">
                          <td colSpan={9} className="p-4 pl-8">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                                  <span>Per-Stage Forensic Breakdown for {user.name}</span>
                                </h4>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  User ID: {user.user_id}
                                </span>
                              </div>

                              {user.stages.length === 0 ? (
                                <p className="text-xs text-slate-500 italic py-2">
                                  No stage-specific telemetry records created yet.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                                  {user.stages.map((stg) => (
                                    <div
                                      key={stg.id || stg.stage_number}
                                      className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono space-y-1.5 shadow-xs"
                                    >
                                      <div className="flex items-center justify-between border-b border-slate-800 pb-1">
                                        <span className="font-bold text-cyan-300">
                                          Stage {stg.stage_number}
                                        </span>
                                        <span className="text-[10px] text-slate-400">
                                          {stg.duration_seconds !== null ? `${stg.duration_seconds}s duration` : 'In Progress'}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2 text-[11px] pt-0.5">
                                        <div className="text-slate-400">
                                          Tab Switches: <span className="font-bold text-white">{stg.tab_switches}</span>
                                        </div>
                                        <div className="text-slate-400">
                                          Fullscreen Exits: <span className="font-bold text-white">{stg.fullscreen_exits}</span>
                                        </div>
                                        <div className="text-slate-400">
                                          Key Attempts: <span className="font-bold text-white">{stg.password_failed_attempts || 0}</span>
                                        </div>
                                        <div className="text-slate-400">
                                          Speedrun: <span className={stg.flagged_too_fast ? 'text-rose-400 font-bold' : 'text-slate-400'}>{stg.flagged_too_fast ? 'FLAGGED' : 'Normal'}</span>
                                        </div>
                                      </div>

                                      {stg.flag_reason && (
                                        <div className="text-[10px] text-rose-400 bg-rose-500/10 p-1.5 rounded border border-rose-500/20 font-sans mt-1">
                                          {stg.flag_reason}
                                        </div>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
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
              Disqualifying this participant will immediately lock their arena session, revoke stage decryption permissions, prevent further submissions, and suspend account access with a fair-play violation notice.
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
