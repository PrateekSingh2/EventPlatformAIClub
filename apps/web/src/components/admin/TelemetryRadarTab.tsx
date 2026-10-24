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
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Monitor,
  Trophy,
  RefreshCw,
  Pause,
  Play,
  Layers,
  Sparkles,
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
    <div className="space-y-5 sm:space-y-6">
      {/* Top Telemetry Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {/* Card 1: Active Contestants */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border space-y-1">
          <div className="flex items-center justify-between text-app-subtext text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Contestants</span>
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-mono font-medium bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full">
              <Radio className="w-2.5 h-2.5 animate-pulse text-emerald-400" /> Live
            </span>
          </div>
          <div className="text-xl sm:text-2xl font-bold text-app-text flex items-baseline gap-1.5">
            <span>{totalContestants}</span>
            <span className="text-[11px] text-app-subtext font-normal">active</span>
          </div>
          <div className="text-[11px] text-app-subtext flex items-center justify-between pt-0.5">
            <span>{totalCompletedCount} completed</span>
            {lastUpdated && <span className="text-[10px] text-app-subtext font-mono">{lastUpdated}</span>}
          </div>
        </div>

        {/* Card 2: Total Tab Switches */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border space-y-1">
          <div className="flex items-center justify-between text-app-subtext text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Tab Switches</span>
            <Eye className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-indigo-400 flex items-baseline gap-1.5">
            <span>{totalTabSwitchesAll}</span>
            <span className="text-[11px] text-app-subtext font-normal">total</span>
          </div>
          <p className="text-[11px] text-app-subtext pt-0.5">Background window blurs</p>
        </div>

        {/* Card 3: Fullscreen Exits */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border space-y-1">
          <div className="flex items-center justify-between text-app-subtext text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Screen Exits</span>
            <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-amber-400 flex items-baseline gap-1.5">
            <span>{totalFullscreenExitsAll}</span>
            <span className="text-[11px] text-app-subtext font-normal">exits</span>
          </div>
          <p className="text-[11px] text-app-subtext pt-0.5">Window escapes logged</p>
        </div>

        {/* Card 4: Flagged & Suspicious */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border space-y-1">
          <div className="flex items-center justify-between text-app-subtext text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Flagged</span>
            <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-rose-400 flex items-baseline gap-1.5">
            <span>{totalFlaggedCount}</span>
            <span className="text-[11px] text-app-subtext font-normal">review</span>
          </div>
          <p className="text-[11px] text-app-subtext pt-0.5">Integrity alerts raised</p>
        </div>

        {/* Card 5: Disqualified / Sanctioned */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface border border-app-border space-y-1 col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-app-subtext text-xs">
            <span className="font-semibold uppercase tracking-wider text-[11px]">Disqualified</span>
            <Ban className="w-3.5 h-3.5 text-red-500" />
          </div>
          <div className="text-xl sm:text-2xl font-bold text-red-400 flex items-baseline gap-1.5">
            <span>{totalDisqualifiedCount}</span>
            <span className="text-[11px] text-app-subtext font-normal">banned</span>
          </div>
          <p className="text-[11px] text-app-subtext pt-0.5">Access tokens revoked</p>
        </div>
      </div>

      {/* Main Monitoring Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
        {/* Action Header & Live Controls */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-app-surface-raised border border-app-border flex items-center justify-center text-app-text">
              <Radar className="w-4 h-4 text-app-text" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-app-text">
                  Participant Integrity Stream
                </h3>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-app-surface-raised text-app-subtext border border-app-border">
                  {filteredUsers.length} shown
                </span>
              </div>
              <p className="text-xs text-app-subtext">
                Live anti-cheat forensics and session events per contestant
              </p>
            </div>
          </div>

          {/* Controls: Auto-refresh, Manual refresh, CSV Export, Search */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Auto Refresh Toggle */}
            <button
              onClick={() => setIsAutoRefreshActive(!isAutoRefreshActive)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors cursor-pointer min-h-[36px] ${
                isAutoRefreshActive
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-app-text'
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
                  <Play className="w-3 h-3 text-app-subtext" />
                  <span>Paused</span>
                </>
              )}
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchTelemetry(true)}
              disabled={refreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-app-surface-raised hover:bg-app-surface text-app-text border border-app-border transition-colors cursor-pointer disabled:opacity-50 min-h-[36px]"
              title="Force immediate refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-app-text' : 'text-app-subtext'}`} />
              <span>Refresh</span>
            </button>

            {/* CSV Export Button */}
            <button
              onClick={handleExportCsv}
              disabled={exportingCsv}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-app-text text-app-bg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 min-h-[36px]"
            >
              {exportingCsv ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  <span>Export CSV</span>
                </>
              )}
            </button>

            {/* Search Input */}
            <div className="relative w-full sm:w-56">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contestant or reason..."
                className="w-full px-3 py-1.5 pl-8 text-xs text-app-text bg-app-bg border border-app-border rounded-lg focus:outline-none focus:border-zinc-400 font-sans outline-none transition-colors min-h-[36px]"
              />
              <Search className="w-3.5 h-3.5 text-app-subtext absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        {/* Filter Pills with Horizontal Scroll on Mobile */}
        <div className="overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-1.5 min-w-max">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border min-h-[32px] ${
                statusFilter === 'all'
                  ? 'bg-app-text text-app-bg border-app-text'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-app-text'
              }`}
            >
              All Contestants ({users.length})
            </button>
            <button
              onClick={() => setStatusFilter('flagged')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 min-h-[32px] ${
                statusFilter === 'flagged'
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-rose-400'
              }`}
            >
              <AlertTriangle className="w-3 h-3 text-rose-400" />
              Flagged ({totalFlaggedCount})
            </button>
            <button
              onClick={() => setStatusFilter('disqualified')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 min-h-[32px] ${
                statusFilter === 'disqualified'
                  ? 'bg-red-500/20 text-red-300 border-red-500/40'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-red-400'
              }`}
            >
              <Ban className="w-3 h-3 text-red-400" />
              Disqualified ({totalDisqualifiedCount})
            </button>
            <button
              onClick={() => setStatusFilter('completed')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 min-h-[32px] ${
                statusFilter === 'completed'
                  ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-indigo-400'
              }`}
            >
              <Trophy className="w-3 h-3 text-indigo-400" />
              Finished ({totalCompletedCount})
            </button>
            <button
              onClick={() => setStatusFilter('clean')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer border flex items-center gap-1.5 min-h-[32px] ${
                statusFilter === 'clean'
                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  : 'bg-app-surface-raised text-app-subtext border-app-border hover:text-emerald-400'
              }`}
            >
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              Clean ({users.length - totalFlaggedCount - totalDisqualifiedCount})
            </button>
          </div>
        </div>

        {/* Mobile Cards View (Visible on screens < lg) */}
        <div className="block lg:hidden space-y-3">
          {loading ? (
            <div className="p-8 text-center text-app-subtext bg-app-surface-raised rounded-xl border border-app-border">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-app-text" />
              Connecting to telemetry stream...
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="p-8 text-center text-app-subtext bg-app-surface-raised rounded-xl border border-app-border">
              {telemetryError || 'No contestants found matching the filter.'}
            </div>
          ) : (
            filteredUsers.map((user) => {
              const isExpanded = expandedUserIds.has(user.user_id);
              const isDisqualified = user.is_disqualified;
              const isSuspicious = user.is_flagged && !isDisqualified;
              const isHighTabs = user.total_tab_switches > 2;

              return (
                <div
                  key={`mobile-${user.user_id}`}
                  className={`p-3.5 rounded-xl border transition-colors space-y-3 ${
                    isDisqualified
                      ? 'bg-rose-500/5 border-rose-500/30'
                      : isSuspicious
                      ? 'bg-amber-500/5 border-amber-500/30'
                      : user.is_completed
                      ? 'bg-indigo-500/5 border-indigo-500/30'
                      : 'bg-app-surface-raised border-app-border'
                  }`}
                >
                  {/* Top: Name, Status Pill */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-app-text">{user.name}</span>
                        {user.is_completed && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                            <Trophy className="w-2.5 h-2.5" /> Done
                          </span>
                        )}
                        {isDisqualified && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold">
                            BANNED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-app-subtext font-mono break-all">{user.email}</div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-bold text-emerald-400 font-mono">
                        {user.total_score} PTS
                      </span>
                      <div className="text-[10px] text-app-subtext font-mono">
                        Stage {user.current_stage}
                      </div>
                    </div>
                  </div>

                  {/* Anti-cheat Metrics Pills */}
                  <div className="grid grid-cols-3 gap-2 text-center text-xs font-mono pt-1">
                    <div className="p-2 rounded-lg bg-app-surface border border-app-border">
                      <div className="text-[10px] text-app-subtext uppercase">Tab Blur</div>
                      <div className={`font-bold mt-0.5 ${isHighTabs ? 'text-rose-400' : 'text-app-text'}`}>
                        {user.total_tab_switches}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-app-surface border border-app-border">
                      <div className="text-[10px] text-app-subtext uppercase">Screen Exit</div>
                      <div className={`font-bold mt-0.5 ${user.total_fullscreen_exits > 1 ? 'text-amber-400' : 'text-app-text'}`}>
                        {user.total_fullscreen_exits}
                      </div>
                    </div>
                    <div className="p-2 rounded-lg bg-app-surface border border-app-border">
                      <div className="text-[10px] text-app-subtext uppercase">Bad Passwords</div>
                      <div className={`font-bold mt-0.5 ${user.total_password_failed_attempts > 0 ? 'text-amber-400' : 'text-app-text'}`}>
                        {user.total_password_failed_attempts}
                      </div>
                    </div>
                  </div>

                  {/* Flag Reason Banner if any */}
                  {user.flag_reasons.length > 0 && (
                    <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-sans">
                      <span className="font-semibold">Alert: </span>
                      {user.flag_reasons[0]}
                    </div>
                  )}

                  {/* Mobile Actions Toolbar */}
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-app-border">
                    <button
                      onClick={() => toggleExpandUser(user.user_id)}
                      className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-app-surface hover:bg-app-hover text-app-text border border-app-border transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      <span>Stages ({user.stages.length})</span>
                      {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>

                    <div className="flex items-center gap-1.5">
                      {(user.is_flagged || user.flag_reasons.length > 0) && !isDisqualified && (
                        <button
                          onClick={() => handleClearFlag(user.user_id)}
                          className="px-2.5 py-1.5 text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg cursor-pointer"
                        >
                          Clear Flag
                        </button>
                      )}

                      {isDisqualified ? (
                        <button
                          onClick={() => handleReinstate(user.user_id)}
                          className="px-2.5 py-1.5 text-xs font-bold text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-lg cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" /> Reinstate
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
                          className="px-2.5 py-1.5 text-xs font-bold text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-lg cursor-pointer flex items-center gap-1"
                        >
                          <Ban className="w-3 h-3" /> Disqualify
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Mobile Stage Breakdown Drawer */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-app-border space-y-2">
                      <div className="text-[11px] font-semibold text-app-subtext uppercase">
                        Stage Telemetry Details:
                      </div>
                      {user.stages.length === 0 ? (
                        <p className="text-xs text-app-subtext italic">No stage records logged yet.</p>
                      ) : (
                        user.stages.map((stg) => (
                          <div
                            key={stg.id || stg.stage_number}
                            className="p-2.5 rounded-lg bg-app-surface border border-app-border text-xs font-mono space-y-1"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-app-text">Stage {stg.stage_number}</span>
                              <span className="text-[10px] text-app-subtext">
                                {stg.duration_seconds !== null ? `${stg.duration_seconds}s duration` : 'Active'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-x-2 text-[11px] text-app-subtext">
                              <div>Tab switches: <strong className="text-app-text">{stg.tab_switches}</strong></div>
                              <div>Fullscreen exits: <strong className="text-app-text">{stg.fullscreen_exits}</strong></div>
                              <div>Failed keys: <strong className="text-app-text">{stg.password_failed_attempts || 0}</strong></div>
                              <div>Speedrun: <strong className={stg.flagged_too_fast ? 'text-rose-400' : 'text-app-text'}>{stg.flagged_too_fast ? 'FLAG' : 'OK'}</strong></div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Primary Desktop Monitoring Table (Hidden on small screens) */}
        <div className="hidden lg:block overflow-x-auto rounded-xl border border-app-border bg-app-surface">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-app-bg text-app-subtext uppercase text-[10px] tracking-wider border-b border-app-border">
              <tr>
                <th className="px-4 py-3.5 font-sans">Participant</th>
                <th className="px-3 py-3.5">Level</th>
                <th className="px-3 py-3.5">Score</th>
                <th className="px-4 py-3.5 text-center bg-app-surface-raised font-bold text-indigo-400">
                  <div className="flex items-center justify-center gap-1">
                    <Eye className="w-3 h-3 text-indigo-400" />
                    <span>Total Tab Switches</span>
                  </div>
                </th>
                <th className="px-3 py-3.5 text-center">Fullscreen Exits</th>
                <th className="px-3 py-3.5 text-center">Hardware / Probes</th>
                <th className="px-3 py-3.5 text-center">Failed Keys</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5 text-right font-sans">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border bg-app-surface">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-app-subtext">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-app-text" />
                    Connecting to live telemetry feed...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-app-subtext">
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
                        className={`transition-colors font-mono hover:bg-app-hover/30 ${
                          isDisqualified
                            ? 'bg-rose-500/5 border-l-4 border-l-rose-500'
                            : isSuspicious
                            ? 'bg-amber-500/5 hover:bg-amber-500/10 border-l-4 border-l-amber-500'
                            : user.is_completed
                            ? 'bg-indigo-500/5'
                            : ''
                        }`}
                      >
                        {/* 1. Participant Details */}
                        <td className="px-4 py-3 font-sans">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-app-text text-sm">
                              {user.name}
                            </span>
                            {user.is_completed && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 font-semibold">
                                <Trophy className="w-2.5 h-2.5" /> Finished
                              </span>
                            )}
                            {isDisqualified && (
                              <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 font-bold">
                                BANNED
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-app-subtext font-mono mt-0.5">
                            {user.email}
                          </div>
                        </td>

                        {/* 2. Current Level */}
                        <td className="px-3 py-3 font-mono">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-lg bg-app-surface-raised border border-app-border text-app-text">
                            <Layers className="w-3 h-3 text-app-subtext" />
                            Stage {user.current_stage}
                          </span>
                        </td>

                        {/* 3. Score */}
                        <td className="px-3 py-3 font-mono">
                          <span className="text-xs font-bold text-emerald-400">
                            {user.total_score} PTS
                          </span>
                        </td>

                        {/* 4. TOTAL TAB SWITCHES */}
                        <td className="px-4 py-3 text-center bg-app-surface-raised/40">
                          <span
                            className={`inline-flex items-center justify-center font-bold font-mono px-2.5 py-0.5 rounded-lg text-xs ${
                              isHighTabs
                                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold'
                                : user.total_tab_switches > 0
                                ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                                : 'text-app-subtext bg-app-surface-raised border border-app-border'
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
                                : 'text-app-subtext'
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
                            <span className="text-app-subtext text-xs">0</span>
                          )}
                        </td>

                        {/* 7. Failed Password Attempts */}
                        <td className="px-3 py-3 text-center">
                          <span
                            className={`text-xs ${
                              user.total_excessive_guesses > 0
                                ? 'text-rose-400 font-bold'
                                : user.total_password_failed_attempts > 0
                                ? 'text-amber-400 font-semibold'
                                : 'text-app-subtext'
                            }`}
                          >
                            {user.total_password_failed_attempts}
                          </span>
                        </td>

                        {/* 8. Anti-Cheat Overall Status */}
                        <td className="px-4 py-3">
                          {isDisqualified ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 bg-rose-500/20 text-rose-300 border border-rose-500/40 rounded-full w-fit">
                                <Ban className="w-3 h-3 text-rose-400" />
                                DISQUALIFIED
                              </span>
                              {user.flag_reasons.length > 0 && (
                                <span className="text-[10px] text-rose-300/80 font-sans max-w-[200px] truncate" title={user.flag_reasons[0]}>
                                  {user.flag_reasons[0]}
                                </span>
                              )}
                            </div>
                          ) : isSuspicious ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                <ShieldAlert className="w-3 h-3 text-amber-400" />
                                SUSPICIOUS
                              </span>
                              {user.flag_reasons.length > 0 && (
                                <span className="text-[10px] text-amber-300/80 font-sans max-w-[200px] truncate" title={user.flag_reasons.join(', ')}>
                                  {user.flag_reasons[0]}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                              <CheckCircle className="w-3.5 h-3.5" />
                              Clean Session
                            </span>
                          )}
                        </td>

                        {/* 9. Action Buttons */}
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            {/* Expand Stage Breakdown Accordion */}
                            <button
                              onClick={() => toggleExpandUser(user.user_id)}
                              className="px-2 py-1 text-[11px] font-medium rounded-lg bg-app-surface-raised hover:bg-app-hover text-app-text border border-app-border transition-colors cursor-pointer flex items-center gap-1"
                              title="Toggle per-stage forensic details"
                            >
                              <span>Stages ({user.stages.length})</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 text-app-subtext" />
                              ) : (
                                <ChevronDown className="w-3 h-3 text-app-subtext" />
                              )}
                            </button>

                            {/* Clear Flag */}
                            {(user.is_flagged || user.flag_reasons.length > 0) && !isDisqualified && (
                              <button
                                onClick={() => handleClearFlag(user.user_id)}
                                className="px-2 py-1 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
                                title="Clear all anti-cheat flags"
                              >
                                <CheckCircle className="w-3 h-3" />
                                <span>Clear</span>
                              </button>
                            )}

                            {/* Disqualify / Reinstate */}
                            {isDisqualified ? (
                              <button
                                onClick={() => handleReinstate(user.user_id)}
                                className="px-2 py-1 text-[11px] font-bold text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg border border-emerald-500/30 transition-colors cursor-pointer flex items-center gap-1"
                                title="Reinstate participant credentials"
                              >
                                <RotateCcw className="w-3 h-3" />
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
                                className="px-2 py-1 text-[11px] font-bold text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 rounded-lg border border-rose-500/30 transition-colors cursor-pointer flex items-center gap-1"
                                title="Disqualify contestant from tournament"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Disqualify</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Expandable Per-Stage Forensic Drawer */}
                      {isExpanded && (
                        <tr className="bg-app-bg border-b border-app-border">
                          <td colSpan={9} className="p-4 pl-8">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-app-text uppercase tracking-wider flex items-center gap-1.5 font-sans">
                                  <Clock className="w-3.5 h-3.5 text-app-subtext" />
                                  <span>Per-Stage Forensics for {user.name}</span>
                                </h4>
                                <span className="text-[10px] text-app-subtext font-mono">
                                  User ID: {user.user_id}
                                </span>
                              </div>

                              {user.stages.length === 0 ? (
                                <p className="text-xs text-app-subtext italic py-1 font-sans">
                                  No stage-specific telemetry records created yet.
                                </p>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 pt-1">
                                  {user.stages.map((stg) => (
                                    <div
                                      key={stg.id || stg.stage_number}
                                      className="p-3 rounded-xl bg-app-surface border border-app-border text-xs font-mono space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between border-b border-app-border pb-1">
                                        <span className="font-bold text-app-text">
                                          Stage {stg.stage_number}
                                        </span>
                                        <span className="text-[10px] text-app-subtext">
                                          {stg.duration_seconds !== null ? `${stg.duration_seconds}s duration` : 'Active'}
                                        </span>
                                      </div>

                                      <div className="grid grid-cols-2 gap-x-2 text-[11px] pt-0.5 text-app-subtext">
                                        <div>
                                          Tab Switches: <span className="font-bold text-app-text">{stg.tab_switches}</span>
                                        </div>
                                        <div>
                                          Fullscreen Exits: <span className="font-bold text-app-text">{stg.fullscreen_exits}</span>
                                        </div>
                                        <div>
                                          Key Attempts: <span className="font-bold text-app-text">{stg.password_failed_attempts || 0}</span>
                                        </div>
                                        <div>
                                          Speedrun: <span className={stg.flagged_too_fast ? 'text-rose-400 font-bold' : 'text-app-text'}>{stg.flagged_too_fast ? 'FLAGGED' : 'Normal'}</span>
                                        </div>
                                      </div>

                                      {stg.flag_reason && (
                                        <div className="text-[10px] text-rose-300 bg-rose-500/10 p-1.5 rounded border border-rose-500/20 font-sans mt-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-5 sm:p-6 rounded-2xl border border-rose-500/40 shadow-2xl space-y-4 text-left bg-app-surface">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-app-text">Confirm Disqualification</h3>
                <p className="text-xs text-rose-400">Tournament sanction and access revocation</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-app-bg border border-app-border space-y-1">
              <div className="text-xs font-bold text-app-text">{disqualifyCandidate.userName}</div>
              <div className="text-[11px] font-mono text-app-subtext">{disqualifyCandidate.userEmail}</div>
              <div className="text-[10px] font-mono text-app-subtext/70">ID: {disqualifyCandidate.userId}</div>
            </div>

            <p className="text-xs text-app-subtext leading-relaxed">
              Disqualifying this participant will immediately lock their arena session, revoke stage decryption permissions, prevent further submissions, and suspend account access with a fair-play notice.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-app-text mb-1">
                Disqualification Reason (Displayed to Participant):
              </label>
              <textarea
                value={disqualifyReason}
                onChange={(e) => setDisqualifyReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:border-rose-400 focus:outline-none resize-none font-sans"
              />
            </div>

            {disqualifyError && (
              <p className="text-xs text-rose-400 font-medium">{disqualifyError}</p>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDisqualifyCandidate(null)}
                disabled={disqualifying}
                className="px-4 py-2 text-xs font-semibold text-app-subtext hover:text-app-text bg-app-surface-raised hover:bg-app-hover border border-app-border rounded-xl transition-colors cursor-pointer min-h-[38px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDisqualifyParticipant}
                disabled={disqualifying}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                {disqualifying ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Enforcing...</span>
                  </>
                ) : (
                  <>
                    <Ban className="w-3.5 h-3.5" />
                    <span>Disqualify Contestant</span>
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
