'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { User } from '@/lib/types';
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Crown,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  Trophy,
  Users,
  Zap,
} from 'lucide-react';

type MemberRow = {
  user_id: string;
  name: string;
  email: string;
  current_stage: number;
  total_score: number;
  suspicious: boolean;
  suspicious_reasons: string[];
  bypassed_stages: number[];
  tab_switches: number;
  password_failures: number;
  last_active: string | null;
};

type TeamRow = {
  team_key: string;
  team_name: string;
  case_study_pool: string | null;
  max_stage_reached: number;
  avg_score: number;
  suspicious_count: number;
  issues: string[];
  bypass_events: { user_id: string; name: string; stage_number: number; at: string }[];
  members: MemberRow[];
};

type TopTeam = {
  rank: number;
  team_name: string;
  composite_score: number;
  stages_unlocked: number;
  total_score: number;
  summary: string;
};

interface Round2LiveTabProps {
  adminSecret: string;
}

export function Round2LiveTab({ adminSecret }: Round2LiveTabProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [teamRows, setTeamRows] = useState<TeamRow[]>([]);
  const [top5, setTop5] = useState<TopTeam[]>([]);
  const [leaderboard, setLeaderboard] = useState<User[]>([]);
  const [generatedAt, setGeneratedAt] = useState('');
  const [selectedCount, setSelectedCount] = useState(0);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTopOnly, setShowTopOnly] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (silent = false) => {
      if (!adminSecret) return;
      if (!silent) setLoading(true);
      else setRefreshing(true);
      setError(null);
      try {
        const res = await fetch('/api/admin/round2/live', {
          headers: { 'x-admin-secret': adminSecret },
          cache: 'no-store',
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Live feed failed');
        setTeamRows(Array.isArray(data.teamRows) ? data.teamRows : []);
        setTop5(Array.isArray(data.top5) ? data.top5 : []);
        setLeaderboard(Array.isArray(data.leaderboard) ? data.leaderboard : []);
        setGeneratedAt(data.generatedAt || '');
        setSelectedCount(Number(data.selectedCount) || 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Load failed');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminSecret]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 5000);
    return () => clearInterval(t);
  }, [load]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teamRows;
    return teamRows.filter(
      (t) =>
        t.team_name.toLowerCase().includes(q) ||
        (t.case_study_pool || '').toLowerCase().includes(q) ||
        t.members.some(
          (m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
        )
    );
  }, [teamRows, search]);

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const analyzeTop5 = () => {
    setShowTopOnly(true);
    setExpanded(new Set(top5.map((t) => teamRows.find((r) => r.team_name === t.team_name)?.team_key).filter(Boolean) as string[]));
  };

  if (loading && !teamRows.length) {
    return (
      <div className="flex items-center justify-center py-20 text-app-subtext">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading Round 2 live watcher…
      </div>
    );
  }

  const displayTeams = showTopOnly
    ? filteredTeams.filter((t) => top5.some((x) => x.team_name === t.team_name))
    : filteredTeams;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-app-text flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-400" />
            Round 2 Live Watcher
          </h2>
          <p className="text-sm text-app-subtext mt-1">
            {selectedCount} teams in Round 2 · pool assignment · zip depth · suspicious signals · bypasses
          </p>
          {generatedAt && (
            <p className="text-[11px] text-app-subtext font-mono mt-0.5">
              Updated {new Date(generatedAt).toLocaleTimeString()} · auto-refresh 5s
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => load(true)}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-app-border bg-app-surface text-xs font-medium hover:bg-app-hover"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={analyzeTop5}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-zinc-950 text-xs font-bold"
          >
            <Crown className="w-3.5 h-3.5" />
            Select Top 5
          </button>
          {showTopOnly && (
            <button
              type="button"
              onClick={() => setShowTopOnly(false)}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-app-border text-xs"
            >
              Show all teams
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-sm text-rose-400 border border-rose-500/30 rounded-xl px-4 py-3">{error}</div>
      )}

      {top5.length > 0 && (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-4">
          <h3 className="text-sm font-bold text-amber-200 flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4" />
            Top 5 (composite: stages × 120 + avg score − penalties)
          </h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {top5.map((t) => (
              <div
                key={t.team_name}
                className="rounded-xl border border-amber-500/20 bg-zinc-950/60 p-3 text-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-app-text">
                    #{t.rank} {t.team_name}
                  </span>
                  <span className="text-xs font-mono text-amber-300">{t.composite_score}</span>
                </div>
                <p className="text-xs text-app-subtext mt-1">{t.summary}</p>
                <p className="text-[11px] text-cyan-300/80 mt-1">
                  Stages unlocked: {t.stages_unlocked}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-subtext" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team, pool, member…"
          className="w-full pl-9 pr-3 py-2 rounded-xl border border-app-border bg-app-surface text-sm"
        />
      </div>

      <div className="space-y-2">
        {displayTeams.map((team) => {
          const isOpen = expanded.has(team.team_key);
          return (
            <div
              key={team.team_key}
              className="rounded-2xl border border-app-border bg-app-surface overflow-hidden"
            >
              <button
                type="button"
                onClick={() => toggleExpand(team.team_key)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-app-hover/50"
              >
                {isOpen ? (
                  <ChevronDown className="w-4 h-4 shrink-0 text-app-subtext" />
                ) : (
                  <ChevronRight className="w-4 h-4 shrink-0 text-app-subtext" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-app-text truncate">{team.team_name}</span>
                    {team.suspicious_count > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 flex items-center gap-0.5">
                        <ShieldAlert className="w-3 h-3" />
                        {team.suspicious_count} flag
                      </span>
                    )}
                    {team.bypass_events.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200">
                        {team.bypass_events.length} bypass
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-app-subtext truncate">
                    Pool: {team.case_study_pool || '—'} · Max stage {team.max_stage_reached} · Avg{' '}
                    {team.avg_score} pts · {team.members.length} member(s)
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-xs font-mono text-cyan-400 flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    S{team.max_stage_reached}
                  </span>
                </div>
              </button>

              {isOpen && (
                <div className="px-4 pb-4 border-t border-app-border space-y-3">
                  {team.issues.length > 0 && (
                    <ul className="text-xs text-amber-200/90 list-disc pl-4 pt-2">
                      {team.issues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  )}

                  {team.bypass_events.length > 0 && (
                    <div className="rounded-xl bg-amber-950/30 border border-amber-500/20 p-3 text-xs">
                      <p className="font-semibold text-amber-200 mb-1">Bypassed stages</p>
                      {team.bypass_events.map((b) => (
                        <p key={`${b.user_id}-${b.stage_number}`} className="text-app-subtext">
                          {b.name} — stage {b.stage_number}
                          {b.at ? ` @ ${new Date(b.at).toLocaleString()}` : ''}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-app-subtext border-b border-app-border">
                          <th className="text-left py-2 pr-2">Member</th>
                          <th className="text-left py-2">Stage</th>
                          <th className="text-left py-2">Score</th>
                          <th className="text-left py-2">Telemetry</th>
                          <th className="text-left py-2">Bypass</th>
                        </tr>
                      </thead>
                      <tbody>
                        {team.members.map((m) => (
                          <tr key={m.user_id} className="border-b border-app-border/50">
                            <td className="py-2 pr-2">
                              <div className="font-medium text-app-text">{m.name}</div>
                              <div className="text-[10px] text-app-subtext truncate max-w-[180px]">
                                {m.email}
                              </div>
                            </td>
                            <td className="py-2 font-mono">{m.current_stage}</td>
                            <td className="py-2 font-mono">{m.total_score}</td>
                            <td className="py-2">
                              {m.suspicious ? (
                                <span className="text-rose-300 flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" />
                                  tabs {m.tab_switches} · pwd fail {m.password_failures}
                                </span>
                              ) : (
                                <span className="text-emerald-400/80">OK</span>
                              )}
                              {m.suspicious_reasons.length > 0 && (
                                <ul className="text-[10px] text-rose-200/70 mt-0.5">
                                  {m.suspicious_reasons.slice(0, 3).map((r) => (
                                    <li key={r}>{r}</li>
                                  ))}
                                </ul>
                              )}
                            </td>
                            <td className="py-2">
                              {m.bypassed_stages.length
                                ? m.bypassed_stages.join(', ')
                                : '—'}
                            </td>
                          </tr>
                        ))}
                        {team.members.length === 0 && (
                          <tr>
                            <td colSpan={5} className="py-4 text-center text-app-subtext">
                              <Users className="w-4 h-4 inline mr-1" />
                              No logins yet
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="rounded-2xl border border-app-border p-4">
        <h3 className="text-sm font-bold text-app-text mb-3 flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          Round 2 leaderboard (live)
        </h3>
        <div className="overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-app-surface">
              <tr className="text-app-subtext border-b border-app-border">
                <th className="text-left py-2">#</th>
                <th className="text-left py-2">Team</th>
                <th className="text-left py-2">Member</th>
                <th className="text-left py-2">Stage</th>
                <th className="text-left py-2">Score</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.slice(0, 50).map((u, idx) => (
                <tr key={u.id} className="border-b border-app-border/40">
                  <td className="py-1.5 font-mono text-app-subtext">{idx + 1}</td>
                  <td className="py-1.5">{u.team_name}</td>
                  <td className="py-1.5">{u.name}</td>
                  <td className="py-1.5 font-mono">{u.current_stage}</td>
                  <td className="py-1.5 font-mono">{u.total_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
