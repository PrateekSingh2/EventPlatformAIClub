'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FinalTeamRecord } from '@/lib/final-teams';
import type { Round2DraftRoster, RosterPickRow, Round2WorkflowPhase } from '@/lib/round2-draft';
import { Round2DraftRosterEditor } from '@/components/admin/Round2DraftRosterEditor';
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
  const [draftMode, setDraftMode] = useState(false);
  const [draftRoster, setDraftRoster] = useState<Round2DraftRoster | null>(null);
  const [workflowPhase, setWorkflowPhase] = useState<Round2WorkflowPhase>('edit');
  const [rosterPickList, setRosterPickList] = useState<RosterPickRow[]>([]);
  const seededRef = useRef(false);

  const withMemberIds = (draft: Round2DraftRoster | null): Round2DraftRoster | null => {
    if (!draft) return null;
    return {
      ...draft,
      teams: draft.teams.map((t) => ({
        ...t,
        members: t.members.map((m, i) => ({
          ...m,
          member_id: m.member_id || `m-${t.team_key}-${i}`,
        })),
      })),
    };
  };

  const applyPayload = useCallback((data: Record<string, unknown>) => {
    setLocked(Boolean(data.locked));
    setTeams(Array.isArray(data.teams) ? data.teams : []);
    setPoolItems(Array.isArray(data.poolItems) ? data.poolItems : []);
    setRound2TableReady(data.round2TableReady !== false);
    setDraftMode(Boolean(data.draftMode));
    setDraftRoster(withMemberIds((data.draftRoster as Round2DraftRoster | null) ?? null));
    setWorkflowPhase((data.workflowPhase as Round2WorkflowPhase) || 'edit');
    setRosterPickList(Array.isArray(data.rosterPickList) ? data.rosterPickList : []);
    const keys = (data.selection as { selected_team_keys?: string[] })?.selected_team_keys;
    setSelectedKeys(new Set(Array.isArray(keys) ? keys : []));
    const sel = data.selection as { pool_assignments?: Record<string, string> };
    setPoolAssignments(
      sel?.pool_assignments && typeof sel.pool_assignments === 'object' ? sel.pool_assignments : {}
    );
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setMessage(null);
      const res = await fetch('/api/admin/round2', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load Round 2');
      applyPayload(data);
      return data as { draftMode?: boolean };
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Load failed' });
      return null;
    } finally {
      setLoading(false);
    }
  }, [adminSecret, applyPayload]);

  const seedPdf = useCallback(async () => {
    setBusy('seed-pdf-shortlist');
    try {
      const res = await fetch('/api/admin/round2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed-pdf-shortlist', adminSecret }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'PDF ingest failed');
      await load();
      setMessage({
        type: 'ok',
        text: `Pixel & Anomaly PDF shortlist loaded (${data.teamCount} teams). Edit members, then generate tokens.`,
      });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Seed failed' });
    } finally {
      setBusy(null);
    }
  }, [adminSecret, load]);

  useEffect(() => {
    if (!adminSecret) return;
    (async () => {
      const data = await load();
      if (!seededRef.current && data && !data.draftMode) {
        seededRef.current = true;
        await seedPdf();
      }
    })();
  }, [adminSecret, load, seedPdf]);

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

  const saveSelection = async (overrideDraft?: Round2DraftRoster | null) => {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = {
        selected_team_keys: [...selectedKeys],
        pool_assignments: poolAssignments,
      };
      if (overrideDraft !== undefined) {
        body.draft_roster = overrideDraft;
        body.workflow_phase = workflowPhase;
        if (overrideDraft) {
          body.selected_team_keys = overrideDraft.teams.filter((t) => t.selected).map((t) => t.team_key);
        }
      } else if (draftRoster) {
        body.draft_roster = draftRoster;
        body.workflow_phase = workflowPhase;
        body.selected_team_keys = draftRoster.teams.filter((t) => t.selected).map((t) => t.team_key);
      }
      const res = await fetch('/api/admin/round2', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setDirty(false);
      setMessage({ type: 'ok', text: 'Draft saved.' });
    } catch (e) {
      setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  };

  const exportEmails = async () => {
    if (dirty) await saveSelection();
    window.open(
      `/api/admin/round2?export=email-csv&adminSecret=${encodeURIComponent(adminSecret)}`,
      '_blank'
    );
  };

  const runAction = async (action: string, extra?: Record<string, unknown>) => {
    setBusy(action);
    setMessage(null);
    try {
      if (dirty) await saveSelection();
      const res = await fetch('/api/admin/round2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminSecret, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `${action} failed`);
      if (action === 'generate-tokens') {
        setWorkflowPhase('tokens_ready');
        if (data.draftRoster) setDraftRoster(data.draftRoster);
        setMessage({
          type: 'ok',
          text: `Tokens generated for ${data.tokenCount} team(s). Export email CSV, then ingest / pool when ready.`,
        });
        await load();
      } else if (action === 'random-pool' && data.pool_assignments) {
        setPoolAssignments(data.pool_assignments);
      } else if (action === 'ingest-contest') {
        setWorkflowPhase('ops');
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
          text: `Random pool mapping for ${data.mappedTeams} team(s).`,
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

  const opsUnlocked = workflowPhase === 'tokens_ready' || workflowPhase === 'ops';

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
            Lock <strong>Final Teams</strong> first. Round 2 draft still uses that roster for member lookup.
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
            {draftMode
              ? 'Editable Pixel & Anomaly shortlist — preview only until tokens are generated.'
              : 'Choose final teams for Round 2.'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={seedPdf}
            disabled={!!busy}
            className="text-xs px-3 py-2 rounded-xl border border-app-border"
          >
            Reload PDF shortlist
          </button>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      {!round2TableReady && (
        <div className="flex gap-2 text-sm text-amber-700 bg-amber-500/10 border border-amber-500/30 rounded-xl p-3">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Run migrations <code className="text-xs">013</code> and <code className="text-xs">016</code> in
            Supabase for persistent draft storage.
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

      {draftMode && draftRoster && (
        <Round2DraftRosterEditor
          draft={draftRoster}
          workflowPhase={workflowPhase}
          rosterPickList={rosterPickList}
          onChange={(next) => {
            setDraftRoster(next);
            setDirty(true);
          }}
          onSaveDraft={() => saveSelection(draftRoster)}
          onGenerateTokens={() => runAction('generate-tokens')}
          saving={saving}
          busy={busy}
        />
      )}

      {!draftMode && (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-app-subtext">
              <Users className="w-4 h-4 inline mr-1" />
              {teams.length} teams · {selectedKeys.size} selected
            </span>
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
                    <th className="p-3">Team</th>
                    <th className="p-3">Token</th>
                    <th className="p-3">Members</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTeams.map((team) => (
                    <tr key={team.team_key} className="border-b border-app-border/60">
                      <td className="p-3 font-medium">{team.team_name}</td>
                      <td className="p-3 font-mono text-xs">{team.access_token}</td>
                      <td className="p-3 text-xs text-app-subtext">
                        {team.members.map((m) => m.email).filter(Boolean).join(', ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {draftMode && opsUnlocked && (
        <section className="rounded-2xl border border-violet-500/30 p-4 space-y-4">
          <h2 className="font-medium text-app-text">Step 3 — Export &amp; contest setup</h2>
          <p className="text-xs text-app-subtext">
            {teams.length} preview teams · {memberEmailCount} member emails with tokens · pool ZIPs:{' '}
            {poolItems.length}
          </p>
          <div className="overflow-x-auto max-h-48">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-app-subtext border-b border-app-border">
                  <th className="text-left py-2">Team</th>
                  <th className="text-left py-2">Token</th>
                  <th className="text-left py-2 min-w-[140px]">Pool</th>
                </tr>
              </thead>
              <tbody>
                {teams
                  .filter((t) => selectedKeys.has(t.team_key))
                  .map((team) => (
                    <tr key={team.team_key} className="border-b border-app-border/40">
                      <td className="py-2">{team.team_name}</td>
                      <td className="py-2 font-mono">{team.access_token}</td>
                      <td className="py-2">
                        {poolItems.length > 0 ? (
                          <select
                            value={poolAssignments[team.team_key] || ''}
                            onChange={(e) => setPoolForTeam(team.team_key, e.target.value)}
                            className="w-full text-xs rounded border border-app-border px-1 py-0.5"
                          >
                            <option value="">—</option>
                            {poolItems.map((p) => (
                              <option key={p.poolKey} value={p.poolKey}>
                                {p.displayName}
                              </option>
                            ))}
                          </select>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-app-subtext">
            Stage count:{' '}
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
              onClick={exportEmails}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
            >
              <Download className="w-4 h-4" />
              Export email CSV
            </button>
            <button
              type="button"
              disabled={!!busy}
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
              disabled={!!busy || poolItems.length === 0}
              onClick={() => runAction('random-pool', { preserveManual: true })}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-app-border text-sm"
            >
              {busy === 'random-pool' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Shuffle className="w-4 h-4" />
              )}
              Random pool
            </button>
            <button
              type="button"
              disabled={!!busy || poolItems.length === 0}
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
      )}

      {draftMode && !opsUnlocked && (
        <p className="text-xs text-app-subtext italic">
          Ingest, pool, and email export unlock after you confirm all 15 teams and generate tokens.
        </p>
      )}
    </div>
  );
}
