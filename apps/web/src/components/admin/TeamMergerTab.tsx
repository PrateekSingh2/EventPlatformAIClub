'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  GitMerge,
  GitBranch,
  Loader2,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Eye,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import type { TeamMemberPayload } from '@/lib/team-registration-form';
import {
  applyManualMerge,
  applyManualUnmerge,
  buildManualMergeGroups,
  buildManualGroupMapAllSquadsOfFour,
  buildManualGroupMapFromStoredSquads,
  buildMergerExportRows,
  computeAutoMergeGroups,
  filterMergerEligibleSubmissions,
  manualGroupMapFromJson,
  manualGroupMapsEqual,
  manualGroupMapToJson,
  pruneManualGroupMap,
  MERGER_EXPORT_HEADERS,
  type MergeGroup,
  type TeamSubmission,
} from '@/lib/team-merger';
import {
  buildSeminarHallExportRows,
  DEFAULT_SEMINAR_HALLS,
  resolveHallAssignments,
  storedHallMap,
  type SeminarHallTeam,
  type StoredSeminarHallRow,
} from '@/lib/seminar-halls';
import { readClientCache, writeClientCache } from '@/lib/client-cache';

interface TeamMergerTabProps {
  adminSecret: string;
}

const AUTO_MERGE_STORAGE_KEY = 'eventPlatform.teamMerger.autoMerge';
const MANUAL_GROUPS_STORAGE_KEY = 'eventPlatform.teamMerger.manualGroups';

function readStoredManualGroups(): Map<string, string> {
  try {
    return manualGroupMapFromJson(localStorage.getItem(MANUAL_GROUPS_STORAGE_KEY));
  } catch {
    return new Map();
  }
}

function writeStoredManualGroups(map: Map<string, string>) {
  try {
    if (map.size === 0) {
      localStorage.removeItem(MANUAL_GROUPS_STORAGE_KEY);
    } else {
      localStorage.setItem(MANUAL_GROUPS_STORAGE_KEY, manualGroupMapToJson(map));
    }
  } catch {
    /* private mode / quota */
  }
}

function readStoredAutoMerge(): boolean {
  try {
    return localStorage.getItem(AUTO_MERGE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStoredAutoMerge(on: boolean) {
  try {
    localStorage.setItem(AUTO_MERGE_STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* private mode / quota */
  }
}

export function TeamMergerTab({ adminSecret }: TeamMergerTabProps) {
  const [submissions, setSubmissions] = useState<TeamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoMerge, setAutoMerge] = useState(false);
  const [manualGroupMap, setManualGroupMap] = useState<Map<string, string>>(() => new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewGroup, setPreviewGroup] = useState<MergeGroup | null>(null);
  const [excludedOptOutCount, setExcludedOptOutCount] = useState(0);
  const [packMessage, setPackMessage] = useState<string | null>(null);
  const [selectedHalls, setSelectedHalls] = useState<Set<string>>(new Set(['SH3', 'SH7']));
  const [customHall, setCustomHall] = useState('');
  const [hallMessage, setHallMessage] = useState<string | null>(null);
  const [storedHallRows, setStoredHallRows] = useState<StoredSeminarHallRow[]>([]);
  const [storedHallsLoaded, setStoredHallsLoaded] = useState(false);
  const appliedStoredMergeRef = useRef(false);
  const fetchGeneration = useRef(0);

  const fetchSubmissions = useCallback(async () => {
    const generation = ++fetchGeneration.current;
    try {
      setLoading(true);
      setError(null);
      const cached = readClientCache<{ submissions: TeamSubmission[] }>(
        'admin_form_submissions',
        45_000
      );
      if (cached?.submissions?.length) {
        setSubmissions(cached.submissions);
        setExcludedOptOutCount(
          cached.submissions.filter((s) => s.squad_merge_opt_in === false).length
        );
        setLoading(false);
      }

      const res = await fetch('/api/admin/form-submissions', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (generation !== fetchGeneration.current) return;
      if (!res.ok || data.error) {
        setError(data.error || 'Failed to load submissions');
        setSubmissions([]);
        return;
      }
      const all: TeamSubmission[] = data.submissions || [];
      setExcludedOptOutCount(all.filter((s) => s.squad_merge_opt_in === false).length);
      setSubmissions(all);
      writeClientCache('admin_form_submissions', { submissions: all });
    } catch {
      setError('Network error while loading submissions');
      setSubmissions([]);
    } finally {
      if (generation === fetchGeneration.current) {
        setLoading(false);
      }
    }
  }, [adminSecret]);

  useEffect(() => {
    setAutoMerge(readStoredAutoMerge());
    setManualGroupMap(readStoredManualGroups());
  }, []);

  useEffect(() => {
    if (adminSecret) fetchSubmissions();
  }, [adminSecret, fetchSubmissions]);

  const persistManualGroupMap = (next: Map<string, string>) => {
    writeStoredManualGroups(next);
    setManualGroupMap(next);
  };

  const fetchStoredHalls = useCallback(async () => {
    if (!adminSecret) return;
    try {
      const res = await fetch('/api/admin/seminar-halls', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && Array.isArray(data.assignments)) {
        setStoredHallRows(data.assignments as StoredSeminarHallRow[]);
      }
    } catch {
      /* optional table / offline */
    } finally {
      setStoredHallsLoaded(true);
    }
  }, [adminSecret]);

  useEffect(() => {
    fetchStoredHalls();
  }, [fetchStoredHalls]);

  useEffect(() => {
    if (!storedHallsLoaded || storedHallRows.length === 0 || appliedStoredMergeRef.current) return;
    const fromDb = buildManualGroupMapFromStoredSquads(storedHallRows);
    if (fromDb.size === 0) return;
    appliedStoredMergeRef.current = true;
    writeStoredAutoMerge(false);
    setAutoMerge(false);
    persistManualGroupMap(fromDb);
  }, [storedHallsLoaded, storedHallRows]);

  const submissionIdsKey = useMemo(
    () =>
      submissions
        .map((s) => s.id)
        .sort()
        .join('|'),
    [submissions]
  );

  useEffect(() => {
    if (!submissionIdsKey) return;
    setManualGroupMap((prev) => {
      const pruned = pruneManualGroupMap(
        prev,
        submissions.map((s) => s.id)
      );
      if (manualGroupMapsEqual(prev, pruned)) return prev;
      writeStoredManualGroups(pruned);
      return pruned;
    });
  }, [submissionIdsKey, submissions]);

  const toggleAutoMerge = () => {
    setAutoMerge((prev) => {
      const next = !prev;
      writeStoredAutoMerge(next);
      if (next) {
        writeStoredManualGroups(new Map());
        setManualGroupMap(new Map());
      }
      return next;
    });
  };

  const mergerEligible = useMemo(
    () => filterMergerEligibleSubmissions(submissions),
    [submissions]
  );

  const groups = useMemo(() => {
    if (autoMerge) {
      return computeAutoMergeGroups(mergerEligible);
    }
    return buildManualMergeGroups(submissions, manualGroupMap);
  }, [autoMerge, submissions, mergerEligible, manualGroupMap]);

  const seminarTeams = useMemo((): SeminarHallTeam[] => {
    return groups.map((g) => ({
      teamKey: g.submissionIds.slice().sort().join('|'),
      teamName: g.mergedTeamName,
      memberCount: g.members.filter((m) => (m.email || m.name || '').trim()).length || g.members.length,
      memberEmails: g.members.map((m) => m.email).filter(Boolean),
    }));
  }, [groups]);

  const teamNamesByKey = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const g of groups) {
      map.set(g.submissionIds.slice().sort().join('|'), g.teamNames);
    }
    return map;
  }, [groups]);

  const storedHallByKey = useMemo(() => storedHallMap(storedHallRows), [storedHallRows]);

  const hallAssignments = useMemo(() => {
    const halls = Array.from(selectedHalls);
    return resolveHallAssignments(seminarTeams, teamNamesByKey, storedHallByKey, halls);
  }, [seminarTeams, teamNamesByKey, storedHallByKey, selectedHalls]);

  const toggleHall = (hall: string) => {
    setSelectedHalls((prev) => {
      const next = new Set(prev);
      if (next.has(hall)) next.delete(hall);
      else next.add(hall);
      return next;
    });
  };

  const addCustomHall = () => {
    const h = customHall.trim().toUpperCase();
    if (!h) return;
    setSelectedHalls((prev) => new Set(prev).add(h));
    setCustomHall('');
  };

  const exportSeminarHallCsv = () => {
    const halls = Array.from(selectedHalls);
    if (halls.length === 0) {
      setHallMessage('Select at least one seminar hall (e.g. SH1, SH7).');
      return;
    }
    const rows = buildSeminarHallExportRows(seminarTeams, hallAssignments);
    const headers = ['seminar_hall', 'merged_team_name', 'team_size', 'member_emails', 'team_key'];
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        headers.map((h) => csvEscape(String(r[h as keyof typeof r] ?? ''))).join(',')
      ),
    ];
    downloadBlob(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `seminar-hall-assignments-${dateStamp()}.csv`
    );
    const source = storedHallRows.length > 0 ? 'DB seating' : 'computed';
    setHallMessage(`Exported ${rows.length} team row(s) (${source}, halls: ${halls.join(', ')}).`);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const packAllSquadsOfFour = () => {
    if (submissions.length === 0) return;
    setError(null);
    setPackMessage(null);
    if (autoMerge) {
      writeStoredAutoMerge(false);
      setAutoMerge(false);
    }
    const next = buildManualGroupMapAllSquadsOfFour(submissions);
    persistManualGroupMap(next);
    setSelected(new Set());
    const mergedTeams = new Set(next.values()).size;
    const rowsInGroups = next.size;
    setPackMessage(
      `Packed ${rowsInGroups} registration(s) into ${mergedTeams} manual squad group(s) (target 4 members). Export roster for ingest when ready.`
    );
  };

  const runManualMerge = () => {
    const ids = Array.from(selected);
    if (ids.length < 2) {
      setError('Select at least 2 teams to merge manually.');
      return;
    }
    setError(null);
    const next = applyManualMerge(manualGroupMap, ids, submissions);
    persistManualGroupMap(next);
    setSelected(new Set());
  };

  const unmergeGroup = (submissionIds: string[]) => {
    if (submissionIds.length < 2) return;
    setError(null);
    const next = applyManualUnmerge(manualGroupMap, submissionIds);
    persistManualGroupMap(next);
    setPreviewGroup(null);
  };

  const exportRows = (mode: 'full' | 'merged') =>
    buildMergerExportRows(submissions, groups, mode, hallAssignments);

  const exportCsv = (mode: 'full' | 'merged') => {
    const rows = exportRows(mode);
    const lines = [
      MERGER_EXPORT_HEADERS.join(','),
      ...rows.map((row) =>
        MERGER_EXPORT_HEADERS.map((h) => csvEscape(String(row[h] ?? ''))).join(',')
      ),
    ];
    downloadBlob(
      new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }),
      `team-merger-${mode}-${dateStamp()}.csv`
    );
  };

  const exportExcel = (mode: 'full' | 'merged') => {
    const rows = exportRows(mode);
    const sheet = XLSX.utils.json_to_sheet(rows, { header: [...MERGER_EXPORT_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, mode === 'full' ? 'All Teams' : 'Merged');
    XLSX.writeFile(wb, `team-merger-${mode}-${dateStamp()}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-app-accent" />
            Team Merger
          </h2>
          <p className="text-sm text-app-subtext mt-1 max-w-xl">
            All form registrations appear here. Auto merge only considers eligible teams (not full 4-member squads or squad opt-out No). Manual merge can combine any
            selection into one card named Team A X Team B.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={toggleAutoMerge}
            className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl border ${
              autoMerge
                ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : 'border-app-border hover:bg-app-hover'
            }`}
          >
            {autoMerge ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Automatic merge {autoMerge ? 'ON' : 'OFF'}
          </button>
          <button
            type="button"
            disabled={submissions.length === 0 || loading}
            onClick={packAllSquadsOfFour}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300 hover:bg-violet-500/15 disabled:opacity-50"
          >
            <GitMerge className="w-3.5 h-3.5" />
            Pack all → squads of 4
          </button>
          <button
            type="button"
            onClick={fetchSubmissions}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {!autoMerge && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-app-border bg-app-surface/50">
          <span className="text-xs text-app-subtext mr-1">Manual:</span>
          <button
            type="button"
            disabled={selected.size < 2}
            onClick={runManualMerge}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-app-accent text-app-bg disabled:opacity-50"
          >
            <GitMerge className="w-3.5 h-3.5" />
            Merge selected ({selected.size})
          </button>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="text-xs font-medium text-app-subtext hover:text-app-text px-2"
          >
            Clear selection
          </button>
        </div>
      )}

      {packMessage && (
        <div className="text-sm text-violet-600 dark:text-violet-400 bg-violet-500/10 border border-violet-500/25 rounded-xl px-4 py-3">
          {packMessage}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submissions.length === 0}
          onClick={() => exportCsv('full')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export roster for ingest (CSV)
        </button>
        <button
          type="button"
          disabled={submissions.length === 0}
          onClick={() => exportExcel('full')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export roster for ingest (Excel)
        </button>
        <button
          type="button"
          disabled={groups.length === 0}
          onClick={() => exportCsv('merged')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-app-accent text-app-bg disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export merged (CSV)
        </button>
        <button
          type="button"
          disabled={groups.length === 0}
          onClick={() => exportExcel('merged')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-app-accent/90 text-app-bg disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export merged (Excel)
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-app-subtext" />
        </div>
      ) : submissions.length === 0 ? (
        <p className="text-center text-sm text-app-subtext py-16">
          No form submissions yet.
          {excludedOptOutCount > 0
            ? ` (${excludedOptOutCount} team(s) opted out of squad assignment.)`
            : ''}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-mono text-app-subtext">
            {submissions.length} submission(s) · {mergerEligible.length} auto-merge eligible · {groups.length}{' '}
            group(s)
            {excludedOptOutCount > 0 ? ` · ${excludedOptOutCount} squad opt-out` : ''}
          </p>

          {groups.map((group) => (
            <article
              key={group.id}
              className={`rounded-2xl border overflow-hidden ${
                group.submissionIds.length > 1
                  ? 'border-emerald-500/35 bg-emerald-500/5'
                  : 'border-app-border bg-app-surface/60'
              }`}
            >
              <div className="px-4 py-3 border-b border-app-border/80 flex flex-wrap items-center justify-between gap-2 bg-app-bg/30">
                <div>
                  <h3 className="font-bold text-sm text-app-text">{group.mergedTeamName}</h3>
                  {group.submissionIds.length > 1 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {group.sourceTeams.map((src) => (
                        <span
                          key={src.submissionId}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/25"
                        >
                          {src.teamName}
                          <span className="font-mono opacity-70">
                            ({src.members.filter((m) => m.name?.trim() || m.enrollment_number?.trim()).length}{' '}
                            members)
                          </span>
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-app-subtext mt-1">{group.matchReason}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {!autoMerge && group.submissionIds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => unmergeGroup(group.submissionIds)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/15"
                      title="Split back into separate teams"
                    >
                      <GitBranch className="w-3.5 h-3.5" />
                      Unmerge
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setPreviewGroup(group)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-app-border hover:bg-app-hover"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Preview merge
                  </button>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {!autoMerge && (
                  <div className="flex flex-wrap gap-3">
                    {group.submissionIds.map((subId) => {
                      const sub = submissions.find((s) => s.id === subId);
                      if (!sub) return null;
                      return (
                        <label
                          key={subId}
                          className="inline-flex items-center gap-2 text-xs border border-app-border rounded-lg px-2.5 py-1.5"
                        >
                          <input
                            type="checkbox"
                            checked={selected.has(subId)}
                            onChange={() => toggleSelect(subId)}
                            className="rounded border-app-border"
                          />
                          <span className="font-semibold">{sub.team_name}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {group.submissionIds.length > 1 ? (
                  <div className="space-y-4">
                    <div>
                      <p className="text-[10px] font-mono uppercase text-app-subtext mb-2">
                        Combined squad (deduped, max {4} slots)
                      </p>
                      <MemberMiniTable members={group.members} />
                    </div>
                    <div className="border-t border-app-border/60 pt-3 space-y-4">
                      <p className="text-[10px] font-mono uppercase text-app-subtext">
                        All teams in this merge ({group.sourceTeams.length})
                      </p>
                      {group.sourceTeams.map((src) => (
                        <div
                          key={src.submissionId}
                          className="rounded-xl border border-app-border/80 bg-app-bg/40 px-3 py-2.5"
                        >
                          <h4 className="text-xs font-bold text-app-text mb-2">{src.teamName}</h4>
                          <MemberMiniTable members={src.members} />
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <MemberMiniTable members={group.members} />
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="p-5 rounded-2xl border border-indigo-500/30 bg-indigo-500/5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-app-text">Seminar hall assignment</h3>
          <p className="text-xs text-app-subtext mt-1">
            Seating is loaded from the <strong>database</strong> when available (PDF baseline). Unassigned squads use
            round-robin across selected halls. Merger CSV/Excel uses the same hall column.
          </p>
          {storedHallRows.length > 0 && (
            <p className="text-[11px] text-emerald-400/90 mt-1">
              {storedHallRows.length} squad(s) stored in DB — merge layout synced from saved seating.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_SEMINAR_HALLS.map((hall) => (
            <button
              key={hall}
              type="button"
              onClick={() => toggleHall(hall)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                selectedHalls.has(hall)
                  ? 'border-indigo-400 bg-indigo-500/20 text-indigo-200'
                  : 'border-app-border text-app-subtext hover:bg-app-hover'
              }`}
            >
              {hall}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            value={customHall}
            onChange={(e) => setCustomHall(e.target.value)}
            placeholder="Custom hall e.g. SH11"
            className="px-3 py-1.5 rounded-lg border border-app-border bg-app-surface text-xs w-36"
          />
          <button
            type="button"
            onClick={addCustomHall}
            className="px-3 py-1.5 rounded-lg text-xs border border-app-border hover:bg-app-hover"
          >
            Add hall
          </button>
          <button
            type="button"
            onClick={exportSeminarHallCsv}
            disabled={seminarTeams.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl bg-indigo-600 text-white disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export hall seating CSV
          </button>
        </div>
        {hallMessage && (
          <p className="text-xs text-indigo-300">{hallMessage}</p>
        )}
        {selectedHalls.size > 0 && seminarTeams.length > 0 && (
          <p className="text-[11px] text-app-subtext font-mono">
            Preview:{' '}
            {Array.from(selectedHalls)
              .sort()
              .map((h) => {
                const n = seminarTeams.filter((t) => hallAssignments.get(t.teamKey) === h).length;
                return `${h}=${n} teams`;
              })
              .join(' · ')}
          </p>
        )}
      </div>

      {previewGroup && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setPreviewGroup(null)}
        >
          <div
            className="max-w-lg w-full max-h-[85vh] overflow-y-auto rounded-2xl border border-app-border bg-app-surface shadow-2xl p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-1">{previewGroup.mergedTeamName}</h3>
            <p className="text-xs text-app-subtext mb-2">{previewGroup.matchReason}</p>
            {previewGroup.submissionIds.length > 1 && (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {previewGroup.sourceTeams.map((src) => (
                  <span
                    key={src.submissionId}
                    className="px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-500/15 border border-emerald-500/25"
                  >
                    {src.teamName}
                  </span>
                ))}
              </div>
            )}
            {previewGroup.submissionIds.length > 1 ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[10px] font-mono uppercase text-app-subtext mb-2">Combined squad</p>
                  <MemberMiniTable members={previewGroup.members} />
                </div>
                {previewGroup.sourceTeams.map((src) => (
                  <div key={src.submissionId} className="rounded-xl border border-app-border px-3 py-2">
                    <h4 className="text-xs font-bold mb-2">{src.teamName}</h4>
                    <MemberMiniTable members={src.members} />
                  </div>
                ))}
              </div>
            ) : (
              <MemberMiniTable members={previewGroup.members} />
            )}
            <div className="mt-5 flex flex-col sm:flex-row gap-2">
              {!autoMerge && previewGroup.submissionIds.length > 1 && (
                <button
                  type="button"
                  onClick={() => unmergeGroup(previewGroup.submissionIds)}
                  className="flex-1 py-2.5 rounded-xl border border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10 text-sm font-bold"
                >
                  Unmerge teams
                </button>
              )}
              <button
                type="button"
                onClick={() => setPreviewGroup(null)}
                className="flex-1 py-2.5 rounded-xl bg-app-accent text-app-bg text-sm font-bold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberMiniTable({ members }: { members: TeamMemberPayload[] }) {
  if (!members.length) {
    return <p className="text-xs text-app-subtext">No members listed.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-app-subtext">
            <th className="pr-2 py-1">#</th>
            <th className="pr-2 py-1">Name</th>
            <th className="pr-2 py-1">Enrollment</th>
            <th className="pr-2 py-1">Email</th>
            <th className="pr-2 py-1">Branch</th>
            <th className="py-1">Year</th>
          </tr>
        </thead>
        <tbody>
          {members.map((m, idx) => (
            <tr key={`${idx}-${m.slot}-${m.enrollment_number}-${m.email}`} className="border-t border-app-border/40">
              <td className="pr-2 py-1 font-mono">{m.slot}</td>
              <td className="pr-2 py-1">{m.name}</td>
              <td className="pr-2 py-1 font-mono">{m.enrollment_number}</td>
              <td className="pr-2 py-1">{m.email}</td>
              <td className="pr-2 py-1">{m.branch}</td>
              <td className="py-1">{m.year}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function dateStamp() {
  return new Date().toISOString().slice(0, 10);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}
