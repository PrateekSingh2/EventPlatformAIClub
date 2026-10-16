'use client';

import React, { useEffect, useState, useTransition, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import {
  Trophy,
  X,
  Radio,
  Search,
  Sparkles,
  Flame,
  RotateCw,
} from 'lucide-react';

interface LiveLeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
}

export function LiveLeaderboard({
  isOpen,
  onClose,
  currentUserId,
}: LiveLeaderboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'top5' | 'my-stage'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [, startTransition] = useTransition();

  // Initial fetch of leaderboard
  const fetchLeaderboard = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('users')
        .select('id, name, email, role, access_token, total_score, current_stage, is_flagged, created_at, updated_at')
        .eq('role', 'participant')
        .order('total_score', { ascending: false })
        .order('updated_at', { ascending: true })
        .limit(200);

      if (data && data.length > 0) {
        setUsers(data as User[]);
        return;
      }
    } catch {
      // Fallback to sample contestants for local demo
    }

    // Default sample contestants for local testing
    setUsers([
      { id: '1', name: 'CyberKnight_99', email: 'mlin@mit.edu', role: 'participant', access_token: 'AX-9021-3829', total_score: 300, current_stage: 2, is_flagged: false, created_at: '', updated_at: '' },
      { id: '2', name: 'NullPointerEx', email: 'marcus.v@berkeley.edu', role: 'participant', access_token: 'AX-4820-1940', total_score: 250, current_stage: 2, is_flagged: false, created_at: '', updated_at: '' },
      { id: '3', name: 'Elena Rostova', email: 'erostova@stanford.edu', role: 'participant', access_token: 'AX-7104-5821', total_score: 200, current_stage: 1, is_flagged: false, created_at: '', updated_at: '' },
      { id: '00000000-0000-0000-0000-000000000001', name: 'Alex Mercer (You)', email: 'alex.mercer@aiclub.org', role: 'participant', access_token: 'AX-DEMO-2026', total_score: 150, current_stage: 1, is_flagged: false, created_at: '', updated_at: '' },
      { id: '4', name: 'Devin Thorne', email: 'devin@ai-labs.org', role: 'participant', access_token: 'AX-3819-2049', total_score: 100, current_stage: 1, is_flagged: false, created_at: '', updated_at: '' },
      { id: '5', name: 'Kavita Rao', email: 'krao@iitb.ac.in', role: 'participant', access_token: 'AX-9481-6721', total_score: 100, current_stage: 1, is_flagged: false, created_at: '', updated_at: '' },
    ]);
  }, []);

  // Hot-reload: Auto-poll every 2.5 seconds + Supabase Realtime channel
  useEffect(() => {
    if (!isOpen) return;

    fetchLeaderboard();

    // Hot-reload Poller
    const interval = setInterval(() => {
      fetchLeaderboard();
    }, 2500);

    // Subscribe to real-time postgres updates on users table
    const channel = supabase
      .channel('leaderboard-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          startTransition(() => {
            fetchLeaderboard();
          });
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [isOpen, fetchLeaderboard]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await fetchLeaderboard();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (!isOpen) return null;

  const currentUser = users.find((u) => u.id === currentUserId);
  const currentUserStage = currentUser?.current_stage || 1;

  // Filter based on active tab and search
  const filteredUsers = users
    .filter((u) => {
      if (activeTab === 'top5') return true;
      if (activeTab === 'my-stage') return u.current_stage === currentUserStage;
      return true;
    })
    .filter((u) => u.name.toLowerCase().includes(search.toLowerCase()))
    .slice(0, activeTab === 'top5' ? 5 : undefined);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xl select-none animate-in fade-in duration-200"
    >
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <aside
          onClick={(e) => e.stopPropagation()}
          className="w-screen max-w-xs sm:w-88 border-l border-app-border bg-app-surface flex flex-col shadow-[-16px_0_40px_rgba(0,0,0,0.5)] select-none h-full"
        >
          {/* Header */}
          <div className="p-3.5 border-b border-app-border flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 dark:text-amber-400 shadow-xs">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-semibold text-xs text-app-text tracking-tight">Live Leaderboard</h3>
                <div className="flex items-center gap-1.5 text-[9px] text-emerald-400 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
                  <span>HOT-SYNC ACTIVE</span>
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
                className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Filter Tabs with Animated Layout Pill */}
          <div className="p-2.5 border-b border-app-border">
            <div className="grid grid-cols-3 gap-1 bg-app-bg p-1 rounded-xl border border-app-border shadow-inner text-[11px] relative">
              {[
                { id: 'all' as const, label: 'All Rank' },
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
                placeholder="Search contestant..."
                className="w-full px-2.5 py-1.5 pl-8 text-xs text-app-text bg-app-bg border border-app-border rounded-xl shadow-inner focus:outline-none focus:border-app-accent transition-colors placeholder:text-app-subtext/50 font-sans"
              />
              <Search className="w-3.5 h-3.5 text-app-subtext/70 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Animated Reordering Contestant List */}
          <div className="p-2 space-y-1.5 flex-1 overflow-y-auto text-xs">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-app-subtext text-xs space-y-1">
                <p>No contestants found</p>
                <p className="text-[10px] text-app-subtext/60">Try adjusting your search query</p>
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredUsers.map((user, idx) => {
                  const rank = idx + 1;
                  const isCurrentUser = user.id === currentUserId;

                  return (
                    <motion.div
                      key={user.id}
                      layout
                      initial={{ opacity: 0, y: 8, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{
                        layout: { type: 'spring', damping: 25, stiffness: 300 },
                        opacity: { duration: 0.2 },
                      }}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all backdrop-blur-sm ${
                        isCurrentUser
                          ? 'border-app-accentBorder/80 bg-app-accentBg/70 shadow-[0_4px_12px_rgba(0,0,0,0.25),_inset_0_1px_0_rgba(255,255,255,0.12)]'
                          : rank === 1
                          ? 'border-amber-500/30 bg-amber-500/10 shadow-[0_4px_12px_rgba(245,158,11,0.1),_inset_0_1px_0_rgba(255,255,255,0.1)]'
                          : rank === 2
                          ? 'border-slate-400/20 bg-slate-400/5 shadow-[0_2px_8px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : rank === 3
                          ? 'border-amber-700/20 bg-amber-700/5 shadow-[0_2px_8px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.06)]'
                          : 'border-white/[0.06] bg-app-bg/50 hover:bg-app-hover/50 shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.04)]'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 truncate min-w-0">
                        {/* Rank Badge */}
                        <div
                          className={`w-5 h-5 rounded-md font-bold text-[10px] flex items-center justify-center shrink-0 shadow-xs ${
                            rank === 1
                              ? 'bg-amber-400 text-slate-950 font-black shadow-[0_2px_6px_rgba(251,191,36,0.4)]'
                              : rank === 2
                              ? 'bg-slate-300 text-slate-950 font-black shadow-[0_2px_6px_rgba(203,213,225,0.3)]'
                              : rank === 3
                              ? 'bg-amber-600 text-white font-black shadow-[0_2px_6px_rgba(217,119,6,0.3)]'
                              : isCurrentUser
                              ? 'bg-app-accent text-app-bg font-bold'
                              : 'bg-app-muted text-app-subtext border border-white/10'
                          }`}
                        >
                          {rank}
                        </div>

                        {/* Contestant Info */}
                        <div className="truncate min-w-0">
                          <div className="font-semibold text-app-text text-xs truncate flex items-center gap-1.5">
                            <span className="truncate">{user.name}</span>
                            {rank === 1 && <Flame className="w-3 h-3 text-amber-400 shrink-0 inline" />}
                            {isCurrentUser && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-app-accent/20 text-app-accent font-mono font-bold shrink-0">
                                YOU
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-app-subtext truncate font-mono">
                            Stage {user.current_stage} • {user.email?.split('@')[0] || 'anonymous'}
                          </div>
                        </div>
                      </div>

                      {/* Points Display */}
                      <div className="text-right shrink-0 pl-2">
                        <span className="text-xs font-bold text-app-text font-mono">
                          {user.total_score}
                        </span>
                        <span className="text-[10px] text-app-subtext ml-0.5">PTS</span>
                      </div>
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
              {users.length} active
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
