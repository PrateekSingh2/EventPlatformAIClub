'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { User, ContestStatus } from '@/lib/types';
import {
  Trophy,
  X,
  Radio,
  Search,
  Pause,
  CheckCircle2,
} from 'lucide-react';

interface LiveLeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
  currentUserId?: string;
  contestStatus?: ContestStatus;
}

export function LiveLeaderboard({
  isOpen,
  onClose,
  currentUserId,
  contestStatus = 'LIVE',
}: LiveLeaderboardProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const isFrozen = contestStatus === 'FROZEN';
  const isConcluded = contestStatus === 'CONCLUDED';

  // Initial fetch of leaderboard
  const fetchLeaderboard = async () => {
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
  };

  useEffect(() => {
    if (!isOpen) return;

    fetchLeaderboard();

    // Subscribe to real-time updates on users table
    const channel = supabase
      .channel('leaderboard-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'users' },
        () => {
          // If frozen or concluded, do not update rankings from real-time events
          if (contestStatus === 'FROZEN' || contestStatus === 'CONCLUDED') {
            return;
          }
          startTransition(() => {
            fetchLeaderboard();
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen, contestStatus]);

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <aside className="w-screen max-w-xs sm:w-80 border-l border-app-border bg-app-surface flex flex-col shadow-2xl select-none">
          {/* Header */}
          <div className="p-5 border-b border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-white tracking-tight">
                      {isConcluded ? 'Final Standings' : isFrozen ? 'Leaderboard (Frozen)' : 'Live Leaderboard'}
                    </h2>
                    {isFrozen ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
                        <Pause className="w-2.5 h-2.5 fill-amber-400" />
                        FROZEN
                      </span>
                    ) : isConcluded ? (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold">
                        <CheckCircle2 className="w-2.5 h-2.5" />
                        OFFICIAL
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        <Radio className="w-2.5 h-2.5 animate-pulse" />
                        LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    {isConcluded
                      ? 'Final tournament results published'
                      : isFrozen
                      ? 'Score updates paused during official freeze period'
                      : 'Supabase Realtime Broadcast • 150-200 Participants'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isFrozen && (
              <div className="p-2.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-200 text-xs font-mono flex items-center gap-2">
                <Pause className="w-4 h-4 fill-amber-400 flex-shrink-0" />
                <span>Leaderboard is frozen. Submissions are paused and rankings are locked until conclusion.</span>
              </div>
            )}

            {isConcluded && (
              <div className="p-2.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-200 text-xs font-mono flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-purple-400 flex-shrink-0" />
                <span>Tournament concluded. Final official standings are locked in read-only form.</span>
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="p-2 border-b border-app-border bg-app-bg">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search contestant..."
                className="w-full px-2.5 py-1 pl-7 text-xs text-app-text bg-app-surface border border-app-border rounded focus:outline-none focus:border-app-accent transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-app-subtext absolute left-2 top-2" />
            </div>
          </div>

          {/* Leaderboard List */}
          <div className="p-2 space-y-1.5 flex-1 overflow-y-auto text-xs">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-app-subtext text-xs">
                No contestants found
              </div>
            ) : (
              filteredUsers.map((user, idx) => {
                const rank = idx + 1;
                const isCurrentUser = user.id === currentUserId;

                return (
                  <div
                    key={user.id}
                    className={`p-2 rounded border flex items-center justify-between transition-colors ${
                      isCurrentUser
                        ? 'border-app-accentBorder bg-app-accentBg'
                        : rank === 1
                        ? 'border-amber-500/30 bg-amber-500/5'
                        : 'border-app-border bg-app-bg'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate min-w-0">
                      <span
                        className={`w-5 h-5 rounded font-bold text-[10px] flex items-center justify-center shrink-0 ${
                          rank === 1
                            ? 'bg-amber-500 text-black'
                            : isCurrentUser
                            ? 'bg-app-accent text-app-bg'
                            : 'bg-app-muted text-app-text'
                        }`}
                      >
                        {rank}
                      </span>
                      <div className="truncate min-w-0">
                        <div className="font-medium text-app-text text-[11px] truncate">
                          {user.name}
                        </div>
                        <div className="text-[10px] text-app-subtext truncate font-medium">
                          Stage {user.current_stage}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-semibold text-app-text shrink-0 pl-2">
                      {user.total_score} PTS
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Total */}
          <div className="p-3 border-t border-app-border bg-app-bg flex items-center justify-between text-xs text-app-subtext">
            <span>Total Contestants</span>
            <span className="text-app-text font-bold">{users.length}</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
