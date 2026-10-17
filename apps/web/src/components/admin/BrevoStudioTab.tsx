'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User } from '@/lib/types';
import {
  Mail,
  Send,
  Eye,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Sparkles,
  Upload,
  UserPlus,
  AlertTriangle,
  X,
  FileText,
  Check,
} from 'lucide-react';

interface BrevoStudioTabProps {
  adminSecret: string;
}

interface BatchRecipient {
  name: string;
  email: string;
  token: string;
}

const DEFAULT_CYBER_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Your AI Club Contest Arena Access</title>
  <style>
    body { margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f8fafc; }
    .container { max-width: 600px; margin: 40px auto; background-color: #0f172a; border: 1px solid #1e293b; border-radius: 16px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #090d16 0%, #1e1b4b 100%); padding: 36px 32px; border-bottom: 1px solid #1e293b; text-align: center; }
    .logo { color: #22d3ee; font-size: 20px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase; }
    .content { padding: 36px 32px; }
    .greeting { font-size: 18px; font-weight: 600; color: #ffffff; margin-bottom: 16px; }
    .lead { font-size: 14px; line-height: 1.6; color: #94a3b8; margin-bottom: 24px; }
    .token-box { background-color: #020617; border: 1px solid #334155; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .token-label { font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: #64748b; font-weight: 700; margin-bottom: 8px; }
    .token-value { font-family: 'Courier New', monospace; font-size: 24px; font-weight: 800; color: #22d3ee; letter-spacing: 4px; }
    .button { display: block; width: fit-content; margin: 28px auto; background: #22d3ee; color: #020617; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 32px; border-radius: 10px; text-transform: uppercase; letter-spacing: 1px; }
    .notice { font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #1e293b; padding-top: 20px; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">EventPlatform AI Club</div>
      <div style="color: #8b5cf6; font-size: 13px; font-weight: 600; margin-top: 6px;">Contest Arena Verification</div>
    </div>
    <div class="content">
      <div class="greeting">Greetings, {{name}}!</div>
      <div class="lead">
        You have been registered for the upcoming high-concurrency coding & AI archive challenge.
        All problem archives are stage-locked and decompressed directly in browser RAM under strict anti-cheat conditions.
      </div>
      
      <div class="token-box">
        <div class="token-label">Your Unique Participant Access Token</div>
        <div class="token-value">{{token}}</div>
      </div>

      <a href="{{access_link}}" class="button" target="_blank">Enter Contest Arena</a>

      <div class="notice">
        <strong>Important Anti-Cheat Invariants:</strong><br>
        1. One token is strictly valid for ONE account ID only. Do not share your token.<br>
        2. Fullscreen mode is enforced throughout the entire session.<br>
        3. OS downloads are blocked. Files must be inspected in-browser.<br>
        4. Only the designated prompt file may be copied to clipboard.
      </div>
    </div>
  </div>
</body>
</html>`;

export function BrevoStudioTab({ adminSecret }: BrevoStudioTabProps) {
  const [participants, setParticipants] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Email Config State
  const [subject, setSubject] = useState('Your AI Club Contest Arena Access Token ({{name}})');
  const [htmlTemplate, setHtmlTemplate] = useState(DEFAULT_CYBER_EMAIL_TEMPLATE);
  const [previewTab, setPreviewTab] = useState<'editor' | 'preview'>('preview');

  // Dispatch Progress State
  const [sending, setSending] = useState(false);
  const [progressResult, setProgressResult] = useState<{
    total: number;
    sent: number;
    failed: number;
    errors?: string[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Batch Recipients Import Dialog State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [rawCsvInput, setRawCsvInput] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<BatchRecipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchUsers = async () => {
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
      fetchUsers();
    }
  }, [adminSecret]);

  // Parse CSV text into 3 columns: name, email, token
  const parseCsvText = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const valid: BatchRecipient[] = [];
    const errors: string[] = [];

    lines.forEach((line, idx) => {
      // Check if it's header line
      if (idx === 0 && line.toLowerCase().includes('email') && line.toLowerCase().includes('token')) {
        return;
      }

      // Split by comma or semicolon or tab
      const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length < 3) {
        errors.push(`Line ${idx + 1}: Expected 3 columns (name, email, token), found ${parts.length}.`);
        return;
      }

      const name = parts[0];
      const email = parts[1].toLowerCase();
      const token = parts[2].toUpperCase();

      if (!name) {
        errors.push(`Line ${idx + 1}: Name is empty.`);
        return;
      }
      if (!email.includes('@') || !email.includes('.')) {
        errors.push(`Line ${idx + 1}: Invalid email address '${email}'.`);
        return;
      }
      if (!token) {
        errors.push(`Line ${idx + 1}: Token is empty.`);
        return;
      }

      valid.push({ name, email, token });
    });

    setParsedRecipients(valid);
    setParseErrors(errors);
  };

  const handleRawTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawCsvInput(val);
    parseCsvText(val);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      setRawCsvInput(content);
      parseCsvText(content);
    };
    reader.readAsText(file);
  };

  // Submit parsed batch recipients to state & database
  const handleCommitBatchImport = async () => {
    if (parsedRecipients.length === 0) return;

    setSavingRecipients(true);
    setErrorMessage(null);

    try {
      // Register participants in the database
      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          participants: parsedRecipients.map((r) => ({
            name: r.name,
            email: r.email,
            access_token: r.token,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save recipients into participants directory');
      }

      // Convert parsed recipients to User objects
      const newUsers: User[] = parsedRecipients.map((r, i) => ({
        id: `batch-${Date.now()}-${i}`,
        name: r.name,
        email: r.email,
        role: 'participant',
        access_token: r.token,
        total_score: 0,
        current_stage: 1,
        is_flagged: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }));

      // Merge avoiding duplicate emails
      setParticipants((prev) => {
        const emailMap = new Map<string, User>();
        newUsers.forEach((u) => emailMap.set(u.email, u));
        prev.forEach((u) => {
          if (!emailMap.has(u.email)) {
            emailMap.set(u.email, u);
          }
        });
        return Array.from(emailMap.values());
      });

      setImportSuccessMsg(`Successfully imported ${parsedRecipients.length} batch recipient(s) with unique tokens!`);
      setTimeout(() => {
        setIsImportModalOpen(false);
        setRawCsvInput('');
        setParsedRecipients([]);
        setParseErrors([]);
        setImportSuccessMsg(null);
      }, 1200);
    } catch (err: any) {
      setErrorMessage(err.message || 'Batch import failed');
    } finally {
      setSavingRecipients(false);
    }
  };

  const handleDispatch = async () => {
    if (participants.length === 0) {
      setErrorMessage('No registered participants found to dispatch emails to.');
      return;
    }

    const confirmSend = window.confirm(
      `Are you sure you want to dispatch bulk emails to ${participants.length} participants using Brevo pooled SMTP?`
    );
    if (!confirmSend) return;

    setSending(true);
    setProgressResult(null);
    setErrorMessage(null);

    try {
      const recipientPayload = participants.map((p) => ({
        name: p.name,
        email: p.email,
        token: p.access_token,
      }));

      const res = await fetch('/api/brevo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          subject,
          htmlTemplate,
          participants: recipientPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'SMTP dispatch failed');
      }

      setProgressResult(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Dispatch error occurred');
    } finally {
      setSending(false);
    }
  };

  // Generate live sample preview
  const sampleHtml = htmlTemplate
    .replace(/\{\{name\}\}/g, 'Sarah Connor')
    .replace(/\{\{token\}\}/g, 'AX-DEMO-2026')
    .replace(
      /\{\{access_link\}\}/g,
      `${typeof window !== 'undefined' ? window.location.origin : ''}/arena?token=AX-DEMO-2026`
    );

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Mail className="w-4 h-4 text-cyan-400" />
              Brevo Pooled SMTP Bulk Mailer Studio
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              High-throughput pooled connection with chunked batches (25/sec) executing within Netlify 10s ceiling.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>{participants.length} Recipient{participants.length === 1 ? '' : 's'}</span>
            </span>

            {/* Batch Recipient Import Button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl transition-all cursor-pointer shadow-xs"
              title="Add users to the list via comma-separated text or CSV upload"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add / Import Recipients</span>
            </button>

            <button
              onClick={handleDispatch}
              disabled={sending || participants.length === 0}
              className="flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
            >
              {sending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Dispatching Batches...
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  Dispatch Bulk Emails via Brevo
                </>
              )}
            </button>
          </div>
        </div>

        {/* Progress or Error Feedback */}
        {progressResult && (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 space-y-1 text-xs">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              SMTP Bulk Dispatch Completed!
            </div>
            <div className="font-mono">
              Total: {progressResult.total} &bull; Sent: {progressResult.sent} &bull; Failed: {progressResult.failed}
            </div>
            {progressResult.errors && progressResult.errors.length > 0 && (
              <div className="text-[11px] text-rose-300 font-mono mt-2 space-y-0.5">
                {progressResult.errors.map((err, i) => (
                  <div key={i}>&bull; {err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="flex items-center gap-2 p-3 text-xs font-medium text-rose-300 bg-rose-950/60 border border-rose-500/50 rounded-xl">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Subject Line */}
        <div>
          <label className="block text-xs font-semibold text-slate-300 mb-1">
            Email Subject Line (supports <code>{'{{name}}'}</code>)
          </label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="w-full px-3 py-2 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400 font-mono"
          />
        </div>
      </div>

      {/* Editor & Preview Split View */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewTab('preview')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                previewTab === 'preview'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live HTML Preview
            </button>
            <button
              onClick={() => setPreviewTab('editor')}
              className={`px-3 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                previewTab === 'editor'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Edit Template HTML
            </button>
          </div>

          <span className="text-[10px] font-mono text-slate-400">
            Variables: <code>{'{{name}}'}</code>, <code>{'{{token}}'}</code>, <code>{'{{access_link}}'}</code>
          </span>
        </div>

        {previewTab === 'editor' ? (
          <textarea
            rows={18}
            value={htmlTemplate}
            onChange={(e) => setHtmlTemplate(e.target.value)}
            className="w-full p-4 text-xs font-mono text-cyan-200 bg-slate-950 border border-slate-800 rounded-xl focus:outline-none focus:border-cyan-400 leading-relaxed"
          />
        ) : (
          <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-950 p-4">
            <div
              className="w-full min-h-[450px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: sampleHtml }}
            />
          </div>
        )}
      </div>

      {/* =========================================================================
          BATCH RECIPIENTS IMPORT DIALOG MODAL
         ========================================================================= */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90vh] flex flex-col text-left">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white tracking-wide">
                    Import Batch Recipients for Brevo SMTP
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Add contestants with distinct tokens via comma-separated format or CSV upload
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* CRITICAL ACTIVATION INSTRUCTION BANNER */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs shrink-0 space-y-1">
              <div className="flex items-center space-x-2 font-bold text-[12px] text-amber-400">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>CRITICAL TOKEN ACTIVATION POLICY:</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed pl-6">
                <strong>One token is strictly valid for ONE account ID only.</strong> Do not attempt to use this token across multiple accounts. The first account activating this token will have exclusive, permanent access to this platform.
              </p>
            </div>

            {/* Input Options (Upload or Direct Text) */}
            <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 text-xs">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-slate-200">
                  Recipient Records (3 columns: <code>name, email, token</code>):
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".csv,.txt"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    <Upload className="w-3 h-3" />
                    <span>Upload CSV / TXT</span>
                  </button>
                </div>
              </div>

              <textarea
                rows={6}
                value={rawCsvInput}
                onChange={handleRawTextChange}
                placeholder={`Name, Email, Token\nJohn Doe, john@example.com, AX-DEMO-2026\nSarah Connor, sarah@cyber.org, BC-NODE-4921\nMarcus Vance, marcus@berkeley.edu, KZ-HACK-8012`}
                className="w-full p-3 font-mono text-xs bg-slate-950 border border-slate-800 rounded-2xl text-cyan-300 focus:outline-none focus:border-cyan-400 leading-relaxed"
              />

              {/* Parsing Feedback & Validation Table */}
              {parseErrors.length > 0 && (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] space-y-0.5">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-3 h-3 text-rose-400" />
                    <span>Parsing Warnings:</span>
                  </div>
                  {parseErrors.slice(0, 3).map((err, i) => (
                    <div key={i} className="pl-4 font-mono">&bull; {err}</div>
                  ))}
                </div>
              )}

              {parsedRecipients.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>Parsed Recipients ({parsedRecipients.length} valid):</span>
                    <span className="text-emerald-400 font-mono flex items-center gap-1">
                      <Check className="w-3 h-3" /> Ready for Brevo queue
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-xl border border-slate-800 bg-slate-950">
                    <table className="w-full text-left text-[11px] font-mono">
                      <thead className="bg-slate-900 border-b border-slate-800 text-slate-400 sticky top-0">
                        <tr>
                          <th className="p-2">Name</th>
                          <th className="p-2">Email</th>
                          <th className="p-2">Unique Token</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {parsedRecipients.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-900/40">
                            <td className="p-2 text-slate-200">{r.name}</td>
                            <td className="p-2 text-slate-300">{r.email}</td>
                            <td className="p-2 text-cyan-400 font-bold">{r.token}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {importSuccessMsg && (
                <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end space-x-2 pt-3 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCommitBatchImport}
                disabled={parsedRecipients.length === 0 || savingRecipients}
                className="flex items-center space-x-1.5 px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 transition-all shadow-neon-cyan cursor-pointer"
              >
                {savingRecipients ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Importing & Syncing...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Import {parsedRecipients.length} Recipient(s)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
