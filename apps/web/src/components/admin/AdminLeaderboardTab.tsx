'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { User } from '@/lib/types';
import {
  formatDuration,
  getUserTotalTime,
  sortLeaderboardUsers,
} from '@/lib/leaderboard-sort';
import { readClientCache, writeClientCache } from '@/lib/client-cache';
import { Loader2, RefreshCw, Search, Trophy } from 'lucide-react';

const CACHE_KEY = 'admin_leaderboard';
const CACHE_TTL_MS = 20_000;

interface AdminLeaderboardTabProps {
  adminSecret: string;
}

export function AdminLeaderboardTab({ adminSecret }: AdminLeaderboardTabProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const fetchBoard = useCallback(
    async (force = false) => {
      if (!force) {
        const cached = readClientCache<{ users: User[] }>(CACHE_KEY, CACHE_TTL_MS);
        if (cached?.users?.length) {
          setUsers(sortLeaderboardUsers(cached.users));
          setLoading(false);
        }
      }

      try {
        const res = await fetch('/api/leaderboard', { cache: 'no-store' });
        const data = await res.json();
        if (data.success && Array.isArray(data.users)) {
          const sorted = sortLeaderboardUsers(data.users as User[]);
          setUsers(sorted);
          writeClientCache(CACHE_KEY, { users: sorted });
          setLastUpdated(new Date().toLocaleTimeString());
        }
      } catch {
        /* keep cached */
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    []
  );

  useEffect(() => {
    fetchBoard();
    const interval = setInterval(() => fetchBoard(), 20_000);
    return () => clearInterval(interval);
  }, [fetchBoard]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.team_name?.toLowerCase().includes(q) ||
        u.access_token?.toLowerCase().includes(q)
    );
  }, [users, search]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-app-text flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Live Leaderboard
          </h2>
          <p className="text-xs text-app-subtext mt-1">
            Same rankings as the arena · auto-refresh every 20s
            {lastUpdated ? ` · updated ${lastUpdated}` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={refreshing}
          onClick={() => {
            setRefreshing(true);
            fetchBoard(true);
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team, name, email, token…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-app-border bg-app-surface text-sm"
        />
      </div>

      {loading && users.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-app-subtext py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading leaderboard…
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-app-border">
          <table className="w-full text-xs">
            <thead className="bg-app-surface text-app-subtext uppercase tracking-wide">
              <tr>
                <th className="text-left py-2.5 px-3">#</th>
                <th className="text-left py-2.5 px-3">Team</th>
                <th className="text-left py-2.5 px-3">Participant</th>
                <th className="text-right py-2.5 px-3">Score</th>
                <th className="text-right py-2.5 px-3">Stage</th>
                <th className="text-right py-2.5 px-3">Time</th>
                <th className="text-left py-2.5 px-3">Token</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border/60">
              {filtered.map((u, idx) => (
                <tr key={u.id} className="hover:bg-app-hover/30">
                  <td className="py-2 px-3 font-mono text-app-subtext">{idx + 1}</td>
                  <td className="py-2 px-3 font-medium">{u.team_name || '—'}</td>
                  <td className="py-2 px-3">
                    <div>{u.name}</div>
                    <div className="text-[10px] text-app-subtext truncate max-w-[180px]">{u.email}</div>
                  </td>
                  <td className="py-2 px-3 text-right font-semibold text-emerald-400">{u.total_score ?? 0}</td>
                  <td className="py-2 px-3 text-right">{u.current_stage ?? 1}</td>
                  <td className="py-2 px-3 text-right font-mono">{formatDuration(getUserTotalTime(u))}</td>
                  <td className="py-2 px-3 font-mono text-[10px]">{u.access_token}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <p className="text-center text-sm text-app-subtext py-8">No matching participants.</p>
          )}
        </div>
      )}
    </div>
  );
}
