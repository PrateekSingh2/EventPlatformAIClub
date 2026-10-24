'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitMerge,
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
  buildManualMergeGroups,
  buildMergerExportRows,
  computeAutoMergeGroups,
  filterMergerEligibleSubmissions,
  MERGER_EXPORT_HEADERS,
  type MergeGroup,
  type TeamSubmission,
} from '@/lib/team-merger';

interface TeamMergerTabProps {
  adminSecret: string;
}

export function TeamMergerTab({ adminSecret }: TeamMergerTabProps) {
  const [submissions, setSubmissions] = useState<TeamSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoMerge, setAutoMerge] = useState(false);
  const [manualGroupMap, setManualGroupMap] = useState<Map<string, string>>(new Map());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [previewGroup, setPreviewGroup] = useState<MergeGroup | null>(null);

  const fetchSubmissions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/form-submissions', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load submissions');
        setSubmissions([]);
        return;
      }
      const all: TeamSubmission[] = data.submissions || [];
      setSubmissions(filterMergerEligibleSubmissions(all));
    } catch {
      setError('Network error while loading submissions');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    if (adminSecret) fetchSubmissions();
  }, [adminSecret, fetchSubmissions]);

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
    setManualGroupMap((prev) => applyManualMerge(prev, ids, submissions));
    setSelected(new Set());
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
            Only teams that answered Yes to a 4th assigned member appear here.             Auto merge pairs overlapping squads or two 2-member teams into one card named
            Team A X Team B. Exports use the same merged name.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoMerge((v) => !v)}
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
        <p className="text-center text-sm text-app-subtext py-16">No team merge submissions yet.</p>
      ) : (
        <div className="space-y-4">
          <p className="text-xs font-mono text-app-subtext">
            {submissions.length} submission(s) · {groups.length} group(s)
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
                    <p className="text-[11px] text-app-subtext mt-0.5">
                      Merged from: {group.teamNames.join(', ')}
                    </p>
                  )}
                  <p className="text-[11px] text-app-subtext mt-0.5">{group.matchReason}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewGroup(group)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-app-border hover:bg-app-hover"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview merge
                </button>
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
                <MemberMiniTable members={group.members} />
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
              <p className="text-xs text-app-subtext mb-4">
                Merged from: {previewGroup.teamNames.join(', ')}
              </p>
            )}
            <MemberMiniTable members={previewGroup.members} />
            <button
              type="button"
              onClick={() => setPreviewGroup(null)}
              className="mt-5 w-full py-2.5 rounded-xl bg-app-accent text-app-bg text-sm font-bold"
            >
              Close
            </button>
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
          {members.map((m) => (
            <tr key={`${m.slot}-${m.enrollment_number}-${m.email}`} className="border-t border-app-border/40">
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
