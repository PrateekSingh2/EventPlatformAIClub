'use client';

import React, { useEffect, useState, useTransition, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { User, ContestStatus } from '@/lib/types';
import {
  sortLeaderboardUsers,
  formatDuration,
  getUserTotalTime,
  getTieBreakReason,
} from '@/lib/leaderboard-sort';
import { readClientCache, writeClientCache } from '@/lib/client-cache';
import {
  Trophy,
  X,
  Search,
  Flame,
  RotateCw,
  Pause,
  CheckCircle2,
  Clock,
  Zap,
  Info,
  ChevronRight,
  Sparkles,
} from 'lucide-react';

interface LiveLeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  currentUserToken?: string;
  currentUser?: User;
  contestStatus?: ContestStatus;
}

export function LiveLeaderboard({
  isOpen,
  onClose,
  currentUserId,
  currentUserToken,
  currentUser: propCurrentUser,
  contestStatus = 'LIVE',
}: LiveLeaderboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'round2' | 'top5' | 'my-stage'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRulesInfo, setShowRulesInfo] = useState(false);
  const [expandedUser, setExpandedUser] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const isFrozen = contestStatus === 'FROZEN';
  const isConcluded = contestStatus === 'CONCLUDED';

  // Combined fetch of leaderboard applying deterministic multi-tier tie-breaking
  const fetchLeaderboard = useCallback(async (preferNetwork = true, scope: 'all' | 'round2' = 'all') => {
    const cacheKey = scope === 'round2' ? 'arena_leaderboard_r2' : 'arena_leaderboard';
    const cached = readClientCache<{ users: User[] }>(cacheKey, 25_000);
    if (cached?.users?.length) {
      setUsers(sortLeaderboardUsers(cached.users));
      if (!preferNetwork) return;
    }

    try {
      const url = scope === 'round2' ? '/api/leaderboard?scope=round2' : '/api/leaderboard';
      const res = await fetch(url, { cache: 'default' });
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.users)) {
          const sorted = sortLeaderboardUsers(json.users as User[]);
          setUsers(sorted);
          writeClientCache(cacheKey, { users: sorted });
          return;
        }
      }
    } catch (err) {
      console.warn('[LiveLeaderboard]: Failed to fetch unified leaderboard', err);
    }

    if (!cached?.users?.length) setUsers([]);
  }, []);

  // Poll + Supabase Realtime while drawer is open
  useEffect(() => {
    if (!isOpen) return;

    const scope = activeTab === 'round2' ? 'round2' : 'all';
    fetchLeaderboard(true, scope);

    const interval = setInterval(() => {
      fetchLeaderboard(true, activeTab === 'round2' ? 'round2' : 'all');
    }, 30_000);

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    if (isSupabaseConfigured) {
      channel = supabase
        .channel('leaderboard-channel')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'users' },
          () => {
            if (contestStatus === 'FROZEN' || contestStatus === 'CONCLUDED') return;
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              startTransition(() => {
                fetchLeaderboard(true, activeTab === 'round2' ? 'round2' : 'all');
              });
            }, 5000);
          }
        )
        .subscribe();
    }

    return () => {
      clearInterval(interval);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [isOpen, fetchLeaderboard, contestStatus, activeTab]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeaderboard(true, activeTab === 'round2' ? 'round2' : 'all');
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const currentLoggedInUser = useMemo(() => {
    return (
      propCurrentUser ||
      users.find(
        (u) =>
          (currentUserId && u.id === currentUserId) ||
          (currentUserToken && u.access_token === currentUserToken)
      )
    );
  }, [propCurrentUser, users, currentUserId, currentUserToken]);

  const currentUserRank = useMemo(() => {
    if (!currentLoggedInUser) return null;
    const index = users.findIndex(
      (u) =>
        u.id === currentLoggedInUser.id ||
        (u.access_token && u.access_token === currentLoggedInUser.access_token)
    );
    return index !== -1 ? index + 1 : null;
  }, [users, currentLoggedInUser]);

  const currentUserStage = currentLoggedInUser?.current_stage || 1;

  // Filter based on active tab and search query
  const filteredUsers = useMemo(() => {
    return users
      .filter((u) => {
        if (activeTab === 'top5') return true;
        if (activeTab === 'round2') return true;
        if (activeTab === 'my-stage') return u.current_stage === currentUserStage;
        return true;
      })
      .filter((u) => {
        if (!search.trim()) return true;
        const q = search.toLowerCase();
        return (
          (u.name || '').toLowerCase().includes(q) ||
          (u.email && u.email.toLowerCase().includes(q)) ||
          (u.team_name && u.team_name.toLowerCase().includes(q))
        );
      })
      .slice(0, activeTab === 'top5' ? 5 : undefined);
  }, [users, activeTab, currentUserStage, search]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xl select-none animate-in fade-in duration-200"
    >
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <aside
          onClick={(e) => e.stopPropagation()}
          className="w-screen max-w-md sm:w-[440px] border-l border-app-border bg-app-surface flex flex-col shadow-2xl select-none h-full"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-app-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-xs">
                  <Trophy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-xs text-app-text tracking-tight flex items-center gap-1.5">
                    {isConcluded ? 'Final Standings' : isFrozen ? 'Leaderboard (Frozen)' : 'Live Leaderboard'}
                    <button
                      onClick={() => setShowRulesInfo(!showRulesInfo)}
                      className="text-app-subtext hover:text-app-accent transition-colors p-0.5"
                      title="Tie-breaking rules"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </h3>
                  <div className="flex items-center gap-1.5 text-[9px] font-mono">
                    {isFrozen ? (
                      <span className="flex items-center gap-1 text-amber-400 font-bold">
                        <Pause className="w-2.5 h-2.5 fill-amber-400" />
                        FROZEN
                      </span>
                    ) : isConcluded ? (
                      <span className="flex items-center gap-1 text-purple-400 font-bold">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        OFFICIAL STANDINGS
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-emerald-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                        LIVE REALTIME TIE-BREAK SYNC
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  onClick={handleManualRefresh}
                  className={`p-1.5 rounded-lg hover:bg-white/5 text-app-subtext hover:text-app-text transition-colors cursor-pointer ${
                    isRefreshing ? 'animate-spin text-app-accent' : ''
                  }`}
                  title="Force refresh"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onClose}
                  className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-lg hover:bg-app-hover border border-app-border transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                  title="Close (Esc)"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Tie-Breaking Rules Information Card */}
            {showRulesInfo && (
              <div className="p-2.5 rounded-xl bg-app-surface-raised border border-app-accent/30 text-app-subtext text-[11px] font-mono space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <div className="font-bold text-app-text flex items-center gap-1 text-[11px]">
                  <Zap className="w-3 h-3 text-amber-400" />
                  Official Tie-Breaking Order:
                </div>
                <div className="text-[10px] space-y-0.5 text-app-subtext/90">
                  <p>1. <span className="text-emerald-400 font-semibold">Total Points</span> (Highest score first)</p>
                  <p>2. <span className="text-cyan-400 font-semibold">Total Completion Time</span> (Lowest time taken to reach stage)</p>
                  <p>3. <span className="text-amber-400 font-semibold">Stage-by-Stage Duration</span> (Faster Stage 1 duration wins; then Stage 2...)</p>
                </div>
              </div>
            )}

            {isFrozen && (
              <div className="p-2 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-[11px] font-mono flex items-center gap-2">
                <Pause className="w-3.5 h-3.5 fill-amber-400 shrink-0" />
                <span>Leaderboard is frozen. Submissions are paused and rankings are locked.</span>
              </div>
            )}

            {isConcluded && (
              <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-[11px] font-mono flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                <span>Tournament concluded. Final official standings are locked in read-only form.</span>
              </div>
            )}
          </div>

          {/* Sticky Personal Standing Banner */}
          {currentLoggedInUser && (
            <div className="p-2.5 bg-app-accent/10 border-b border-app-accent/25 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-app-accent text-app-bg font-black flex items-center justify-center text-xs shadow-xs shrink-0 font-mono">
                  {currentUserRank ? `#${currentUserRank}` : '--'}
                </div>
                <div className="truncate min-w-0">
                  <div className="font-semibold text-app-text truncate flex items-center gap-1.5">
                    <span className="truncate">{currentLoggedInUser.name}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-app-accent text-app-bg font-mono font-bold">
                      YOU
                    </span>
                  </div>
                  <div className="text-[10px] text-app-subtext truncate font-mono flex items-center gap-2">
                    <span>Stage {currentLoggedInUser.current_stage || 1}</span>
                    <span>&bull;</span>
                    <span className="text-cyan-400 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {formatDuration(getUserTotalTime(currentLoggedInUser))}
                    </span>
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="font-bold text-app-text font-mono text-sm text-emerald-400">
                  {currentLoggedInUser.total_score || 0} <span className="text-[10px] text-app-subtext">PTS</span>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Filter Tabs with Animated Layout Pill */}
          <div className="p-2.5 border-b border-app-border">
            <div className="grid grid-cols-4 gap-1 bg-app-bg p-1 rounded-xl border border-app-border shadow-inner text-[11px] relative">
              {[
                { id: 'all' as const, label: 'All Rank' },
                { id: 'round2' as const, label: 'Round 2' },
                { id: 'top5' as const, label: 'Top 5' },
                { id: 'my-stage' as const, label: `Stage ${currentUserStage}` },
              ].map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`relative py-1 rounded-lg text-center font-medium transition-colors cursor-pointer z-10 ${
                      isActive ? 'text-app-text font-semibold' : 'text-app-subtext hover:text-app-text'
                    }`}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="leaderboard-tab-pill"
                        className="absolute inset-0 bg-app-surface border border-app-border rounded-lg shadow-sm"
                        transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                      />
                    )}
                    <span className="relative z-20">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search Box */}
          <div className="p-2.5 border-b border-app-border">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contestant, team, or token..."
                className="w-full px-2.5 py-1.5 pl-8 text-xs text-app-text bg-app-bg border border-app-border rounded-xl shadow-inner focus:outline-none focus:border-app-accent transition-colors placeholder:text-app-subtext/50 font-sans"
              />
              <Search className="w-3.5 h-3.5 text-app-subtext/70 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Animated Reordering Contestant List */}
          <div className="p-2 space-y-1.5 flex-1 overflow-y-auto text-xs">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-app-subtext text-xs space-y-2">
                <Trophy className="w-8 h-8 text-amber-500/30 mx-auto" />
                <p className="font-semibold text-app-text">No contestants ranked yet</p>
                <p className="text-[10px] text-app-subtext/60">
                  All contestants and teams across all access codes will appear here dynamically.
                </p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredUsers.map((user, idx) => {
                  const rank = idx + 1;
                  const globalIndex = users.findIndex(
                    (u) =>
                      (user.id && u.id === user.id) ||
                      (user.access_token && u.access_token === user.access_token)
                  );
                  const globalRank = globalIndex >= 0 ? globalIndex + 1 : rank;
                  const isCurrentUser =
                    (currentUserId && user.id === currentUserId) ||
                    (currentUserToken && user.access_token === currentUserToken);

                  const userTotalTime = getUserTotalTime(user);
                  const isExpanded = expandedUser === (user.id || user.access_token);

                  const higherUser =
                    globalIndex > 0 ? users[globalIndex - 1] : null;
                  const tieReasonWithAbove =
                    higherUser && (higherUser.total_score || 0) === (user.total_score || 0)
                      ? getTieBreakReason(higherUser, user)
                      : null;

                  return (
                    <motion.div
                      key={user.id || user.access_token || idx}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        layout: { type: 'spring', damping: 25, stiffness: 300 },
                        opacity: { duration: 0.2 },
                      }}
                      onClick={() => setExpandedUser(isExpanded ? null : (user.id || user.access_token))}
                      className={`p-2.5 rounded-xl border flex flex-col transition-all cursor-pointer backdrop-blur-sm ${
                        isCurrentUser
                          ? 'border-app-accentBorder/80 bg-app-accentBg/70 shadow-[0_4px_12px_rgba(0,0,0,0.25),_inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-app-accent/40'
                          : globalRank === 1
                          ? 'border-amber-500/30 bg-amber-500/10 shadow-[0_4px_12px_rgba(245,158,11,0.1),_inset_0_1px_0_rgba(255,255,255,0.1)]'
                          : globalRank === 2
                          ? 'border-slate-400/20 bg-slate-400/5 shadow-[0_2px_8px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : globalRank === 3
                          ? 'border-amber-700/20 bg-amber-700/5 shadow-[0_2px_8px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : 'border-white/[0.06] bg-app-bg/50 hover:bg-app-hover/50 shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.04)]'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5 truncate min-w-0">
                          {/* Rank Badge */}
                          <div
                            className={`w-6 h-6 rounded-lg font-bold text-[10px] flex items-center justify-center shrink-0 shadow-xs ${
                              globalRank === 1
                                ? 'bg-amber-400 text-slate-950 font-black shadow-[0_2px_6px_rgba(251,191,36,0.4)]'
                                : globalRank === 2
                                ? 'bg-slate-300 text-slate-950 font-black shadow-[0_2px_6px_rgba(203,213,225,0.3)]'
                                : globalRank === 3
                                ? 'bg-amber-600 text-white font-black shadow-[0_2px_6px_rgba(217,119,6,0.3)]'
                                : isCurrentUser
                                ? 'bg-app-accent text-app-bg font-bold'
                                : 'bg-app-muted text-app-subtext border border-white/10'
                            }`}
                          >
                            {globalRank}
                          </div>

                          {/* Contestant Info */}
                          <div className="truncate min-w-0">
                            <div className="font-semibold text-app-text text-xs truncate flex items-center gap-1.5">
                              <span className="truncate">{user.name}</span>
                              {globalRank === 1 && <Flame className="w-3.5 h-3.5 text-amber-400 shrink-0 inline" />}
                              {isCurrentUser && (
                                <span className="text-[9px] px-1.5 py-0.2 rounded bg-app-accent/20 text-app-accent font-mono font-bold shrink-0">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-app-subtext truncate font-mono flex items-center gap-1.5">
                              <span>Stage {user.current_stage || 1}</span>
                              <span>&bull;</span>
                              <span className="truncate max-w-[140px]">
                                {user.team_name ? `Team: ${user.team_name}` : (user.name || 'Contestant')}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Metrics: Total Score & Total Elapsed Time */}
                        <div className="text-right shrink-0 pl-2">
                          <div className="text-xs font-bold text-app-text font-mono flex items-center justify-end gap-1">
                            <span>{user.total_score || 0}</span>
                            <span className="text-[10px] text-app-subtext">PTS</span>
                          </div>
                          <div className="text-[10px] text-emerald-400 font-mono flex items-center justify-end gap-1 mt-0.5" title="Total time to reach completed stage">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{formatDuration(userTotalTime)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Tie-breaker reason pill if score is tied with contestant above */}
                      {tieReasonWithAbove && (
                        <div className="mt-1.5 pt-1.5 border-t border-white/5 flex items-center gap-1 text-[9px] font-mono text-amber-400/90">
                          <Zap className="w-2.5 h-2.5 shrink-0 text-amber-400" />
                          <span className="truncate">Behind #{globalRank - 1}: {tieReasonWithAbove}</span>
                        </div>
                      )}

                      {/* Stage-wise Breakdown (expandable or default if user has stages) */}
                      {user.stage_durations && Object.keys(user.stage_durations).length > 0 && (
                        <div className="mt-2 pt-1.5 border-t border-white/5 flex flex-wrap items-center gap-1.5">
                          {Object.entries(user.stage_durations)
                            .sort(([a], [b]) => Number(a) - Number(b))
                            .map(([stg, dur]) => (
                              <span
                                key={stg}
                                className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-app-subtext"
                                title={`Stage ${stg} completed in ${formatDuration(dur)}`}
                              >
                                S{stg}: <span className="text-app-text font-semibold">{formatDuration(dur)}</span>
                              </span>
                            ))}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>

          {/* Footer Total */}
          <div className="p-3 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-xs text-app-subtext font-mono">
            <span>TOTAL CONTESTANTS</span>
            <span className="text-app-text font-bold bg-app-surface/90 px-2 py-0.5 rounded-lg border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1),_0_2px_4px_rgba(0,0,0,0.3)]">
              {users.length} registered
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
