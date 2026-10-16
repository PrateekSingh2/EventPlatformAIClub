'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';

interface BrevoStudioTabProps {
  adminSecret: string;
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
        1. Fullscreen mode is enforced throughout the entire session.<br>
        2. OS downloads are blocked. Files must be inspected in-browser.<br>
        3. Only the designated prompt file may be copied to clipboard.
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

  useEffect(() => {
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

    if (adminSecret) {
      fetchUsers();
    }
  }, [adminSecret]);

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
    .replace(/\{\{token\}\}/g, 'AX-9842-8319')
    .replace(
      /\{\{access_link\}\}/g,
      `${typeof window !== 'undefined' ? window.location.origin : ''}/arena?token=AX-9842-8319`
    );

  return (
    <div className="space-y-6">
      {/* Top Controls Bar */}
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
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

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300">
              <Users className="w-3.5 h-3.5 text-cyan-400" />
              <span>{participants.length} Recipient{participants.length === 1 ? '' : 's'}</span>
            </span>

            <button
              onClick={handleDispatch}
              disabled={sending || participants.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
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
      <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
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
    </div>
  );
}
