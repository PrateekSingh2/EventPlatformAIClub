'use client';

import React, { useState, useEffect } from 'react';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { useAdminContestTransition } from '@/hooks/useAdminContestTransition';
import { ContestStatus, Announcement, AnnouncementUrgency } from '@/lib/types';
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Send,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Loader2,
  Megaphone,
  History,
} from 'lucide-react';

interface ContestLifecycleTabProps {
  adminSecret: string;
}

export function ContestLifecycleTab({ adminSecret }: ContestLifecycleTabProps) {
  const { contestState, loading, error: loadError, refresh } = useContestLifecycle();
  const { transitioning, actionError, setActionError, transitionTo } = useAdminContestTransition(
    adminSecret,
    refresh
  );

  // Announcement composer state
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [urgency, setUrgency] = useState<AnnouncementUrgency>('info');
  const [sendingBroadcast, setSendingBroadcast] = useState(false);
  const [broadcastFeedback, setBroadcastFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    targetStatus: ContestStatus;
    title: string;
    description: string;
  } | null>(null);

  const status = contestState?.status || 'DRAFT';
  const controlsDisabled = transitioning || loading || !adminSecret.trim();
  const bannerError = actionError || loadError;

  const requestTransition = (targetStatus: ContestStatus, title: string, description: string) => {
    setActionError(null);
    setConfirmModal({ targetStatus, title, description });
  };

  // Fetch recent announcements
  const fetchAnnouncements = async () => {
    if (!adminSecret.trim()) {
      setHistoryError('Sign in required to load broadcast history.');
      return;
    }
    try {
      setLoadingHistory(true);
      setHistoryError(null);
      const res = await fetch('/api/admin/broadcast', {
        headers: { 'x-admin-secret': adminSecret.trim() },
      });
      let data: { announcements?: Announcement[]; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response from server');
      }
      if (res.ok && data.announcements) {
        setAnnouncements(data.announcements);
      } else {
        setHistoryError(data.error || `Failed to load history (HTTP ${res.status})`);
      }
    } catch (err: unknown) {
      setHistoryError(err instanceof Error ? err.message : 'Failed to load broadcast history');
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchAnnouncements();
    }
  }, [adminSecret]);

  const handleSendBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;

    setSendingBroadcast(true);
    setBroadcastFeedback(null);

    try {
      const res = await fetch('/api/admin/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret: adminSecret.trim(),
          message: broadcastMessage.trim(),
          urgency,
        }),
      });

      let data: { success?: boolean; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error('Invalid response from server');
      }
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to dispatch broadcast');
      }

      setBroadcastFeedback({
        type: 'success',
        text: 'Announcement broadcasted successfully to all contestants.',
      });
      setBroadcastMessage('');
      fetchAnnouncements();
    } catch (err: any) {
      setBroadcastFeedback({
        type: 'error',
        text: err.message || 'Failed to send announcement',
      });
    } finally {
      setSendingBroadcast(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-6 rounded-2xl bg-app-surface border border-app-border shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <h2 className="text-base sm:text-lg font-bold text-app-text tracking-tight">
              Tournament Operations
            </h2>
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-app-muted text-app-subtext border border-app-border">
              Lifecycle
            </span>
          </div>
          <p className="text-xs text-app-subtext">
            Contest lifecycle state machine & real-time announcements.
          </p>
        </div>

        <a
          href="/arena?token=AX-DEMO-2026"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 rounded-xl bg-app-surface hover:bg-app-hover border border-app-border text-xs font-medium text-app-text transition-colors self-start sm:self-auto min-h-[38px]"
        >
          <span>Demo Arena</span>
          <ExternalLink className="w-3.5 h-3.5 text-app-subtext" />
        </a>
      </div>

      {bannerError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{bannerError}</span>
        </div>
      )}

      {loading && !contestState && (
        <div className="flex items-center gap-2 text-xs text-app-subtext px-1">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading tournament status…</span>
        </div>
      )}

      {/* Lifecycle Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* DRAFT */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
            status === 'DRAFT'
              ? 'bg-app-surface border-zinc-600 shadow-sm'
              : 'bg-app-surface/60 border-app-border opacity-70'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-app-muted text-app-subtext border border-app-border">
                STAGE 0
              </span>
              <Clock className="w-4 h-4 text-app-subtext" />
            </div>
            <h3 className="text-sm font-bold text-app-text mb-1">DRAFT</h3>
            <p className="text-[11px] text-app-subtext mb-4 leading-relaxed">
              Arena locked behind countdown. Participants cannot download challenges or submit answers.
            </p>
          </div>
          {status === 'DRAFT' ? (
            <button
              onClick={() =>
                requestTransition(
                  'LIVE',
                  'Start Contest (Live)',
                  'Unlocks the arena so teams can download archives and submit answers.'
                )
              }
              disabled={controlsDisabled}
              className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 min-h-[38px]"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Contest (Live)</span>
            </button>
          ) : (
            <div className="text-[11px] text-app-subtext/60 italic pt-2">Inactive</div>
          )}
        </div>

        {/* LIVE */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
            status === 'LIVE'
              ? 'bg-app-surface border-emerald-600/70 shadow-sm'
              : 'bg-app-surface/60 border-app-border opacity-70'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/60">
                ACTIVE
              </span>
              <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
            </div>
            <h3 className="text-sm font-bold text-app-text mb-1">LIVE</h3>
            <p className="text-[11px] text-app-subtext mb-4 leading-relaxed">
              Normal gameplay active. Contestants download stage archives, submit flags, and stream live standings.
            </p>
          </div>
          {status === 'LIVE' ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() =>
                  requestTransition(
                    'FROZEN',
                    'Freeze submissions',
                    'Pauses submissions and freezes the leaderboard until you resume.'
                  )
                }
                disabled={controlsDisabled}
                className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                <Pause className="w-3.5 h-3.5 fill-white" />
                <span>Freeze</span>
              </button>
              <button
                onClick={() =>
                  requestTransition(
                    'CONCLUDED',
                    'Conclude contest',
                    'Closes submissions permanently and publishes final standings.'
                  )
                }
                disabled={controlsDisabled}
                className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Conclude</span>
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-app-subtext/60 italic pt-2">Inactive</div>
          )}
        </div>

        {/* FROZEN */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
            status === 'FROZEN'
              ? 'bg-app-surface border-amber-600/70 shadow-sm'
              : 'bg-app-surface/60 border-app-border opacity-70'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-950/40 text-amber-300 border border-amber-800/60">
                PAUSED
              </span>
              <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <h3 className="text-sm font-bold text-app-text mb-1">FROZEN</h3>
            <p className="text-[11px] text-app-subtext mb-4 leading-relaxed">
              Participant leaderboard frozen and submissions paused. Monitoring telemetry remains active.
            </p>
          </div>
          {status === 'FROZEN' ? (
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() =>
                  requestTransition('LIVE', 'Resume contest', 'Re-enables submissions and live leaderboard updates.')
                }
                disabled={controlsDisabled}
                className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume</span>
              </button>
              <button
                onClick={() =>
                  requestTransition(
                    'CONCLUDED',
                    'Conclude contest',
                    'Closes submissions permanently and publishes final standings.'
                  )
                }
                disabled={controlsDisabled}
                className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition-colors flex items-center justify-center space-x-1 cursor-pointer disabled:opacity-50 min-h-[38px]"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Conclude</span>
              </button>
            </div>
          ) : (
            <div className="text-[11px] text-app-subtext/60 italic pt-2">Inactive</div>
          )}
        </div>

        {/* CONCLUDED */}
        <div
          className={`p-4 sm:p-5 rounded-2xl border transition-all flex flex-col justify-between ${
            status === 'CONCLUDED'
              ? 'bg-app-surface border-purple-600/70 shadow-sm'
              : 'bg-app-surface/60 border-app-border opacity-70'
          }`}
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/60">
                FINAL
              </span>
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
            </div>
            <h3 className="text-sm font-bold text-app-text mb-1">CONCLUDED</h3>
            <p className="text-[11px] text-app-subtext mb-4 leading-relaxed">
              Tournament finished. Submissions closed permanently. Final rankings published in read-only form.
            </p>
          </div>
          {status === 'CONCLUDED' ? (
            <button
              onClick={() =>
                requestTransition(
                  'DRAFT',
                  'Reset to draft',
                  'Returns to setup mode and locks the participant arena.'
                )
              }
              disabled={controlsDisabled}
              className="w-full py-2 px-3 rounded-xl bg-app-surface hover:bg-app-hover text-app-text border border-app-border text-xs font-medium transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50 min-h-[38px]"
            >
              <RotateCcw className="w-3.5 h-3.5 text-app-subtext" />
              <span>Reset to Draft</span>
            </button>
          ) : (
            <div className="text-[11px] text-app-subtext/60 italic pt-2">Inactive</div>
          )}
        </div>
      </div>

      {/* Broadcast Composer & History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Broadcast Composer */}
        <div className="lg:col-span-2 p-4 sm:p-6 rounded-2xl bg-app-surface border border-app-border space-y-4 shadow-xs">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-xl bg-app-hover border border-app-border flex items-center justify-center text-app-text shrink-0">
              <Megaphone className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-app-text">Broadcast Real-Time Announcement</h3>
              <p className="text-xs text-app-subtext">
                Instantly displays a notification banner to all connected contestants.
              </p>
            </div>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-app-text mb-1.5">
                Urgency Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUrgency('info')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[38px] ${
                    urgency === 'info'
                      ? 'bg-app-text text-app-bg border-app-text font-semibold'
                      : 'bg-app-bg border-app-border text-app-subtext hover:text-app-text'
                  }`}
                >
                  Standard (Info)
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('warning')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[38px] ${
                    urgency === 'warning'
                      ? 'bg-amber-500 text-slate-950 border-amber-500 font-semibold'
                      : 'bg-app-bg border-app-border text-app-subtext hover:text-app-text'
                  }`}
                >
                  Warning (Time)
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('critical')}
                  className={`py-2 px-2.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[38px] ${
                    urgency === 'critical'
                      ? 'bg-rose-500 text-white border-rose-500 font-semibold'
                      : 'bg-app-bg border-app-border text-app-subtext hover:text-app-text'
                  }`}
                >
                  Critical (Alert)
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-app-text">
                  Announcement Message
                </label>
                <span className="text-[10px] font-mono text-app-subtext">
                  {broadcastMessage.length} / 500
                </span>
              </div>
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. Stage 2 clarification posted; 15 minutes remaining!"
                className="w-full px-3 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:border-zinc-400 focus:outline-none resize-none font-sans transition-colors"
              />
            </div>

            {broadcastFeedback && (
              <p
                className={`text-xs font-medium ${
                  broadcastFeedback.type === 'success' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {broadcastFeedback.text}
              </p>
            )}

            <button
              type="submit"
              disabled={sendingBroadcast || !broadcastMessage.trim()}
              className="flex items-center justify-center space-x-2 w-full py-2.5 px-4 rounded-xl bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs transition-opacity cursor-pointer disabled:opacity-40 min-h-[42px]"
            >
              {sendingBroadcast ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Dispatching...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Dispatch Announcement</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right: Recent Broadcasts History */}
        <div className="p-4 sm:p-6 rounded-2xl bg-app-surface border border-app-border flex flex-col space-y-3.5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-app-text flex items-center space-x-2">
              <History className="w-4 h-4 text-app-subtext" />
              <span>Recent Broadcasts</span>
            </h3>
            <button
              onClick={fetchAnnouncements}
              className="text-[11px] text-app-subtext hover:text-app-text transition-colors cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 max-h-72">
            {loadingHistory ? (
              <div className="text-center py-6 text-xs text-app-subtext">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-app-subtext" />
                Loading history...
              </div>
            ) : historyError ? (
              <p className="text-xs text-rose-400 text-center py-6">{historyError}</p>
            ) : announcements.length === 0 ? (
              <p className="text-xs text-app-subtext italic text-center py-6">
                No previous announcements recorded.
              </p>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-3 rounded-xl bg-app-bg border border-app-border space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                        ann.urgency === 'critical'
                          ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                          : ann.urgency === 'warning'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/30'
                      }`}
                    >
                      {ann.urgency}
                    </span>
                    <span className="text-app-subtext">
                      {ann.created_at
                        ? new Date(ann.created_at).toLocaleString()
                        : '—'}
                    </span>
                  </div>
                  <p className="text-xs text-app-text line-clamp-2">{ann.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="w-full max-w-sm sm:max-w-md p-5 sm:p-6 bg-app-surface border border-app-border rounded-2xl shadow-xl space-y-4 text-left">
            <h3 className="text-sm font-bold text-app-text">{confirmModal.title}</h3>
            <p className="text-xs text-app-subtext leading-relaxed">{confirmModal.description}</p>
            <div className="p-3 rounded-xl bg-app-bg border border-app-border text-xs flex items-center justify-between">
              <span className="text-app-subtext">State transition</span>
              <span className="font-semibold text-app-text">
                {status} → {confirmModal.targetStatus}
              </span>
            </div>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={transitioning}
                className="px-3.5 py-2 text-xs font-medium text-app-subtext hover:text-app-text bg-app-hover rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await transitionTo(confirmModal.targetStatus);
                  if (ok) setConfirmModal(null);
                }}
                disabled={transitioning}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl disabled:opacity-50"
              >
                {transitioning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating…</span>
                  </>
                ) : (
                  <span>Confirm</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
