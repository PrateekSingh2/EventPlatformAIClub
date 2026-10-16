'use client';

import React, { useState, useEffect } from 'react';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { ContestStatus, Announcement, AnnouncementUrgency } from '@/lib/types';
import {
  Trophy,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  Send,
  Radio,
  AlertTriangle,
  RotateCcw,
  ExternalLink,
  Loader2,
  Megaphone,
  History,
  Shield,
  Sparkles,
} from 'lucide-react';

interface ContestLifecycleTabProps {
  adminSecret: string;
}

export function ContestLifecycleTab({ adminSecret }: ContestLifecycleTabProps) {
  const { contestState, loading, refresh } = useContestLifecycle();

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

  // Transition state
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const status = contestState?.status || 'DRAFT';

  // Fetch recent announcements
  const fetchAnnouncements = async () => {
    try {
      setLoadingHistory(true);
      const res = await fetch('/api/admin/broadcast', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.announcements) {
        setAnnouncements(data.announcements);
      }
    } catch {
      // Ignore
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchAnnouncements();
    }
  }, [adminSecret]);

  const handleTransition = async (targetStatus: ContestStatus) => {
    setTransitioning(true);
    setActionError(null);

    try {
      const res = await fetch('/api/contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
          adminSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to update contest status');
      }

      await refresh();
    } catch (err: any) {
      setActionError(err.message || 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

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
          message: broadcastMessage.trim(),
          urgency,
          adminSecret,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to broadcast announcement');
      }

      setBroadcastFeedback({
        type: 'success',
        text: 'Broadcast sent to all connected participants.',
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
    <div className="space-y-6">
      {/* Header Info */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl glass-panel border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Tournament Operations & Realtime Controls
          </h2>
          <p className="text-xs text-slate-400">
            Authoritative contest lifecycle state machine & real-time broadcast command center
          </p>
        </div>

        <a
          href="/arena?token=AX-DEMO-2026"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900/60 border border-cyan-500/30 text-cyan-300 text-xs font-semibold transition-all"
        >
          <span>Open Demo Arena</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {actionError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/50 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Lifecycle Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* DRAFT */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            status === 'DRAFT'
              ? 'bg-slate-900 border-cyan-500/60 shadow-neon-cyan ring-1 ring-cyan-500/40'
              : 'bg-slate-950/60 border-slate-800/80 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              STAGE 0
            </span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">DRAFT</h3>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Participants can login, but the arena is locked behind the &quot;Contest Starts in...&quot; countdown screen.
          </p>
          {status === 'DRAFT' ? (
            <button
              onClick={() => handleTransition('LIVE')}
              disabled={transitioning}
              className="w-full py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-neon-emerald transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Go LIVE Now</span>
            </button>
          ) : (
            <div className="text-[10px] font-mono text-slate-500 italic">Inactive</div>
          )}
        </div>

        {/* LIVE */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            status === 'LIVE'
              ? 'bg-slate-900 border-emerald-500/60 shadow-neon-emerald ring-1 ring-emerald-500/40'
              : 'bg-slate-950/60 border-slate-800/80 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-500/40">
              ACTIVE
            </span>
            <Play className="w-4 h-4 text-emerald-400 fill-emerald-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">LIVE</h3>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Normal gameplay active. Participants extract archives, submit solutions, and stream leaderboard updates.
          </p>
          {status === 'LIVE' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTransition('FROZEN')}
                disabled={transitioning}
                className="flex-1 py-2 px-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Pause className="w-3.5 h-3.5 fill-white" />
                <span>Freeze</span>
              </button>
              <button
                onClick={() => handleTransition('CONCLUDED')}
                disabled={transitioning}
                className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Conclude</span>
              </button>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-slate-500 italic">Inactive</div>
          )}
        </div>

        {/* FROZEN */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            status === 'FROZEN'
              ? 'bg-slate-900 border-amber-500/60 shadow-md ring-1 ring-amber-500/40'
              : 'bg-slate-950/60 border-slate-800/80 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-amber-950/60 text-amber-300 border border-amber-500/40">
              PAUSED
            </span>
            <Pause className="w-4 h-4 text-amber-400 fill-amber-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">FROZEN</h3>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Participant leaderboard frozen and submissions paused. Telemetry radar and monitoring remain active.
          </p>
          {status === 'FROZEN' ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleTransition('LIVE')}
                disabled={transitioning}
                className="flex-1 py-2 px-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-neon-emerald transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Resume</span>
              </button>
              <button
                onClick={() => handleTransition('CONCLUDED')}
                disabled={transitioning}
                className="flex-1 py-2 px-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Conclude</span>
              </button>
            </div>
          ) : (
            <div className="text-[10px] font-mono text-slate-500 italic">Inactive</div>
          )}
        </div>

        {/* CONCLUDED */}
        <div
          className={`p-5 rounded-2xl border transition-all ${
            status === 'CONCLUDED'
              ? 'bg-slate-900 border-purple-500/60 shadow-md ring-1 ring-purple-500/40'
              : 'bg-slate-950/60 border-slate-800/80 opacity-70'
          }`}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-500/40">
              TERMINAL
            </span>
            <CheckCircle2 className="w-4 h-4 text-purple-400" />
          </div>
          <h3 className="text-sm font-bold text-white mb-1">CONCLUDED</h3>
          <p className="text-[11px] text-slate-400 mb-4 leading-relaxed">
            Tournament finished. All submissions closed permanently. Final rankings published in read-only form.
          </p>
          {status === 'CONCLUDED' ? (
            <button
              onClick={() => handleTransition('DRAFT')}
              disabled={transitioning}
              className="w-full py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to DRAFT</span>
            </button>
          ) : (
            <div className="text-[10px] font-mono text-slate-500 italic">Inactive</div>
          )}
        </div>
      </div>

      {/* Broadcast Composer & History Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Broadcast Composer */}
        <div className="lg:col-span-2 p-6 rounded-2xl glass-panel border border-slate-800 space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Megaphone className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Broadcast Real-Time Announcement</h3>
              <p className="text-xs text-slate-400">
                Pushes an unclosable glowing banner to all ~200 connected contestant screens instantly
              </p>
            </div>
          </div>

          <form onSubmit={handleSendBroadcast} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Urgency Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setUrgency('info')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    urgency === 'info'
                      ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300 shadow-neon-cyan'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Info (Standard)
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('warning')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    urgency === 'warning'
                      ? 'bg-amber-950/80 border-amber-500 text-amber-300 shadow-md'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Warning (Freeze/Time)
                </button>
                <button
                  type="button"
                  onClick={() => setUrgency('critical')}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                    urgency === 'critical'
                      ? 'bg-rose-950/80 border-rose-500 text-rose-300 shadow-neon-rose'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  Critical (Rule Alert)
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Announcement Message
                </label>
                <span className="text-[10px] font-mono text-slate-500">
                  {broadcastMessage.length} / 500 characters
                </span>
              </div>
              <textarea
                value={broadcastMessage}
                onChange={(e) => setBroadcastMessage(e.target.value.slice(0, 500))}
                rows={3}
                placeholder="e.g. Hint for Stage 2 has been updated in your dataset; 15 minutes remaining!"
                className="w-full px-3.5 py-2.5 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400 focus:outline-none resize-none font-sans"
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
              className="flex items-center justify-center gap-2 w-full py-2.5 px-4 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-neon-cyan transition-all cursor-pointer disabled:opacity-50"
            >
              {sendingBroadcast ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Dispatching to Realtime Sockets...</span>
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  <span>Dispatch Real-Time Broadcast</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Right 1 Col: Recent Announcements History */}
        <div className="p-6 rounded-2xl glass-panel border border-slate-800 flex flex-col space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              Recent Broadcasts
            </h3>
            <button
              onClick={fetchAnnouncements}
              className="text-[10px] font-mono text-cyan-400 hover:underline cursor-pointer"
            >
              Refresh
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2.5 max-h-64">
            {loadingHistory ? (
              <div className="text-center py-6 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1 text-cyan-400" />
                Loading history...
              </div>
            ) : announcements.length === 0 ? (
              <p className="text-xs text-slate-500 italic text-center py-6">
                No previous announcements recorded.
              </p>
            ) : (
              announcements.map((ann) => (
                <div
                  key={ann.id}
                  className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1"
                >
                  <div className="flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                        ann.urgency === 'critical'
                          ? 'bg-rose-950 text-rose-300'
                          : ann.urgency === 'warning'
                          ? 'bg-amber-950 text-amber-300'
                          : 'bg-cyan-950 text-cyan-300'
                      }`}
                    >
                      {ann.urgency}
                    </span>
                    <span className="text-slate-500">
                      {new Date(ann.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 line-clamp-2">{ann.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
