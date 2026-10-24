'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ClipboardList,
  Loader2,
  RefreshCw,
  Search,
  Download,
  AlertCircle,
} from 'lucide-react';
import type { TeamMemberPayload } from '@/lib/team-registration-form';

type SubmissionRow = {
  id: string;
  team_name: string;
  members: TeamMemberPayload[];
  created_at: string;
};

interface FormDataTabProps {
  adminSecret: string;
}

export function FormDataTab({ adminSecret }: FormDataTabProps) {
  const [submissions, setSubmissions] = useState<SubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);

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
      setSubmissions(data.submissions || []);
    } catch {
      setError('Network error while loading form data');
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  }, [adminSecret]);

  useEffect(() => {
    if (adminSecret) fetchSubmissions();
  }, [adminSecret, fetchSubmissions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return submissions;
    return submissions.filter((s) => {
      const blob = [
        s.team_name,
        ...((s.members || []) as TeamMemberPayload[]).flatMap((m) => [
          m.name,
          m.email,
          m.mobile,
          m.enrollment_number,
          m.branch,
          m.year,
        ]),
      ]
        .join(' ')
        .toLowerCase();
      return blob.includes(q);
    });
  }, [submissions, search]);

  const exportCsv = () => {
    const headers = [
      'team_name',
      'submitted_at',
      'member_slot',
      'name',
      'mobile',
      'enrollment_number',
      'email',
      'branch',
      'year',
    ];
    const lines = [headers.join(',')];

    for (const row of filtered) {
      const members = (row.members || []) as TeamMemberPayload[];
      if (members.length === 0) {
        lines.push(
          [csvEscape(row.team_name), csvEscape(row.created_at), '', '', '', '', '', '', ''].join(',')
        );
        continue;
      }
      for (const m of members) {
        lines.push(
          [
            csvEscape(row.team_name),
            csvEscape(row.created_at),
            String(m.slot ?? ''),
            csvEscape(m.name),
            csvEscape(m.mobile),
            csvEscape(m.enrollment_number),
            csvEscape(m.email),
            csvEscape(m.branch),
            csvEscape(m.year),
          ].join(',')
        );
      }
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team-registrations-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-app-accent" />
            Form Data
          </h2>
          <p className="text-sm text-app-subtext mt-1">
            Public team registration submissions ({filtered.length} shown)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchSubmissions}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-app-border hover:bg-app-hover"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-app-accent text-app-bg disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-app-subtext" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search team, email, enrollment…"
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-app-border bg-app-surface text-sm"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-rose-500 bg-rose-500/10 border border-rose-500/25 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16 text-app-subtext">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-sm text-app-subtext py-16">No submissions yet.</p>
      ) : (
        <div className="space-y-4">
          {filtered.map((row) => (
            <article
              key={row.id}
              className="rounded-2xl border border-app-border bg-app-surface/60 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-app-border flex flex-wrap items-center justify-between gap-2 bg-app-bg/30">
                <h3 className="font-bold text-app-text">{row.team_name}</h3>
                <time className="text-xs font-mono text-app-subtext">
                  {new Date(row.created_at).toLocaleString()}
                </time>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-app-subtext border-b border-app-border/80">
                      <th className="px-4 py-2 font-semibold">#</th>
                      <th className="px-4 py-2 font-semibold">Name</th>
                      <th className="px-4 py-2 font-semibold">Mobile</th>
                      <th className="px-4 py-2 font-semibold">Enrollment</th>
                      <th className="px-4 py-2 font-semibold">Email</th>
                      <th className="px-4 py-2 font-semibold">Branch</th>
                      <th className="px-4 py-2 font-semibold">Year</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((row.members || []) as TeamMemberPayload[]).map((m) => (
                      <tr key={`${row.id}-${m.slot}`} className="border-b border-app-border/50 last:border-0">
                        <td className="px-4 py-2.5 font-mono">{m.slot}</td>
                        <td className="px-4 py-2.5">{m.name}</td>
                        <td className="px-4 py-2.5 font-mono">{m.mobile}</td>
                        <td className="px-4 py-2.5 font-mono">{m.enrollment_number}</td>
                        <td className="px-4 py-2.5">{m.email}</td>
                        <td className="px-4 py-2.5">{m.branch}</td>
                        <td className="px-4 py-2.5">{m.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function csvEscape(value: string | undefined): string {
  const s = value ?? '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
