'use client';

import React, { useMemo, useState } from 'react';
import type { Round2DraftRoster, Round2DraftTeam, RosterPickRow } from '@/lib/round2-draft';
import type { Round2WorkflowPhase } from '@/lib/round2-draft';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Loader2,
  Plus,
  Trash2,
  UserPlus,
} from 'lucide-react';
function uid(): string {
  if (typeof globalThis.crypto !== 'undefined' && 'randomUUID' in globalThis.crypto) {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

interface Round2DraftRosterEditorProps {
  draft: Round2DraftRoster;
  workflowPhase: Round2WorkflowPhase;
  rosterPickList: RosterPickRow[];
  onChange: (next: Round2DraftRoster) => void;
  onSaveDraft: () => Promise<void>;
  onGenerateTokens: () => Promise<void>;
  saving: boolean;
  busy: string | null;
}

function newTeam(sortOrder: number): Round2DraftTeam {
  return {
    team_key: `draft:${uid()}`,
    team_name: 'New team',
    seminar_hall: '7',
    sort_order: sortOrder,
    access_token: null,
    members: [],
    selected: true,
  };
}

export function Round2DraftRosterEditor({
  draft,
  workflowPhase,
  rosterPickList,
  onChange,
  onSaveDraft,
  onGenerateTokens,
  saving,
  busy,
}: Round2DraftRosterEditorProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [pickFilter, setPickFilter] = useState('');

  const selectedCount = useMemo(() => draft.teams.filter((t) => t.selected).length, [draft.teams]);

  const filteredPicks = useMemo(() => {
    const q = pickFilter.trim().toLowerCase();
    if (!q) return rosterPickList.slice(0, 200);
    return rosterPickList
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.team_name.toLowerCase().includes(q)
      )
      .slice(0, 100);
  }, [rosterPickList, pickFilter]);

  const updateTeam = (teamKey: string, patch: Partial<Round2DraftTeam>) => {
    onChange({
      ...draft,
      updated_at: new Date().toISOString(),
      teams: draft.teams.map((t) => (t.team_key === teamKey ? { ...t, ...patch } : t)),
    });
  };

  const removeTeam = (teamKey: string) => {
    onChange({
      ...draft,
      updated_at: new Date().toISOString(),
      teams: draft.teams.filter((t) => t.team_key !== teamKey),
    });
  };

  const addTeam = () => {
    const maxOrder = draft.teams.reduce((m, t) => Math.max(m, t.sort_order), 0);
    onChange({
      ...draft,
      updated_at: new Date().toISOString(),
      teams: [...draft.teams, newTeam(maxOrder + 1)],
    });
  };

  const selectAll15 = () => {
    onChange({
      ...draft,
      teams: draft.teams.map((t) => ({ ...t, selected: true })),
    });
  };

  const addMemberManual = (teamKey: string) => {
    const team = draft.teams.find((t) => t.team_key === teamKey);
    if (!team) return;
    updateTeam(teamKey, {
      members: [
        ...team.members,
        {
          member_id: uid(),
          slot: team.members.length + 1,
          name: '',
          email: '',
          year: '',
          branch: '',
          enrollment_number: '',
        },
      ],
    });
  };

  const addMemberFromPick = (teamKey: string, pick: RosterPickRow) => {
    const team = draft.teams.find((t) => t.team_key === teamKey);
    if (!team) return;
    if (team.members.some((m) => (m.email || '').toLowerCase() === pick.email.toLowerCase())) return;
    updateTeam(teamKey, {
      members: [
        ...team.members,
        {
          member_id: uid(),
          slot: team.members.length + 1,
          name: pick.name,
          email: pick.email,
          year: '',
          branch: '',
          enrollment_number: pick.enrollment_id || '',
        },
      ],
    });
  };

  const updateMember = (
    teamKey: string,
    memberId: string,
    field: 'name' | 'email' | 'enrollment_number',
    value: string
  ) => {
    const team = draft.teams.find((t) => t.team_key === teamKey);
    if (!team) return;
    updateTeam(teamKey, {
      members: team.members.map((m) =>
        m.member_id === memberId ? { ...m, [field]: value } : m
      ),
    });
  };

  const removeMember = (teamKey: string, memberId: string) => {
    const team = draft.teams.find((t) => t.team_key === teamKey);
    if (!team) return;
    updateTeam(teamKey, {
      members: team.members.filter((m) => m.member_id !== memberId),
    });
  };

  const tokensLocked = workflowPhase === 'tokens_ready' || workflowPhase === 'ops';

  const sortedTeams = useMemo(
    () => draft.teams.slice().sort((a, b) => a.sort_order - b.sort_order),
    [draft.teams]
  );

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 p-4 text-sm">
        <p className="font-semibold text-app-text">Pixel &amp; Anomaly — Round 2 preview roster</p>
        <p className="text-app-subtext mt-1">
          PDF shortlist only ({draft.teams.length} teams). Edit names and members here. No emails, ingest,
          or pool commit until you generate tokens and continue.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <button
          type="button"
          onClick={selectAll15}
          className="text-xs px-3 py-1.5 rounded-lg border border-app-border"
        >
          Select all 15
        </button>
        <button
          type="button"
          onClick={addTeam}
          disabled={tokensLocked}
          className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-app-border disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add team
        </button>
        <span className="text-xs text-app-subtext ml-auto">
          {selectedCount} selected · phase: {workflowPhase}
        </span>
        <button
          type="button"
          disabled={saving}
          onClick={onSaveDraft}
          className="text-xs px-3 py-2 rounded-lg bg-app-text text-app-bg font-medium disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin inline" /> : 'Save draft'}
        </button>
        <button
          type="button"
          disabled={!!busy || tokensLocked || selectedCount !== 15}
          onClick={onGenerateTokens}
          className="text-xs px-3 py-2 rounded-lg bg-violet-600 text-white font-semibold disabled:opacity-50"
        >
          {busy === 'generate-tokens' ? (
            <Loader2 className="w-4 h-4 animate-spin inline" />
          ) : (
            'Next: generate tokens (15 teams)'
          )}
        </button>
      </div>

      {selectedCount !== 15 && (
        <div className="flex gap-2 text-xs text-amber-800 bg-amber-500/10 border border-amber-500/30 rounded-lg p-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Select exactly 15 teams before token generation.
        </div>
      )}

      <div className="space-y-2">
        {sortedTeams.map((team) => {
          const open = expanded.has(team.team_key);
          return (
            <div
              key={team.team_key}
              className={`rounded-xl border border-app-border overflow-hidden ${
                team.selected ? 'bg-emerald-500/5' : 'bg-app-surface'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 p-3">
                <button
                  type="button"
                  onClick={() => {
                    setExpanded((prev) => {
                      const n = new Set(prev);
                      if (n.has(team.team_key)) n.delete(team.team_key);
                      else n.add(team.team_key);
                      return n;
                    });
                  }}
                  className="p-1 rounded hover:bg-app-hover"
                >
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                <input
                  type="checkbox"
                  checked={team.selected}
                  disabled={tokensLocked}
                  onChange={(e) => updateTeam(team.team_key, { selected: e.target.checked })}
                />
                <span className="text-xs font-mono text-app-subtext w-6">#{team.sort_order}</span>
                <input
                  value={team.team_name}
                  disabled={tokensLocked}
                  onChange={(e) => updateTeam(team.team_key, { team_name: e.target.value })}
                  className="flex-1 min-w-[160px] text-sm font-medium px-2 py-1 rounded-lg border border-app-border bg-app-bg"
                />
                <label className="text-xs text-app-subtext flex items-center gap-1">
                  SH
                  <input
                    value={team.seminar_hall}
                    disabled={tokensLocked}
                    onChange={(e) => updateTeam(team.team_key, { seminar_hall: e.target.value })}
                    className="w-10 px-1 py-0.5 rounded border border-app-border text-center"
                  />
                </label>
                {team.access_token && (
                  <span className="font-mono text-[10px] text-violet-400">{team.access_token}</span>
                )}
                {team.pdf_label && team.pdf_label !== team.team_name && (
                  <span className="text-[10px] text-app-subtext" title="PDF label">
                    PDF: {team.pdf_label}
                  </span>
                )}
                {!tokensLocked && (
                  <button
                    type="button"
                    onClick={() => removeTeam(team.team_key)}
                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg ml-auto"
                    aria-label="Remove team"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {open && (
                <div className="px-3 pb-3 border-t border-app-border/60 space-y-3">
                  <div className="flex flex-wrap gap-2 pt-2">
                    <button
                      type="button"
                      disabled={tokensLocked}
                      onClick={() => addMemberManual(team.team_key)}
                      className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-app-border disabled:opacity-50"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add member manually
                    </button>
                  </div>

                  {!tokensLocked && (
                    <div className="rounded-lg border border-app-border p-2 space-y-2">
                      <p className="text-[11px] font-medium text-app-subtext">Add from roster list</p>
                      <input
                        value={pickFilter}
                        onChange={(e) => setPickFilter(e.target.value)}
                        placeholder="Search name, email, team…"
                        className="w-full text-xs px-2 py-1.5 rounded border border-app-border"
                      />
                      <div className="max-h-32 overflow-y-auto text-xs space-y-1">
                        {filteredPicks.map((p) => (
                          <button
                            key={p.pick_key}
                            type="button"
                            onClick={() => addMemberFromPick(team.team_key, p)}
                            className="w-full text-left px-2 py-1 rounded hover:bg-app-hover truncate"
                          >
                            <span className="font-medium">{p.name || p.email}</span>
                            {p.email && (
                              <span className="text-app-subtext"> · {p.email}</span>
                            )}
                            <span className="text-app-subtext"> · {p.team_name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-app-subtext border-b border-app-border">
                        <th className="text-left py-1">Name</th>
                        <th className="text-left py-1">Email</th>
                        <th className="text-left py-1">Enrollment</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {team.members.map((m) => (
                        <tr key={m.member_id || `${m.email}-${m.name}`} className="border-b border-app-border/40">
                          <td className="py-1 pr-1">
                            <input
                              value={m.name || ''}
                              disabled={tokensLocked}
                              onChange={(e) =>
                                updateMember(team.team_key, m.member_id!, 'name', e.target.value)
                              }
                              className="w-full px-1.5 py-0.5 rounded border border-app-border"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              value={m.email || ''}
                              disabled={tokensLocked}
                              onChange={(e) =>
                                updateMember(team.team_key, m.member_id!, 'email', e.target.value)
                              }
                              className="w-full px-1.5 py-0.5 rounded border border-app-border"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              value={m.enrollment_number || ''}
                              disabled={tokensLocked}
                              onChange={(e) =>
                                updateMember(
                                  team.team_key,
                                  m.member_id!,
                                  'enrollment_number',
                                  e.target.value
                                )
                              }
                              className="w-full px-1.5 py-0.5 rounded border border-app-border"
                            />
                          </td>
                          <td className="py-1">
                            {!tokensLocked && (
                              <button
                                type="button"
                                onClick={() => removeMember(team.team_key, m.member_id!)}
                                className="text-rose-500 p-1"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {team.members.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-3 text-center text-app-subtext">
                            No members — add from list or manually
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
