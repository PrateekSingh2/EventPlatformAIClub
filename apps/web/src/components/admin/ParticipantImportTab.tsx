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
  ExternalLink,
  ShieldCheck,
  AlertTriangle,
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

      const teamCount = result.teams.length;
      const memberCount = result.members.length;
      setStatusMessage({
        type: 'success',
        text: `Successfully imported ${memberCount} participant(s) across ${teamCount} team(s) with shared tokens!`,
      });
      setRawText('');
      fetchParticipants();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Import failed' });
    } finally {
      setImporting(false);
    }
  };

  // CSV File Upload Reader
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
  };

  // Copy Magic Link to Clipboard
  const handleCopyLink = async (token: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const magicLink = `${origin}/arena?token=${token}`;
    try {
      await navigator.clipboard.writeText(magicLink);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  // Export Roster to CSV
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
    <div className="space-y-6">
      {/* Import & Ingest Controls */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-cyan-400" />
              Team Roster Importer & Shared Token Generator
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Paste team CSV (format: <code>teamname, team size, member1 name, member1 email, [member2 name, member2 email...]</code>).
            </p>
          </div>

          <label className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl cursor-pointer transition-colors shrink-0">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            Upload CSV / TXT
            <input type="file" accept=".csv,.txt" onChange={handleFileUpload} className="hidden" />
          </label>
        </div>

        {/* Team Invariant Banner */}
        <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 text-cyan-300 text-[11px] flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-cyan-300">Team Invariants: </span>
            All members with the same <strong>teamname</strong> share the <strong>exact same token</strong>. Tokens are strictly restricted to the registered member emails. Blocking one team account automatically suspends all teammates.
          </div>
        </div>

        {statusMessage && (
          <div
            className={`flex items-center gap-2 p-3 text-xs font-medium rounded-xl border ${
              statusMessage.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        <textarea
          rows={5}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          placeholder={`Bit by bit,Duo,Vanshika panwar,26ai1va145@mitsgwl.ac.in,Indra,26IR1IN22@mitsgwl.ac.in\nrajeev sharma,Solo,rajeev sharma,25ec1ra49@mitsgwl.ac.in\nOrion,Squad,Jay Bhadoria,26ai1ja53@mitsgwl.ac.in,Kshitij Herode,26ai1ks64@mitsgwl.ac.in,HARSHVARDHAN ARYA,26ai1ha46@mitsgwl.ac.in,Mohit Rathore,26ai1mo53@mitsgwl.ac.in`}
          className="w-full p-3 text-xs font-mono text-slate-200 bg-slate-900 border border-slate-700/80 rounded-xl focus:outline-none focus:border-cyan-400 leading-relaxed"
        />

        <div className="flex justify-end">
          <button
            onClick={handleBulkImport}
            disabled={importing || !rawText.trim()}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
          >
            {importing ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating Team Tokens & Ingesting...
              </>
            ) : (
              <>
                <UserPlus className="w-3.5 h-3.5" />
                Ingest Teams & Generate Shared Tokens
              </>
            )}
          </button>
        </div>
      </div>

      {/* Participant Roster Table */}
      <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Registered Participants ({participants.length})
            </h3>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <div className="relative w-full sm:w-auto">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search team, name, email, token..."
                className="w-full sm:w-64 px-3 py-1.5 pl-8 text-xs text-white bg-slate-900 border border-slate-700 rounded-lg focus:border-cyan-400 font-mono"
              />
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            </div>

            <button
              onClick={handleExportCSV}
              disabled={participants.length === 0}
              className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg cursor-pointer transition-colors disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Team</th>
                <th className="px-4 py-3">Participant</th>
                <th className="px-4 py-3">Shared Access Token</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-950/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
                    Loading participants...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    No participants found.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr
                    key={user.id}
                    className={`transition-colors ${
                      user.is_disqualified || user.role === 'disqualified'
                        ? 'bg-rose-950/30 border-l-2 border-l-rose-500'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 font-semibold text-[11px]">
                          {user.team_name || 'Solo'}
                        </span>
                        {user.team_size && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            ({user.team_size})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-sans">
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        {user.name}
                        {(user.is_disqualified || user.role === 'disqualified') && (
                          <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-rose-950 border border-rose-600 text-rose-400 font-bold">
                            SUSPENDED
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 rounded text-[11px] font-bold">
                        {user.access_token}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">Stage {user.current_stage}</td>
                    <td className="px-4 py-3 text-cyan-400 font-bold">{user.total_score} PTS</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => handleCopyLink(user.access_token)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                        title="Copy direct magic link"
                      >
                        {copiedToken === user.access_token ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            Copy Link
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
