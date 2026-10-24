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
  const fetchGeneration = useRef(0);

  const fetchSubmissions = useCallback(async () => {
    const generation = ++fetchGeneration.current;
    try {
      setLoading(true);
      setError(null);
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
      setSubmissions(filterMergerEligibleSubmissions(all));
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

  const persistManualGroupMap = (next: Map<string, string>) => {
    writeStoredManualGroups(next);
    setManualGroupMap(next);
  };

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

  const groups = useMemo(() => {
    if (autoMerge) {
      return computeAutoMergeGroups(submissions);
    }
    return buildManualMergeGroups(submissions, manualGroupMap);
  }, [autoMerge, submissions, manualGroupMap]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    buildMergerExportRows(submissions, groups, mode);

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
            Teams that answered No to a 4th member are hidden; older submissions without the prompt are included. Auto merge pairs overlapping squads or two 2-member
            teams into one card named Team A X Team B.
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={submissions.length === 0}
          onClick={() => exportCsv('full')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
        >
          <Download className="w-3.5 h-3.5" />
          Export all (CSV)
        </button>
        <button
          type="button"
          disabled={submissions.length === 0}
          onClick={() => exportExcel('full')}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover disabled:opacity-50"
        >
          <FileSpreadsheet className="w-3.5 h-3.5" />
          Export all (Excel)
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
          No merger-eligible teams.
          {excludedOptOutCount > 0
            ? ` ${excludedOptOutCount} team(s) answered No to squad assignment.`
            : ' No form submissions yet.'}
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-mono text-app-subtext">
            {submissions.length} submission(s) · {groups.length} group(s)
            {excludedOptOutCount > 0 ? ` · ${excludedOptOutCount} hidden (squad opt-out)` : ''}
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
