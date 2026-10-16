'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { supabase } from '@/lib/supabase';
import { User } from '@/lib/types';
import {
  Trophy,
  X,
  Radio,
  Search,
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
  const [isPending, startTransition] = useTransition();

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
          startTransition(() => {
            fetchLeaderboard();
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
      <div className="absolute inset-y-0 right-0 max-w-full flex pl-4 sm:pl-10">
        <aside className="w-screen max-w-xs sm:w-80 border-l border-app-border bg-app-surface flex flex-col shadow-2xl select-none">
          {/* Header */}
          <div className="p-3 border-b border-app-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-xs text-app-text">Stage Leaderboard</h3>
              <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium">
                <Radio className="w-2 h-2 animate-pulse" /> LIVE
              </span>
            </div>
            <button
              onClick={onClose}
              className="text-app-subtext hover:text-app-text cursor-pointer p-1 rounded hover:bg-app-hover transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
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
