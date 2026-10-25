'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { FinalTeamRecord } from '@/lib/final-teams';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  RefreshCw,
  Save,
  Shuffle,
  Upload,
  Users,
  Wand2,
} from 'lucide-react';

interface Round2SelectionTabProps {
  adminSecret: string;
}

type PoolItem = { poolKey: string; storagePath: string; displayName: string; uploadedAt?: string };

export function Round2SelectionTab({ adminSecret }: Round2SelectionTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [teams, setTeams] = useState<FinalTeamRecord[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [poolAssignments, setPoolAssignments] = useState<Record<string, string>>({});
  const [poolItems, setPoolItems] = useState<PoolItem[]>([]);
  const [stageCount, setStageCount] = useState(12);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [round2TableReady, setRound2TableReady] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);
      const res = await fetch('/api/admin/round2', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Round 2');
      setLocked(Boolean(data.locked));
      setTeams(Array.isArray(data.teams) ? data.teams : []);
      setPoolItems(Array.isArray(data.poolItems) ? data.poolItems : []);
      setRound2TableReady(data.round2TableReady !== false);
      const keys = data.selection?.selected_team_keys;
      setSelectedKeys(new Set(Array.isArray(keys) ? keys : []));
      setPoolAssignments(
        data.selection?.pool_assignments && typeof data.selection.pool_assignments === 'object'
          ? data.selection.pool_assignments
          : {}
      );
      setDirty(false);
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Load failed' });
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    if (adminSecret) load();
  }, [adminSecret, load]);

  const filteredTeams = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return teams;
    return teams.filter(
      (t) =>
        t.team_name.toLowerCase().includes(q) ||
        t.members.some(
          (m) =>
            (m.email || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q)
        )
    );
  }, [teams, search]);

  const selectedTeams = useMemo(
    () => teams.filter((t) => selectedKeys.has(t.team_key)),
    [teams, selectedKeys]
  );

  const memberEmailCount = useMemo(
    () =>
      selectedTeams.reduce(
        (n, t) => n + t.members.filter((m) => (m.email || '').includes('@')).length,
        0
      ),
    [selectedTeams]
  );

  const toggleTeam = (teamKey: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(teamKey)) next.delete(teamKey);
      else next.add(teamKey);
      return next;
    });
    setDirty(true);
  };

  const selectAllVisible = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const t of filteredTeams) next.add(t.team_key);
      return next;
    });
    setDirty(true);
  };

  const clearSelection = () => {
    setSelectedKeys(new Set());
    setDirty(true);
  };

  const saveSelection = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/round2', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({
          selected_team_keys: [...selectedKeys],
          pool_assignments: poolAssignments,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setDirty(false);
      setMessage({ type: 'ok', text: `Saved ${data.selectedCount ?? selectedKeys.size} Round 2 team(s).` });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const exportEmails = async () => {
    if (dirty) {
      await saveSelection();
    }
    window.open(
      `/api/admin/round2?export=email-csv&adminSecret=${encodeURIComponent(adminSecret)}`,
      '_blank'
    );
  };

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    setMessage(null);
    try {
      if (dirty) {
        await saveSelection();
      }
      const res = await fetch('/api/admin/round2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminSecret, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);
      if (action === 'random-pool' && data.pool_assignments) {
        setPoolAssignments(data.pool_assignments);
      }
      if (action === 'ingest-contest') {
        setMessage({
          type: 'ok',
          text: `Ingested ${data.count} participant row(s) from ${data.teamCount} team(s).`,
        });
      } else if (action === 'assign-pool') {
        setMessage({
          type: 'ok',
          text: `Pool archives linked for ${data.teamCount} team(s). Arena download ready.`,
        });
      } else if (action === 'random-pool') {
        setMessage({
          type: 'ok',
          text: `Random pool mapping for ${data.mappedTeams} team(s) (${data.poolCount} ZIP(s) in pool). Save or assign when ready.`,
        });
        setDirty(true);
      }
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Action failed' });
    } finally {
      setBusy(null);
    }
  };

  const setPoolForTeam = (teamKey: string, poolKey: string) => {
    setPoolAssignments((prev) => ({ ...prev, [teamKey]: poolKey }));
    setDirty(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-app-subtext">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading Round 2 roster…
      </div>
    );
  }

  if (!locked) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-6 flex gap-3">
        <Lock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <h2 className="font-semibold text-app-text">Final roster not locked</h2>
          <p className="text-sm text-app-subtext mt-1">
            Open <strong>Final Teams</strong>, confirm the roster, and lock it. Round 2 selection uses that
            locked list only.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-app-text">Round 2 selection</h1>
          <p className="text-sm text-app-subtext mt-1 max-w-2xl">
            Choose which locked final teams advance to Round 2. Export emails, ingest into the contest
            roster, and randomly assign case-study pool ZIPs — same flow as Stages bulk pool mode.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </header>

      {!round2TableReady && (
        <div className="flex gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Migration <code className="text-xs">013_round2_selection.sql</code> not applied — selection
            is stored locally on this server until you run it in Supabase.
          </span>
        </div>
      )}

      {message && (
        <div
          className={`flex gap-2 text-sm rounded-xl p-3 border ${
            message.type === 'ok'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800'
              : 'border-red-500/30 bg-red-500/10 text-red-800'
          }`}
        >
          {message.type === 'ok' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          {message.text}
        </div>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-sm text-app-subtext">
          <Users className="w-4 h-4 inline mr-1" />
          {teams.length} locked teams · {selectedKeys.size} selected · {memberEmailCount} member emails
        </span>
        <div className="flex-1 min-w-[140px]" />
        <button
          type="button"
          onClick={selectAllVisible}
          className="text-xs px-3 py-1.5 rounded-lg border border-app-border"
        >
          Select visible
        </button>
        <button
          type="button"
          onClick={clearSelection}
          className="text-xs px-3 py-1.5 rounded-lg border border-app-border"
        >
          Clear
        </button>
        <button
          type="button"
          disabled={saving || selectedKeys.size === 0}
          onClick={saveSelection}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-text text-app-bg text-sm font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save selection
        </button>
        {dirty && <span className="text-xs text-amber-600">Unsaved changes</span>}
      </div>

      <input
        type="search"
        placeholder="Search team or email…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full max-w-md px-3 py-2 rounded-xl border border-app-border bg-app-surface text-sm"
      />

      <div className="rounded-2xl border border-app-border overflow-hidden">
        <div className="overflow-x-auto max-h-[min(520px,60vh)] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-app-surface border-b border-app-border">
              <tr className="text-left text-app-subtext">
                <th className="p-3 w-10">Pick</th>
                <th className="p-3">Team</th>
                <th className="p-3">Size</th>
                <th className="p-3">Token</th>
                <th className="p-3 min-w-[180px]">Pool ZIP</th>
                <th className="p-3">Members</th>
              </tr>
            </thead>
            <tbody>
              {filteredTeams.map((team) => {
                const picked = selectedKeys.has(team.team_key);
                const emails = team.members
                  .filter((m) => m.email?.trim())
                  .map((m) => m.email.trim())
                  .join(', ');
                return (
                  <tr
                    key={team.team_key}
                    className={`border-b border-app-border/60 ${picked ? 'bg-emerald-500/5' : ''}`}
                  >
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => toggleTeam(team.team_key)}
                        aria-label={`Select ${team.team_name}`}
                      />
                    </td>
                    <td className="p-3 font-medium">{team.team_name}</td>
                    <td className="p-3 text-app-subtext">{team.team_size}</td>
                    <td className="p-3 font-mono text-xs">{team.access_token}</td>
                    <td className="p-3">
                      {picked && poolItems.length > 0 ? (
                        <select
                          value={poolAssignments[team.team_key] || ''}
                          onChange={(e) => setPoolForTeam(team.team_key, e.target.value)}
                          className="w-full max-w-[200px] text-xs rounded-lg border border-app-border px-2 py-1 bg-app-surface"
                        >
                          <option value="">— unassigned —</option>
                          {poolItems.map((p) => (
                            <option key={p.poolKey} value={p.poolKey}>
                              {p.displayName}
                            </option>
                          ))}
                        </select>
                      ) : picked ? (
                        <span className="text-xs text-app-subtext">No pool ZIPs</span>
                      ) : (
                        <span className="text-xs text-app-subtext">—</span>
                      )}
                    </td>
                    <td className="p-3 text-xs text-app-subtext max-w-[240px] truncate" title={emails}>
                      {emails || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <section className="rounded-2xl border border-app-border p-4 space-y-4">
        <h2 className="font-medium text-app-text">Actions (selected teams only)</h2>
        <p className="text-xs text-app-subtext">
          Pool: {poolItems.length} ZIP(s) in storage. Stage count for archive metadata:{' '}
          <input
            type="number"
            min={1}
            max={99}
            value={stageCount}
            onChange={(e) => setStageCount(Number(e.target.value) || 12)}
            className="w-14 mx-1 px-1 py-0.5 rounded border border-app-border text-center"
          />
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!!busy || selectedKeys.size === 0}
            onClick={exportEmails}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
          >
            <Download className="w-4 h-4" />
            Export email CSV
          </button>
          <button
            type="button"
            disabled={!!busy || selectedKeys.size === 0}
            onClick={() => runAction('ingest-contest')}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
          >
            {busy === 'ingest-contest' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Upload className="w-4 h-4" />
            )}
            Ingest into contest
          </button>
          <button
            type="button"
            disabled={!!busy || selectedKeys.size === 0 || poolItems.length === 0}
            onClick={() => runAction('random-pool', { preserveManual: true })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
          >
            {busy === 'random-pool' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Shuffle className="w-4 h-4" />
            )}
            Random pool assign
          </button>
          <button
            type="button"
            disabled={!!busy || selectedKeys.size === 0 || poolItems.length === 0}
            onClick={() => runAction('assign-pool', { stageCount, pool_assignments: poolAssignments })}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-violet-600 text-white text-sm font-medium disabled:opacity-50"
          >
            {busy === 'assign-pool' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            Commit pool to arena
          </button>
        </div>
      </section>
    </div>
  );
}
