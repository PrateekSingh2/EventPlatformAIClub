'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    BadgeCheck,
    Download,
    Loader2,
    Lock,
    Mail,
    Plus,
    RefreshCw,
    Save,
    Trash2,
    Unlock,
    Users,
    AlertCircle,
} from 'lucide-react';
import type { FinalTeamRecord } from '@/lib/final-teams';
import { teamSizeLabelFromMemberCount } from '@/lib/team-merger';
import type { TeamMemberPayload } from '@/lib/team-registration-form';
import { generateContestToken } from '@/lib/tokens';

const AUTO_MERGE_STORAGE_KEY = 'eventPlatform.teamMerger.autoMerge';
const MANUAL_GROUPS_STORAGE_KEY = 'eventPlatform.teamMerger.manualGroups';

interface FinalTeamsTabProps {
    adminSecret: string;
}

function emptyMember(slot: number): TeamMemberPayload {
    return {
        slot,
        name: '',
        enrollment_number: '',
        email: '',
        branch: '',
        year: '',
    };
}

function newBlankTeam(): FinalTeamRecord {
    const token = generateContestToken();
    const key = `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    return {
        team_key: key,
        team_name: 'New Team',
        team_size: 'Solo',
        access_token: token,
        members: [emptyMember(1)],
        source_team_names: ['New Team'],
        submission_ids: [],
        seminar_hall: null,
        sort_order: 0,
    };
}

export function FinalTeamsTab({ adminSecret }: FinalTeamsTabProps) {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [locking, setLocking] = useState(false);
    const [ready, setReady] = useState(true);
    const [locked, setLocked] = useState(false);
    const [lockedAt, setLockedAt] = useState<string | null>(null);
    const [teams, setTeams] = useState<FinalTeamRecord[]>([]);
    const [dirty, setDirty] = useState(false);
    const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());

    const fetchRoster = useCallback(async () => {
        try {
            setLoading(true);
            setMessage(null);
            const res = await fetch('/api/admin/final-teams', {
                headers: { 'x-admin-secret': adminSecret },
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to load');
            setReady(data.ready !== false);
            setLocked(Boolean(data.config?.locked));
            setLockedAt(data.config?.locked_at ?? null);
            setTeams(Array.isArray(data.teams) ? data.teams : []);
            setDirty(false);
            if (Array.isArray(data.teams) && data.teams.length > 0) {
                setExpanded(new Set(data.teams.slice(0, 3).map((t: FinalTeamRecord) => t.team_key)));
            }
        } catch (e) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Load failed' });
        } finally {
            setLoading(false);
        }
    }, [adminSecret]);

    useEffect(() => {
        if (adminSecret) fetchRoster();
    }, [adminSecret, fetchRoster]);

    const memberCount = useMemo(
        () => teams.reduce((n, t) => n + t.members.filter((m) => m.email?.trim()).length, 0),
        [teams]
    );

    const updateTeam = (teamKey: string, patch: Partial<FinalTeamRecord>) => {
        if (locked) return;
        setTeams((prev) =>
            prev.map((t) => {
                if (t.team_key !== teamKey) return t;
                const next = { ...t, ...patch };
                const filled = next.members.filter((m) => (m.email || m.name || '').trim()).length;
                next.team_size = teamSizeLabelFromMemberCount(filled || next.members.length);
                return next;
            })
        );
        setDirty(true);
    };

    const updateMember = (teamKey: string, slot: number, patch: Partial<TeamMemberPayload>) => {
        if (locked) return;
        setTeams((prev) =>
            prev.map((t) => {
                if (t.team_key !== teamKey) return t;
                const members = t.members.map((m) => (m.slot === slot ? { ...m, ...patch } : m));
                const filled = members.filter((m) => (m.email || m.name || '').trim()).length;
                return { ...t, members, team_size: teamSizeLabelFromMemberCount(filled || members.length) };
            })
        );
        setDirty(true);
    };

    const addMember = (teamKey: string) => {
        if (locked) return;
        setTeams((prev) =>
            prev.map((t) => {
                if (t.team_key !== teamKey) return t;
                const nextSlot = (t.members.reduce((m, x) => Math.max(m, x.slot), 0) || 0) + 1;
                if (nextSlot > 4) return t;
                return { ...t, members: [...t.members, emptyMember(nextSlot)] };
            })
        );
        setDirty(true);
    };

    const removeTeam = (teamKey: string) => {
        if (locked) return;
        if (!window.confirm('Remove this team from the final roster?')) return;
        setTeams((prev) => prev.filter((t) => t.team_key !== teamKey));
        setDirty(true);
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/final-teams', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': adminSecret,
                },
                body: JSON.stringify({ teams }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Save failed');
            setTeams(data.teams || teams);
            setDirty(false);
            setMessage({ type: 'ok', text: `Saved ${data.teams?.length ?? teams.length} team(s).` });
        } catch (e) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Save failed' });
        } finally {
            setSaving(false);
        }
    };

    const handleSyncFromMerger = async () => {
        setSyncing(true);
        setMessage(null);
        try {
            let autoMerge = false;
            let manualGroupMap: string | null = null;
            try {
                autoMerge = localStorage.getItem(AUTO_MERGE_STORAGE_KEY) === '1';
                manualGroupMap = localStorage.getItem(MANUAL_GROUPS_STORAGE_KEY);
            } catch {
                /* ignore */
            }
            const res = await fetch('/api/admin/final-teams', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': adminSecret,
                },
                body: JSON.stringify({
                    action: 'sync-from-merger',
                    autoMerge,
                    manualGroupMap,
                }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Sync failed');
            setTeams(data.teams || []);
            setDirty(false);
            setMessage({
                type: 'ok',
                text: `Synced ${data.teamCount ?? data.teams?.length ?? 0} squad(s) from Team Merger layout.`,
            });
        } catch (e) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Sync failed' });
        } finally {
            setSyncing(false);
        }
    };

    const toggleLock = async (nextLocked: boolean) => {
        if (nextLocked && dirty) {
            setMessage({ type: 'err', text: 'Save changes before locking.' });
            return;
        }
        if (nextLocked && teams.length === 0) {
            setMessage({ type: 'err', text: 'Add or sync teams before locking.' });
            return;
        }
        const label = nextLocked
            ? 'Lock final roster? Email, Round 1, and leaderboard views will use this data (users table unchanged).'
            : 'Unlock roster for editing?';
        if (!window.confirm(label)) return;

        setLocking(true);
        setMessage(null);
        try {
            const res = await fetch('/api/admin/final-teams', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admin-secret': adminSecret,
                },
                body: JSON.stringify({ action: nextLocked ? 'lock' : 'unlock' }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Lock update failed');
            setLocked(Boolean(data.config?.locked));
            setLockedAt(data.config?.locked_at ?? null);
            setMessage({
                type: 'ok',
                text: nextLocked ? 'Final roster locked — canonical everywhere.' : 'Roster unlocked for edits.',
            });
        } catch (e) {
            setMessage({ type: 'err', text: e instanceof Error ? e.message : 'Lock failed' });
        } finally {
            setLocking(false);
        }
    };

    const downloadExport = async (kind: 'teams-csv' | 'email-csv') => {
        const res = await fetch(`/api/admin/final-teams?export=${kind}`, {
            headers: { 'x-admin-secret': adminSecret },
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setMessage({ type: 'err', text: data.error || 'Export failed' });
            return;
        }
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = kind === 'email-csv' ? 'final-teams-email-paste.csv' : 'final-teams-full.csv';
        a.click();
        URL.revokeObjectURL(url);
    };

    const toggleExpanded = (key: string) => {
        setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20 text-app-subtext">
                <Loader2 className="w-6 h-6 animate-spin mr-2" />
                Loading final roster…
            </div>
        );
    }

    return (
        <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-app-text flex items-center gap-2">
                        <BadgeCheck className="w-5 h-5 text-cyan-400" />
                        Final Team Roster
                    </h2>
                    <p className="text-xs text-app-subtext mt-1 max-w-2xl">
                        Official merged squads — one shared token per team. When locked, Email Studio, Round 1 team
                        picker, and leaderboard display use this roster (existing participant rows in the database are
                        not modified).
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {locked ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs font-semibold">
                            <Lock className="w-3.5 h-3.5" /> Locked
                            {lockedAt ? ` · ${new Date(lockedAt).toLocaleString()}` : ''}
                        </span>
                    ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs font-semibold">
                            <Unlock className="w-3.5 h-3.5" /> Editable
                        </span>
                    )}
                </div>
            </div>

            {!ready && (
                <div className="flex items-start gap-2 p-4 rounded-xl border border-amber-500/40 bg-amber-500/10 text-sm text-amber-100">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div>
                        Run <code className="text-xs">012_final_teams_roster.sql</code> in Supabase SQL Editor, then
                        refresh this page.
                    </div>
                </div>
            )}

            {message && (
                <div
                    className={`text-sm px-4 py-3 rounded-xl border ${message.type === 'ok'
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-100'
                        }`}
                >
                    {message.text}
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() => fetchRoster()}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
                {!locked && (
                    <>
                        <button
                            type="button"
                            disabled={syncing || !ready}
                            onClick={handleSyncFromMerger}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-cyan-500/40 text-cyan-200 hover:bg-cyan-500/10 disabled:opacity-50"
                        >
                            {syncing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Users className="w-3.5 h-3.5" />}
                            Sync from Team Merger
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setTeams((p) => [...p, newBlankTeam()]);
                                setDirty(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover"
                        >
                            <Plus className="w-3.5 h-3.5" /> New team
                        </button>
                        <button
                            type="button"
                            disabled={saving || !dirty}
                            onClick={handleSave}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-cyan-600 text-white hover:bg-cyan-500 disabled:opacity-50"
                        >
                            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                            Save roster
                        </button>
                    </>
                )}
                <button
                    type="button"
                    disabled={!ready || teams.length === 0}
                    onClick={() => downloadExport('teams-csv')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
                >
                    <Download className="w-3.5 h-3.5" /> Team-wise export
                </button>
                <button
                    type="button"
                    disabled={!ready || teams.length === 0}
                    onClick={() => downloadExport('email-csv')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
                >
                    <Mail className="w-3.5 h-3.5" /> Email paste export
                </button>
                <button
                    type="button"
                    disabled={locking || !ready}
                    onClick={() => toggleLock(!locked)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border disabled:opacity-50 ${locked
                            ? 'border-amber-500/40 text-amber-200 hover:bg-amber-500/10'
                            : 'border-emerald-500/40 text-emerald-200 hover:bg-emerald-500/10'
                        }`}
                >
                    {locking ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : locked ? (
                        <Unlock className="w-3.5 h-3.5" />
                    ) : (
                        <Lock className="w-3.5 h-3.5" />
                    )}
                    {locked ? 'Unlock data' : 'Lock data'}
                </button>
            </div>

            <p className="text-xs text-app-subtext">
                {teams.length} team(s) · {memberCount} member email(s)
                {dirty ? ' · unsaved changes' : ''}
            </p>

            <div className="space-y-3">
                {teams.map((team) => {
                    const open = expanded.has(team.team_key);
                    return (
                        <div
                            key={team.team_key}
                            className="rounded-xl border border-app-border bg-app-surface overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => toggleExpanded(team.team_key)}
                                className="w-full flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-app-hover/50"
                            >
                                <div>
                                    <div className="font-semibold text-sm text-app-text">{team.team_name}</div>
                                    <div className="text-[11px] text-app-subtext font-mono mt-0.5">
                                        {team.team_size} · Token {team.access_token}
                                        {team.seminar_hall ? ` · ${team.seminar_hall}` : ''}
                                    </div>
                                </div>
                                <span className="text-xs text-app-subtext">{open ? 'Hide' : 'Show'} members</span>
                            </button>
                            {open && (
                                <div className="px-4 pb-4 space-y-3 border-t border-app-border">
                                    {!locked && (
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-3">
                                            <label className="text-xs space-y-1">
                                                <span className="text-app-subtext">Team name</span>
                                                <input
                                                    value={team.team_name}
                                                    onChange={(e) => updateTeam(team.team_key, { team_name: e.target.value })}
                                                    className="w-full px-2 py-1.5 rounded-lg bg-app-bg border border-app-border text-xs"
                                                />
                                            </label>
                                            <label className="text-xs space-y-1">
                                                <span className="text-app-subtext">Seminar hall</span>
                                                <input
                                                    value={team.seminar_hall ?? ''}
                                                    onChange={(e) =>
                                                        updateTeam(team.team_key, { seminar_hall: e.target.value || null })
                                                    }
                                                    className="w-full px-2 py-1.5 rounded-lg bg-app-bg border border-app-border text-xs"
                                                />
                                            </label>
                                            <label className="text-xs space-y-1">
                                                <span className="text-app-subtext">Team token</span>
                                                <input
                                                    value={team.access_token}
                                                    onChange={(e) =>
                                                        updateTeam(team.team_key, { access_token: e.target.value.toUpperCase() })
                                                    }
                                                    className="w-full px-2 py-1.5 rounded-lg bg-app-bg border border-app-border text-xs font-mono"
                                                />
                                            </label>
                                        </div>
                                    )}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="text-app-subtext text-left border-b border-app-border">
                                                    <th className="py-2 pr-2">#</th>
                                                    <th className="py-2 pr-2">Name</th>
                                                    <th className="py-2 pr-2">Email</th>
                                                    <th className="py-2 pr-2">Enrollment</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {team.members.map((m) => (
                                                    <tr key={m.slot} className="border-b border-app-border/50">
                                                        <td className="py-2 pr-2">{m.slot}</td>
                                                        <td className="py-2 pr-2">
                                                            {locked ? (
                                                                m.name
                                                            ) : (
                                                                <input
                                                                    value={m.name}
                                                                    onChange={(e) =>
                                                                        updateMember(team.team_key, m.slot, { name: e.target.value })
                                                                    }
                                                                    className="w-full min-w-[120px] px-2 py-1 rounded bg-app-bg border border-app-border"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-2">
                                                            {locked ? (
                                                                m.email
                                                            ) : (
                                                                <input
                                                                    value={m.email}
                                                                    onChange={(e) =>
                                                                        updateMember(team.team_key, m.slot, { email: e.target.value })
                                                                    }
                                                                    className="w-full min-w-[160px] px-2 py-1 rounded bg-app-bg border border-app-border"
                                                                />
                                                            )}
                                                        </td>
                                                        <td className="py-2 pr-2 text-app-subtext">{m.enrollment_number}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                    {!locked && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => addMember(team.team_key)}
                                                className="text-xs px-2 py-1 rounded border border-app-border hover:bg-app-hover"
                                            >
                                                Add member
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => removeTeam(team.team_key)}
                                                className="text-xs px-2 py-1 rounded border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 inline-flex items-center gap-1"
                                            >
                                                <Trash2 className="w-3 h-3" /> Remove team
                                            </button>
                                        </div>
                                    )}
                                    {team.source_team_names.length > 1 && (
                                        <p className="text-[10px] text-app-subtext">
                                            Source teams: {team.source_team_names.join(', ')}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
