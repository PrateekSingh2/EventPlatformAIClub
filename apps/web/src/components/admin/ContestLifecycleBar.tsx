'use client';

import React, { useState } from 'react';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { ContestStatus } from '@/lib/types';
import {
  Shield,
  Play,
  Pause,
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCcw,
  Loader2,
  Radio,
} from 'lucide-react';

interface ContestLifecycleBarProps {
  adminSecret: string;
}

export function ContestLifecycleBar({ adminSecret }: ContestLifecycleBarProps) {
  const { contestState, loading, refresh } = useContestLifecycle();
  const [transitioning, setTransitioning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    targetStatus: ContestStatus;
    title: string;
    description: string;
  } | null>(null);

  const status = contestState?.status || 'DRAFT';

  const handleExecuteTransition = async (targetStatus: ContestStatus) => {
    setTransitioning(true);
    setErrorMsg(null);
    setConfirmModal(null);

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
      setErrorMsg(err.message || 'Transition failed');
    } finally {
      setTransitioning(false);
    }
  };

  const statusBadgeConfig = {
    DRAFT: {
      label: 'DRAFT (ARENA LOCKED)',
      badgeClass: 'bg-slate-800 text-slate-300 border-slate-600',
      icon: <Clock className="w-3.5 h-3.5 text-slate-400" />,
    },
    LIVE: {
      label: 'LIVE (ACTIVE GAMEPLAY)',
      badgeClass: 'bg-emerald-950/80 text-emerald-300 border-emerald-500 shadow-neon-emerald',
      icon: <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />,
    },
    FROZEN: {
      label: 'FROZEN (SUBMISSIONS PAUSED)',
      badgeClass: 'bg-amber-950/80 text-amber-300 border-amber-500 shadow-md',
      icon: <Pause className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />,
    },
    CONCLUDED: {
      label: 'CONCLUDED (FINAL RESULTS)',
      badgeClass: 'bg-purple-950/80 text-purple-300 border-purple-500 shadow-md',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />,
    },
  };

  const currentBadge = statusBadgeConfig[status] || statusBadgeConfig.DRAFT;

  return (
    <>
      <div className="w-full bg-app-surface/80 backdrop-blur-sm border-b border-app-border px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3">
        {/* Current State Info */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
            <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Contest Lifecycle:</span>
          </div>

          <div
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase border ${currentBadge.badgeClass}`}
          >
            {currentBadge.icon}
            <span>{currentBadge.label}</span>
          </div>

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" />}
        </div>

        {/* Action Buttons based on allowed state transitions */}
        <div className="flex items-center gap-2">
          {errorMsg && (
            <span className="text-xs text-rose-400 font-mono flex items-center gap-1 mr-2">
              <AlertTriangle className="w-3 h-3" />
              {errorMsg}
            </span>
          )}

          {/* DRAFT -> LIVE */}
          {status === 'DRAFT' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'LIVE',
                  title: 'Start Contest & Unlock Arena',
                  description:
                    'Transitioning to LIVE will unlock the participant arena, allowing contestants to download archives and submit solutions.',
                })
              }
              disabled={transitioning}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-neon-emerald transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Start Contest (Go LIVE)</span>
            </button>
          )}

          {/* LIVE -> FROZEN */}
          {status === 'LIVE' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'FROZEN',
                  title: 'Freeze Tournament',
                  description:
                    'Freezing the contest pauses new stage submissions and freezes the live leaderboard for contestants while keeping telemetry open.',
                })
              }
              disabled={transitioning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3.5 h-3.5 fill-white" />
              <span>Freeze Tournament</span>
            </button>
          )}

          {/* FROZEN -> LIVE (Resume) */}
          {status === 'FROZEN' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'LIVE',
                  title: 'Resume Tournament',
                  description:
                    'Resuming tournament gameplay will re-enable submissions and resume live leaderboard updates.',
                })
              }
              disabled={transitioning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-neon-emerald transition-all cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Resume Tournament</span>
            </button>
          )}

          {/* (LIVE or FROZEN) -> CONCLUDED */}
          {(status === 'LIVE' || status === 'FROZEN') && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'CONCLUDED',
                  title: 'Conclude Contest & Finalize Rankings',
                  description:
                    'Concluded status closes all submissions permanently and publishes the final official standings. This action cannot be reversed without administrative reset.',
                })
              }
              disabled={transitioning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-md transition-all cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Conclude Contest</span>
            </button>
          )}

          {/* CONCLUDED -> Reset to DRAFT */}
          {status === 'CONCLUDED' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'DRAFT',
                  title: 'Reset Tournament to DRAFT',
                  description:
                    'Resetting to DRAFT returns the contest to setup mode and locks the participant arena.',
                })
              }
              disabled={transitioning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to DRAFT</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md p-6 glass-panel rounded-2xl border border-slate-700 shadow-2xl space-y-4 text-left">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Shield className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-white">{confirmModal.title}</h3>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">{confirmModal.description}</p>

            <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-slate-400 flex items-center justify-between">
              <span>Transition:</span>
              <span className="font-bold text-white">
                {status} &rarr; {confirmModal.targetStatus}
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={transitioning}
                className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransition(confirmModal.targetStatus)}
                disabled={transitioning}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl shadow-neon-cyan transition-all cursor-pointer disabled:opacity-50"
              >
                {transitioning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating State...</span>
                  </>
                ) : (
                  <span>Confirm Transition</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
