'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { User, ContestStatus } from '@/lib/types';
import {
  Trophy,
  X,
  Medal,
  Flame,
  Radio,
  User as UserIcon,
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
      { id: '1', name: 'Maya Lin (MIT Cyber)', email: 'mlin@mit.edu', role: 'participant', access_token: 'AX-9021-3829', total_score: 450, current_stage: 4, is_flagged: false, created_at: '', updated_at: '' },
      { id: '2', name: 'Marcus Vance', email: 'marcus.v@berkeley.edu', role: 'participant', access_token: 'AX-4820-1940', total_score: 350, current_stage: 3, is_flagged: false, created_at: '', updated_at: '' },
      { id: '3', name: 'Elena Rostova', email: 'erostova@stanford.edu', role: 'participant', access_token: 'AX-7104-5821', total_score: 300, current_stage: 3, is_flagged: false, created_at: '', updated_at: '' },
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
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/70 backdrop-blur-sm">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900/95 border-l border-slate-800/80 shadow-2xl flex flex-col">
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

          {/* Search Bar */}
          <div className="p-3 border-b border-slate-800/60 bg-slate-950/50">
            <div className="relative">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search participant..."
                className="w-full px-3 py-1.5 pl-8 text-xs text-white bg-slate-900 border border-slate-700/80 rounded-lg focus:outline-none focus:border-cyan-400 font-mono transition-colors"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Leaderboard List */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 p-2">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No participants found
              </div>
            ) : (
              filteredUsers.map((user, idx) => {
                const rank = idx + 1;
                const isCurrentUser = user.id === currentUserId;

                return (
                  <div
                    key={user.id}
                    className={`flex items-center justify-between p-3 rounded-xl transition-all ${
                      isCurrentUser
                        ? 'bg-cyan-500/15 border border-cyan-500/40 shadow-sm'
                        : 'hover:bg-slate-800/40 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Rank Indicator */}
                      <div className="w-7 flex justify-center items-center">
                        {rank === 1 ? (
                          <div className="p-1 rounded bg-amber-500/20 text-amber-300">
                            <Medal className="w-4 h-4" />
                          </div>
                        ) : rank === 2 ? (
                          <div className="p-1 rounded bg-slate-300/20 text-slate-200">
                            <Medal className="w-4 h-4" />
                          </div>
                        ) : rank === 3 ? (
                          <div className="p-1 rounded bg-amber-700/20 text-amber-500">
                            <Medal className="w-4 h-4" />
                          </div>
                        ) : (
                          <span className="text-xs font-mono font-bold text-slate-500">
                            #{rank}
                          </span>
                        )}
                      </div>

                      {/* Participant Details */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-slate-200 truncate">
                            {user.name}
                          </p>
                          {isCurrentUser && (
                            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-cyan-400 text-slate-950 font-bold rounded">
                              YOU
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
                          <span>Stage {user.current_stage}</span>
                          {user.current_stage > 2 && (
                            <span className="flex items-center text-amber-400">
                              <Flame className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Points */}
                    <div className="text-right shrink-0">
                      <div className="text-xs font-extrabold font-mono text-cyan-400">
                        {user.total_score} <span className="text-[10px] text-slate-500">PTS</span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer Stats */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400 font-mono">
            <span>Total Participants</span>
            <span className="text-white font-bold">{users.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
