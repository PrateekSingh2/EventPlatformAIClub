'use client';

import React, { useState, useEffect, useRef } from 'react';
import { User } from '@/lib/types';
import { parseTeamCsv, ParsedTeamMember } from '@/lib/team-parser';
import {
  Mail,
  Send,
  Eye,
  Search,
  Copy,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
  Sparkles,
  Upload,
  AlertTriangle,
  X,
  FileText,
  Check,
  Radio,
  RotateCcw,
  Save,
} from 'lucide-react';

interface BrevoStudioTabProps {
  adminSecret: string;
}

type BatchRecipient = ParsedTeamMember;

export const DEFAULT_CLEAN_MINIMAL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Contest Access Token - AI Club</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      background-color: #0b0f19;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      color: #e2e8f0;
      -webkit-font-smoothing: antialiased;
    }
    .wrapper {
      width: 100%;
      table-layout: fixed;
      background-color: #0b0f19;
      padding: 40px 16px;
    }
    .card {
      max-width: 580px;
      margin: 0 auto;
      background-color: #111827;
      border: 1px solid #1f2937;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
    }
    .accent-bar {
      height: 4px;
      background: linear-gradient(90deg, #06b6d4 0%, #3b82f6 50%, #8b5cf6 100%);
    }
    .header {
      padding: 36px 36px 20px 36px;
      text-align: left;
    }
    .brand {
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 2.5px;
      text-transform: uppercase;
      color: #06b6d4;
    }
    .title {
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin: 8px 0 0 0;
      letter-spacing: -0.5px;
    }
    .content {
      padding: 10px 36px 36px 36px;
    }
    .greeting {
      font-size: 15px;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 12px;
    }
    .badge {
      display: inline-block;
      padding: 4px 10px;
      background-color: #1e293b;
      border: 1px solid #334155;
      border-radius: 8px;
      color: #38bdf8;
      font-size: 11px;
      font-weight: 700;
      font-family: 'Courier New', Courier, monospace;
      margin-bottom: 16px;
    }
    .paragraph {
      font-size: 14px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 0 0 24px 0;
    }
    .token-card {
      background: linear-gradient(180deg, #0f172a 0%, #030712 100%);
      border: 1px solid #334155;
      border-radius: 14px;
      padding: 24px 20px;
      text-align: center;
      margin-bottom: 24px;
    }
    .token-label {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #64748b;
      margin-bottom: 10px;
    }
    .token-code {
      display: inline-block;
      font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
      font-size: 26px;
      font-weight: 800;
      color: #22d3ee;
      letter-spacing: 4px;
      padding: 6px 16px;
      background: rgba(34, 211, 238, 0.08);
      border: 1px dashed rgba(34, 211, 238, 0.4);
      border-radius: 10px;
    }
    .token-subtext {
      font-size: 11px;
      color: #64748b;
      margin-top: 10px;
    }
    /* Team Roster Section */
    .team-card {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 14px;
      overflow: hidden;
      margin-bottom: 26px;
    }
    .team-header {
      padding: 12px 18px;
      background-color: #162032;
      border-bottom: 1px solid #1e293b;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .team-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: #38bdf8;
    }
    .team-badge {
      font-size: 10px;
      font-weight: 700;
      color: #94a3b8;
      font-family: 'SFMono-Regular', Consolas, monospace;
      background: #0b1120;
      padding: 3px 8px;
      border-radius: 6px;
      border: 1px solid #1e293b;
    }
    .roster-table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    .roster-table th {
      background-color: #0d1527;
      color: #64748b;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      padding: 10px 14px;
      border-bottom: 1px solid #1e293b;
    }
    .roster-table td {
      padding: 11px 14px;
      font-size: 13px;
      color: #cbd5e1;
    }
    .btn-container {
      text-align: center;
      margin-bottom: 28px;
    }
    .btn {
      display: inline-block;
      background: #06b6d4;
      color: #041019 !important;
      font-size: 13px;
      font-weight: 800;
      text-decoration: none;
      padding: 14px 34px;
      border-radius: 10px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      box-shadow: 0 4px 14px rgba(6, 182, 212, 0.35);
    }
    .rules {
      background-color: #0b1120;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 24px;
    }
    .rules-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #cbd5e1;
      margin-bottom: 8px;
    }
    .rule-item {
      font-size: 12px;
      line-height: 1.6;
      color: #94a3b8;
      margin: 6px 0;
    }
    .footer {
      border-top: 1px solid #1f2937;
      padding-top: 20px;
      text-align: center;
      font-size: 11px;
      color: #64748b;
      line-height: 1.5;
    }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="card">
      <div class="accent-bar"></div>
      
      <div class="header">
        <div class="brand">EventPlatform AI Club</div>
        <h1 class="title">Contest Arena Access Credentials</h1>
      </div>

      <div class="content">
        <div class="greeting">Hello {{name}},</div>
        <div class="badge">TEAM: {{team_name}} ({{team_size}})</div>
        
        <p class="paragraph">
          Your credentials for the upcoming live competition are ready. The contest features encrypted nested problem archives decompressed directly in browser memory under real-time telemetry surveillance.
        </p>

        <!-- Access Token Box -->
        <div class="token-card">
          <div class="token-label">Your Dedicated Arena Token</div>
          <div class="token-code">{{token}}</div>
          <div class="token-subtext">Shared access token for Team {{team_name}} &bull; Assigned to {{email}}</div>
        </div>

        <!-- Official Team Roster Table -->
        <div class="team-card">
          <div class="team-header">
            <span class="team-title">Official Team Roster</span>
            <span class="team-badge">{{team_name}} &bull; {{team_size}}</span>
          </div>
          <table class="roster-table" width="100%" cellpadding="0" cellspacing="0" border="0">
            <thead>
              <tr>
                <th style="width: 38px; text-align: center;">#</th>
                <th style="text-align: left;">Participant Name</th>
                <th style="text-align: left;">Email Address</th>
                <th style="text-align: center; width: 85px;">Role</th>
              </tr>
            </thead>
            <tbody>
              {{team_members_table}}
            </tbody>
          </table>
        </div>

        <!-- Call to Action -->
        <div class="btn-container">
          <a href="{{access_link}}" class="btn" target="_blank">Enter Contest Arena &rarr;</a>
        </div>

        <!-- Crucial Instructions -->
        <div class="rules">
          <div class="rules-title">Participant Directives & Security</div>
          <div class="rule-item">&bull; <strong>Confidentiality:</strong> Do not share this token outside your designated team.</div>
          <div class="rule-item">&bull; <strong>Anti-Cheat Active:</strong> Fullscreen mode is enforced; background tab switches and multi-monitor departures are logged.</div>
          <div class="rule-item">&bull; <strong>Direct Link:</strong> If the button above does not open, visit: <br><span style="color: #38bdf8; word-break: break-all;">{{access_link}}</span></div>
        </div>

        <div class="footer">
          EventPlatform AI Club &bull; High-Concurrency Contest System<br>
          Automated tournament notification. No reply necessary.
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

const STORAGE_KEY_TEMPLATE = 'brevo_studio_saved_template_v4';
const STORAGE_KEY_SUBJECT = 'brevo_studio_saved_subject_v4';

export function BrevoStudioTab({ adminSecret }: BrevoStudioTabProps) {
  const [participants, setParticipants] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Email Config State
  const [subject, setSubject] = useState('Your AI Club Contest Access Token - Team {{team_name}} ({{name}})');
  const [htmlTemplate, setHtmlTemplate] = useState(DEFAULT_CLEAN_MINIMAL_TEMPLATE);
  const [previewTab, setPreviewTab] = useState<'editor' | 'preview'>('preview');
  const [templateSavedNotice, setTemplateSavedNotice] = useState(false);

  // Test Email State (Powered directly by .env credentials)
  const [testEmailAddress, setTestEmailAddress] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Dispatch Progress State
  const [sending, setSending] = useState(false);
  const [progressResult, setProgressResult] = useState<{
    engine?: string;
    total: number;
    sent: number;
    failed: number;
    errors?: string[];
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Dedicated Queue Modal State & Search
  const [isQueueModalOpen, setIsQueueModalOpen] = useState(false);
  const [queueSearch, setQueueSearch] = useState('');
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // Batch Recipients Import Dialog State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [rawCsvInput, setRawCsvInput] = useState('');
  const [parsedRecipients, setParsedRecipients] = useState<BatchRecipient[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore saved template and subject from localStorage
  useEffect(() => {
    try {
      const savedTpl = localStorage.getItem(STORAGE_KEY_TEMPLATE);
      if (savedTpl) setHtmlTemplate(savedTpl);

      const savedSub = localStorage.getItem(STORAGE_KEY_SUBJECT);
      if (savedSub) setSubject(savedSub);
    } catch {}
  }, []);

  const handleSaveTemplate = () => {
    try {
      localStorage.setItem(STORAGE_KEY_TEMPLATE, htmlTemplate);
      localStorage.setItem(STORAGE_KEY_SUBJECT, subject);
      setTemplateSavedNotice(true);
      setTimeout(() => setTemplateSavedNotice(false), 2500);
    } catch {}
  };

  const handleResetTemplate = () => {
    if (window.confirm('Reset email template and subject to default clean minimal layout?')) {
      setHtmlTemplate(DEFAULT_CLEAN_MINIMAL_TEMPLATE);
      setSubject('Your AI Club Contest Access Token - Team {{team_name}} ({{name}})');
      try {
        localStorage.removeItem(STORAGE_KEY_TEMPLATE);
        localStorage.removeItem(STORAGE_KEY_SUBJECT);
      } catch {}
    }
  };

  const handleCopyToken = async (tok: string) => {
    try {
      await navigator.clipboard.writeText(tok);
      setCopiedToken(tok);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {}
  };

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

  // Handle parsing CSV text when input changes
  const handleCsvTextChange = (text: string) => {
    setRawCsvInput(text);
    if (!text.trim()) {
      setParsedRecipients([]);
      setParseErrors([]);
      return;
    }
    const result = parseTeamCsv(text);
    setParsedRecipients(result.members);
    setParseErrors(result.errors);
  };

  // Handle CSV file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        handleCsvTextChange(text);
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Save imported batch recipients into database
  const handleSaveBatchRecipients = async () => {
    if (parsedRecipients.length === 0) return;

    setSavingRecipients(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/admin/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          participants: parsedRecipients.map((r) => ({
            name: r.name,
            email: r.email,
            access_token: r.token,
            team_name: r.teamName,
            team_size: r.teamSize,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save recipients into participants directory');
      }

      await fetchUsers();

      setImportSuccessMsg(`Successfully imported ${parsedRecipients.length} participant(s) with exact assigned tokens!`);
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

  const handleDeleteParticipant = async (userId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from participants and Brevo recipients?`)) return;

    try {
      const res = await fetch('/api/admin/participants', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({ userId, adminSecret }),
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to delete participant');
    }
  };

  const handleClearAllParticipants = async () => {
    if (!window.confirm('Are you sure you want to delete ALL registered participants from the queue? This cannot be undone.')) {
      return;
    }

    try {
      const res = await fetch('/api/admin/participants', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret,
        },
        body: JSON.stringify({ all: true, adminSecret }),
      });
      if (res.ok) {
        await fetchUsers();
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to clear participants');
    }
  };

  // Send a test email using .env configuration directly
  const handleSendTestEmail = async () => {
    if (!testEmailAddress.trim() || !testEmailAddress.includes('@')) {
      alert('Please enter a valid email address to receive the test email.');
      return;
    }

    setSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/brevo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          subject: `[TEST PREVIEW] ${subject}`,
          htmlTemplate, // sends the currently edited template
          participants: [
            {
              name: 'Test Administrator',
              email: testEmailAddress.trim(),
              token: 'TEST-TOKEN-2026',
              team_name: 'Admin Test Squad',
              team_size: 'Duo',
              team_members: [
                { name: 'Test Administrator', email: testEmailAddress.trim() },
                { name: 'Co-Captain Teammate', email: 'teammate@example.com' },
              ],
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to send test email');
      }

      if (data.sent > 0) {
        setTestResult({
          success: true,
          message: `Test email sent successfully to ${testEmailAddress}! Brevo accepted the delivery via .env configuration.`,
        });
      } else {
        throw new Error(data.errors?.[0] || 'Transmission failed');
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Test email failed',
      });
    } finally {
      setSendingTest(false);
    }
  };

  // Dispatch Bulk Emails to All Enrolled Contestants
  const handleDispatch = async () => {
    if (participants.length === 0) {
      setErrorMessage('No registered participants found to dispatch emails to.');
      return;
    }

    const confirmSend = window.confirm(
      `Dispatch emails to all ${participants.length} contestants with their individual assigned tokens?`
    );
    if (!confirmSend) return;

    setSending(true);
    setProgressResult(null);
    setErrorMessage(null);

    // Save current template edits before dispatching
    handleSaveTemplate();

    try {
      // Build team roster map across all registered participants
      const teamRosterMap = new Map<string, Array<{ name: string; email: string }>>();
      participants.forEach((p) => {
        const teamKey = (p.team_name || p.name || 'Individual').trim().toLowerCase();
        if (!teamRosterMap.has(teamKey)) {
          teamRosterMap.set(teamKey, []);
        }
        const existing = teamRosterMap.get(teamKey)!;
        if (!existing.some((m) => m.email.toLowerCase() === p.email.toLowerCase())) {
          existing.push({ name: p.name, email: p.email });
        }
      });

      // Map each participant with their exact assigned token and full team roster
      const recipientPayload = participants.map((p) => {
        const teamKey = (p.team_name || p.name || 'Individual').trim().toLowerCase();
        const roster = teamRosterMap.get(teamKey) || [{ name: p.name, email: p.email }];
        return {
          name: p.name,
          email: p.email,
          token: p.access_token,
          team_name: p.team_name || p.name,
          team_size: p.team_size || (roster.length === 1 ? 'Solo' : roster.length === 2 ? 'Duo' : roster.length === 3 ? 'Trio' : 'Squad'),
          team_members: roster,
        };
      });

      const res = await fetch('/api/brevo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          subject, // exact subject from state
          htmlTemplate, // exact changed template from editor
          participants: recipientPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'SMTP/API dispatch failed');
      }
      if (!data.sent || data.sent < 1) {
        const detail = data.errors?.[0] || 'No messages were accepted by Brevo.';
        throw new Error(detail);
      }

      setProgressResult(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'Dispatch error occurred');
    } finally {
      setSending(false);
    }
  };

  const sampleTableRows = `
    <tr style="background-color: rgba(6, 182, 212, 0.08);">
      <td style="padding: 11px 14px; text-align: center; font-size: 11px; font-weight: 700; color: #06b6d4; border-bottom: 1px solid #1e293b;">1</td>
      <td style="padding: 11px 14px; font-size: 13px; font-weight: 600; color: #ffffff; border-bottom: 1px solid #1e293b;">
        Vanshika Panwar <span style="color: #22d3ee; font-size: 10px; font-weight: 700;">(Recipient)</span>
      </td>
      <td style="padding: 11px 14px; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #94a3b8; border-bottom: 1px solid #1e293b;">
        vanshika@example.com
      </td>
      <td style="padding: 11px 14px; text-align: center; border-bottom: 1px solid #1e293b;">
        <span style="display: inline-block; padding: 2px 8px; background: rgba(6, 182, 212, 0.15); border: 1px solid rgba(6, 182, 212, 0.4); border-radius: 6px; color: #22d3ee; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">YOU</span>
      </td>
    </tr>
    <tr style="background-color: transparent;">
      <td style="padding: 11px 14px; text-align: center; font-size: 11px; font-weight: 700; color: #64748b; border-bottom: none;">2</td>
      <td style="padding: 11px 14px; font-size: 13px; font-weight: 600; color: #f1f5f9; border-bottom: none;">
        Aarav Sharma
      </td>
      <td style="padding: 11px 14px; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #94a3b8; border-bottom: none;">
        aarav@example.com
      </td>
      <td style="padding: 11px 14px; text-align: center; border-bottom: none;">
        <span style="display: inline-block; padding: 2px 8px; background: #1e293b; border: 1px solid #334155; border-radius: 6px; color: #94a3b8; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">TEAMMATE</span>
      </td>
    </tr>
  `;

  // Sample data preview generator
  const sampleHtml = htmlTemplate
    .replace(/\{\{name\}\}/gi, 'Vanshika Panwar')
    .replace(/\{\{participant_name\}\}/gi, 'Vanshika Panwar')
    .replace(/\{\{team_name\}\}/gi, 'Bit by bit')
    .replace(/\{\{team\}\}/gi, 'Bit by bit')
    .replace(/\{\{team_size\}\}/gi, 'Duo')
    .replace(/\{\{token\}\}/gi, 'AI-2026-X94B')
    .replace(/\{\{access_token\}\}/gi, 'AI-2026-X94B')
    .replace(/\{\{email\}\}/gi, 'vanshika@example.com')
    .replace(/\{\{team_members_table\}\}/gi, sampleTableRows)
    .replace(/\{\{team_members_rows\}\}/gi, sampleTableRows)
    .replace(/\{\{members_table\}\}/gi, sampleTableRows)
    .replace(
      /\{\{access_link\}\}/gi,
      `${typeof window !== 'undefined' ? window.location.origin : ''}/arena?token=AI-2026-X94B`
    );

  const filteredQueue = participants.filter((p) => {
    if (!queueSearch.trim()) return true;
    const q = queueSearch.toLowerCase();
    return (
      p.name?.toLowerCase().includes(q) ||
      p.email?.toLowerCase().includes(q) ||
      p.team_name?.toLowerCase().includes(q) ||
      p.access_token?.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-app-text" />
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Brevo Studio Bulk Credentials Dispatcher
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Deliver individual access credentials directly to each contestant with their assigned tokens.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Brevo Connection Status from .env */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-sans text-emerald-400">
              <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
              <span>Brevo Active (.env) &bull; IP Whitelisting: Disabled</span>
            </div>

            {/* Total Recipients Count Pill */}
            <button
              onClick={() => setIsQueueModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-app-surface-raised hover:bg-app-hover border border-app-border text-xs font-sans text-app-text transition-colors cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-app-subtext" />
              <span>{participants.length} Recipient{participants.length === 1 ? '' : 's'}</span>
            </button>
          </div>
        </div>

        {/* Test Email Section (Directly using .env credentials) */}
        <div className="p-3.5 rounded-xl bg-app-surface-raised border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-1 items-center gap-2">
            <input
              type="email"
              value={testEmailAddress}
              onChange={(e) => setTestEmailAddress(e.target.value)}
              placeholder="Send test email to (e.g. admin@gmail.com)"
              className="w-full sm:w-80 px-3 py-1.5 text-xs text-app-text bg-app-bg border border-app-border rounded-lg focus:outline-none focus:border-zinc-400 font-sans outline-none min-h-[36px]"
            />
            <button
              onClick={handleSendTestEmail}
              disabled={sendingTest || !testEmailAddress}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-app-text hover:opacity-90 text-app-bg transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5 shrink-0 min-h-[36px]"
            >
              {sendingTest ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              <span>Send Test Email</span>
            </button>
          </div>

          <span className="text-[11px] text-slate-400 font-mono">
            Sends current edited template via .env Brevo API
          </span>
        </div>

        {testResult && (
          <div
            className={`p-2.5 rounded-lg text-xs font-sans flex items-center gap-2 animate-in fade-in duration-200 ${
              testResult.success
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
            }`}
          >
            {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
            <span>{testResult.message}</span>
          </div>
        )}

        {/* Action Buttons: Import CSV, Manage Queue, Dispatch */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-app-border">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-app-surface hover:bg-app-hover text-app-text border border-app-border transition-colors cursor-pointer min-h-[36px]"
            >
              <Upload className="w-3.5 h-3.5 text-app-subtext" />
              <span>Import Participants CSV</span>
            </button>

            <button
              onClick={() => setIsQueueModalOpen(true)}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-app-surface hover:bg-app-hover text-app-text border border-app-border transition-colors cursor-pointer min-h-[36px]"
            >
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Manage Tokens & Queue ({participants.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {templateSavedNotice && (
              <span className="text-xs text-emerald-400 font-mono flex items-center gap-1 animate-in fade-in duration-150">
                <Check className="w-3.5 h-3.5" /> Template Saved
              </span>
            )}

            <button
              onClick={handleSaveTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-app-surface hover:bg-app-hover text-app-text border border-app-border transition-colors cursor-pointer min-h-[36px]"
              title="Save template edits locally"
            >
              <Save className="w-3.5 h-3.5 text-slate-400" />
              <span>Save Template</span>
            </button>

            <button
              onClick={handleResetTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text border border-app-border transition-colors cursor-pointer min-h-[36px]"
              title="Reset to default clean template"
            >
              <RotateCcw className="w-3 h-3 text-slate-400" />
              <span>Reset</span>
            </button>

            <button
              onClick={handleDispatch}
              disabled={sending || participants.length === 0}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-app-text hover:opacity-90 text-app-bg transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed min-h-[38px]"
            >
              {sending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Dispatching Emails...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 text-slate-950" />
                  <span>Dispatch All ({participants.length})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Banner */}
        {progressResult && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs font-sans space-y-1 text-emerald-400 animate-in fade-in duration-200">
            <div className="flex items-center gap-2 font-bold text-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>Bulk Dispatch Completed via {progressResult.engine || 'Brevo'}</span>
            </div>
            <p className="text-[11px] text-slate-300">
              Total Queued: {progressResult.total} &bull; Successfully Sent:{' '}
              <span className="text-emerald-400 font-bold">{progressResult.sent}</span> &bull; Failed:{' '}
              <span className={progressResult.failed > 0 ? 'text-rose-400 font-bold' : 'text-slate-400'}>
                {progressResult.failed}
              </span>
            </p>
            {progressResult.errors && progressResult.errors.length > 0 && (
              <div className="mt-2 text-[10px] text-rose-300 bg-rose-950/40 p-2 rounded border border-rose-800/40">
                {progressResult.errors.map((err, i) => (
                  <div key={i}>&bull; {err}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs font-mono text-rose-300 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* Email Subject Line Configuration */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-2">
        <label className="block text-xs font-bold text-white uppercase tracking-wider">
          Email Subject Line
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="e.g. Your AI Club Contest Access Token - Team {{team_name}} ({{name}})"
          className="w-full px-3.5 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 font-sans outline-none transition-colors"
        />
        <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
          <span>Supported dynamic variables in subject:</span>
          <span className="font-mono text-app-text font-medium">
            <code>{'{{name}}'}</code>, <code>{'{{team_name}}'}</code>, <code>{'{{token}}'}</code>
          </span>
        </div>
      </div>

      {/* Editor & Preview Split Panel */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-app-border">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewTab('preview')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                previewTab === 'preview'
                  ? 'bg-app-text text-app-bg'
                  : 'text-app-subtext hover:text-app-text'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              Live HTML Preview
            </button>
            <button
              onClick={() => setPreviewTab('editor')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5 ${
                previewTab === 'editor'
                  ? 'bg-app-text text-app-bg'
                  : 'text-app-subtext hover:text-app-text'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Edit Template HTML
            </button>
          </div>

          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-400">
            <span>Template Variables:</span>
            <span className="text-app-text">
              <code>{'{{name}}'}</code>, <code>{'{{token}}'}</code>, <code>{'{{team_name}}'}</code>, <code>{'{{team_size}}'}</code>, <code>{'{{team_members_table}}'}</code>, <code>{'{{access_link}}'}</code>
            </span>
          </div>
        </div>

        {previewTab === 'editor' ? (
          <div className="space-y-2">
            <textarea
              rows={22}
              value={htmlTemplate}
              onChange={(e) => setHtmlTemplate(e.target.value)}
              placeholder="Paste or edit HTML email markup here..."
              className="w-full p-4 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 leading-relaxed"
            />
            <p className="text-[11px] text-slate-400">
              When dispatched, the exact edited HTML template above will be sent to all participants with their personalized tokens.
            </p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden border border-app-border bg-white p-4">
            <div
              className="w-full min-h-[480px] overflow-auto"
              dangerouslySetInnerHTML={{ __html: sampleHtml }}
            />
          </div>
        )}
      </div>

      {/* Recipients Queue Modal */}
      {isQueueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-4xl p-4 sm:p-6 rounded-2xl border border-app-border shadow-2xl space-y-4 text-left bg-app-surface flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-app-subtext" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Enrolled Contestants & Assigned Tokens ({participants.length})
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Each participant will receive an email containing their exact assigned token.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <input
                    type="text"
                    value={queueSearch}
                    onChange={(e) => setQueueSearch(e.target.value)}
                    placeholder="Search name or token..."
                    className="w-full px-2.5 py-1 text-xs text-white bg-app-bg border border-app-border rounded-lg focus:border-zinc-400 font-mono pl-7"
                  />
                  <Search className="w-3 h-3 text-slate-500 absolute left-2 top-2" />
                </div>

                <button
                  onClick={() => setIsQueueModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {participants.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No participants uploaded yet. Import participants via CSV to populate the queue.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto rounded-xl border border-app-border bg-app-surface">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-app-bg border-b border-app-border text-app-subtext sticky top-0 text-[10px] uppercase">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">Team</th>
                      <th className="p-2.5">Name</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">Assigned Token</th>
                      <th className="p-2.5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {filteredQueue.map((p, idx) => (
                      <tr key={p.id || idx} className="hover:bg-app-hover/30">
                        <td className="p-2.5 text-slate-500 text-[11px]">{idx + 1}</td>
                        <td className="p-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-app-surface border border-app-border text-app-text font-semibold text-[11px]">
                            {p.team_name || 'Solo'}
                          </span>
                        </td>
                        <td className="p-2.5 text-white font-semibold">{p.name}</td>
                        <td className="p-2.5 text-slate-300">{p.email}</td>
                        <td className="p-2.5">
                          <button
                            onClick={() => handleCopyToken(p.access_token)}
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-app-surface hover:bg-app-hover border border-app-border text-app-text font-semibold font-mono transition-colors cursor-pointer"
                            title="Click to copy token"
                          >
                            <span>{p.access_token}</span>
                            {copiedToken === p.access_token ? (
                              <Check className="w-3 h-3 text-emerald-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-slate-500" />
                            )}
                          </button>
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            onClick={() => handleDeleteParticipant(p.id, p.name)}
                            className="px-2 py-1 text-[10px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center justify-between pt-2 border-t border-app-border text-xs">
              {participants.length > 0 && (
                <button
                  onClick={handleClearAllParticipants}
                  className="text-rose-400 hover:text-rose-300 text-[11px] font-semibold cursor-pointer"
                >
                  Clear All ({participants.length}) Recipients
                </button>
              )}
              <button
                onClick={() => setIsQueueModalOpen(false)}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-white cursor-pointer ml-auto"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Batch Import Dialog */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-2xl p-4 sm:p-6 rounded-2xl border border-app-border shadow-2xl space-y-4 text-left bg-app-surface flex flex-col max-h-[85vh]">
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2">
                <Upload className="w-5 h-5 text-app-subtext" />
                <div>
                  <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                    Import Participants via CSV
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Supports columns: <code>name</code>, <code>email</code>, <code>token</code>, <code>team_name</code>, <code>team_size</code>.
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="file"
                  accept=".csv,.txt,.tsv"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-app-surface hover:bg-app-hover text-app-text border border-app-border transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <FileText className="w-3.5 h-3.5 text-app-subtext" />
                  <span>Choose CSV File</span>
                </button>
                <span className="text-[11px] text-slate-500">or paste CSV text directly below</span>
              </div>

              <textarea
                rows={7}
                value={rawCsvInput}
                onChange={(e) => handleCsvTextChange(e.target.value)}
                placeholder="team_name,team_size,name,email,token&#10;AlphaSquad,duo,Alice Smith,alice@example.com,AI-ALPHA-01&#10;AlphaSquad,duo,Bob Jones,bob@example.com,AI-ALPHA-01"
                className="w-full p-3 text-xs font-mono text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 leading-relaxed shadow-inner"
              />

              {parseErrors.length > 0 && (
                <div className="p-2 rounded-lg bg-rose-950/40 border border-rose-800/40 text-[11px] text-rose-300 font-mono">
                  {parseErrors.slice(0, 3).map((err, i) => (
                    <div key={i}>&bull; {err}</div>
                  ))}
                </div>
              )}

              {/* Preview of Parsed Recipients */}
              {parsedRecipients.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-300 flex items-center justify-between">
                    <span>Parsed Participants ({parsedRecipients.length})</span>
                    <span className="text-emerald-400 font-mono font-normal">
                      ✓ Tokens Assigned Accurately
                    </span>
                  </div>
                  <div className="max-h-36 overflow-y-auto rounded-lg border border-app-border bg-app-bg p-2 text-xs font-mono">
                    {parsedRecipients.map((r, i) => (
                      <div key={i} className="flex items-center justify-between py-0.5 border-b border-app-border/40 text-[11px]">
                        <span className="text-white font-semibold">{r.name} ({r.email})</span>
                        <span className="text-app-subtext font-bold">{r.token}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {importSuccessMsg && (
                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800/60 text-xs font-mono text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>{importSuccessMsg}</span>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-app-border">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveBatchRecipients}
                disabled={savingRecipients || parsedRecipients.length === 0}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-app-text hover:opacity-90 text-app-bg transition-opacity cursor-pointer disabled:opacity-50 min-h-[36px]"
              >
                {savingRecipients ? 'Saving...' : `Save ${parsedRecipients.length} Participants`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
