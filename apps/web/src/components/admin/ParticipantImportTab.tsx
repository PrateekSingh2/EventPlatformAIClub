'use client';

import React, { useState, useEffect } from 'react';
import { User } from '@/lib/types';
import { parseTeamCsv } from '@/lib/team-parser';
import {
  Users,
  Upload,
  UserPlus,
  Copy,
  Check,
  Download,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ShieldCheck,
} from 'lucide-react';

interface ParticipantImportTabProps {
  adminSecret: string;
}

export function ParticipantImportTab({ adminSecret }: ParticipantImportTabProps) {
  const [participants, setParticipants] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Bulk input state
  const [rawText, setRawText] = useState('');
  const [importing, setImporting] = useState(false);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const fetchParticipants = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/participants', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.participants) {
        setParticipants(data.participants);
      }
    } catch (err) {
      console.error('Failed to load participants', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchParticipants();
    }
  }, [adminSecret]);

  // Parse raw text or CSV using team-aware parser
  const handleBulkImport = async () => {
    if (!rawText.trim()) {
      setStatusMessage({ type: 'error', text: 'Please enter or paste participant data.' });
      return;
    }

    const result = parseTeamCsv(rawText);
    if (result.members.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'Could not extract valid participant records from the input.',
      });
      return;
    }

    setImporting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          participants: result.members.map((m) => ({
            name: m.name,
            email: m.email,
            access_token: m.token,
            team_name: m.teamName,
            team_size: m.teamSize,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Participant import failed');
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully ingested ${data.count} participants across ${result.teams.length} teams.`,
      });
      setRawText('');
      fetchParticipants();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Import failed.' });
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawText(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleCopyLink = (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const magicLink = `${origin}/arena?token=${token}`;
    navigator.clipboard.writeText(magicLink);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleExportCSV = () => {
    if (participants.length === 0) return;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const headers = 'Team Name,Team Size,Name,Email,Access Token,Magic Link,Current Stage,Total Score,Status\n';
    const rows = participants
      .map(
        (p) =>
          `"${p.team_name || 'Solo'}","${p.team_size || 'Solo'}","${p.name}","${p.email}","${p.access_token}","${origin}/arena?token=${p.access_token}",${p.current_stage},${p.total_score},"${p.is_disqualified ? 'DISQUALIFIED' : 'ACTIVE'}"`
      )
      .join('\n');

    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eventplatform_participants_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = participants.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.email.toLowerCase().includes(search.toLowerCase()) ||
      p.access_token.toLowerCase().includes(search.toLowerCase()) ||
      (p.team_name && p.team_name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      {/* Import & Ingest Controls */}
      <div className="p-4 sm:p-6 rounded-2xl bg-app-surface border border-app-border space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h3 className="text-sm font-bold text-app-text flex items-center space-x-2">
              <UserPlus className="w-4 h-4 text-app-subtext" />
              <span>Team Roster Importer & Token Provisioning</span>
            </h3>
            <p className="text-xs text-app-subtext">
              Paste team CSV (format: <code>teamname, team size, member1 name, member1 email, ...</code>).
            </p>
          </div>

          <label className="self-start sm:self-auto flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-app-text bg-app-surface hover:bg-app-hover border border-app-border rounded-xl cursor-pointer transition-colors shrink-0 min-h-[38px]">
            <Upload className="w-3.5 h-3.5 text-app-subtext" />
            <span>Upload CSV</span>
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Team Invariant Banner */}
        <div className="p-3 rounded-xl bg-app-bg border border-app-border text-app-subtext text-xs flex items-start space-x-2.5">
          <ShieldCheck className="w-4 h-4 text-app-text shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <strong className="text-app-text">Team Rules: </strong>
            Members with the same team name share a single access token. Tokens are restricted to registered member emails.
          </div>
        </div>

        {statusMessage && (
          <div
            className={`flex items-center space-x-2 p-3 text-xs font-medium rounded-xl border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <textarea
          rows={4}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`Team Alpha,Duo,Alice,alice@example.com,Bob,bob@example.com\nTeam Beta,Solo,Charlie,charlie@example.com`}
          className="w-full p-3 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 leading-relaxed transition-colors"
        />

        <div className="flex justify-end">
          <button
            onClick={handleBulkImport}
            disabled={importing || !rawText.trim()}
            className="w-full sm:w-auto flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-semibold text-app-bg bg-app-text hover:opacity-90 rounded-xl transition-opacity cursor-pointer disabled:opacity-40 min-h-[40px]"
          >
            {importing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Ingesting Roster...</span>
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                <span>Ingest Teams & Provision Tokens</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Participant Roster Table */}
      <div className="p-4 sm:p-6 rounded-2xl bg-app-surface border border-app-border space-y-4 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-app-subtext" />
            <h3 className="text-sm font-bold text-app-text">
              Registered Participants ({participants.length})
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-64">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team, name, token..."
                className="w-full px-3 py-1.5 pl-8 text-xs text-app-text bg-app-bg border border-app-border rounded-lg focus:outline-none focus:border-zinc-400 font-sans"
              />
              <Search className="w-3.5 h-3.5 text-app-subtext absolute left-2.5 top-1/2 -translate-y-1/2" />
            </div>

            <button
              onClick={handleExportCSV}
              disabled={participants.length === 0}
              className="flex items-center justify-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-app-text bg-app-surface hover:bg-app-hover border border-app-border rounded-lg cursor-pointer transition-colors disabled:opacity-50 min-h-[36px]"
            >
              <Download className="w-3.5 h-3.5 text-app-subtext" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-app-border">
          <table className="w-full text-left text-xs font-sans">
            <thead className="bg-app-bg text-app-subtext uppercase text-[10px] tracking-wider border-b border-app-border font-medium">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Participant</th>
                <th className="px-4 py-3 font-mono">Token</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border bg-app-surface">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-app-subtext">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-app-text" />
                    Loading participants...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-app-subtext">
                    No participants found.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className={`transition-colors hover:bg-app-hover/40 ${
                      user.is_disqualified || user.role === 'disqualified'
                        ? 'bg-rose-500/5'
                        : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center space-x-1.5">
                        <span className="px-2 py-0.5 rounded bg-app-muted border border-app-border text-app-text font-semibold text-[11px]">
                          {user.team_name || 'Solo'}
                        </span>
                        {user.team_size && (
                          <span className="text-[10px] text-app-subtext font-mono">
                            ({user.team_size})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-app-text flex items-center space-x-1.5">
                        <span>{user.name}</span>
                        {(user.is_disqualified || user.role === 'disqualified') && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-500/15 border border-rose-500/30 text-rose-400 font-bold">
                            SUSPENDED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-app-subtext font-mono mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 bg-app-bg text-app-text border border-app-border rounded text-[11px] font-mono font-medium">
                        {user.access_token}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-app-subtext text-xs">Stage {user.current_stage}</td>
                    <td className="px-4 py-3 text-app-text font-bold font-mono">{user.total_score} PTS</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleCopyLink(user.access_token)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium text-app-text bg-app-surface hover:bg-app-hover rounded-lg border border-app-border transition-colors cursor-pointer min-h-[30px]"
                        title="Copy direct link"
                      >
                        {copiedToken === user.access_token ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3 text-app-subtext" />
                            <span>Link</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
