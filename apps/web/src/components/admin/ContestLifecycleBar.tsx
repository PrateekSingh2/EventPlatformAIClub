'use client';

import React, { useState } from 'react';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { ContestStatus } from '@/lib/types';
import {
  Play,
  Pause,
  CheckCircle2,
  Clock,
  RotateCcw,
  Loader2,
  AlertTriangle,
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

  const statusConfig = {
    DRAFT: {
      label: 'Draft (Arena Locked)',
      dotClass: 'bg-zinc-400',
      badgeClass: 'bg-zinc-800 text-zinc-300 border-zinc-700',
      icon: <Clock className="w-3.5 h-3.5 text-zinc-400" />,
    },
    LIVE: {
      label: 'Live (Active Gameplay)',
      dotClass: 'bg-emerald-400 animate-pulse',
      badgeClass: 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60',
      icon: <Play className="w-3.5 h-3.5 text-emerald-400 fill-emerald-400" />,
    },
    FROZEN: {
      label: 'Frozen (Submissions Paused)',
      dotClass: 'bg-amber-400',
      badgeClass: 'bg-amber-950/40 text-amber-300 border-amber-800/60',
      icon: <Pause className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />,
    },
    CONCLUDED: {
      label: 'Concluded (Official Results)',
      dotClass: 'bg-purple-400',
      badgeClass: 'bg-purple-950/40 text-purple-300 border-purple-800/60',
      icon: <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />,
    },
  };

  const currentBadge = statusConfig[status] || statusConfig.DRAFT;

  return (
    <>
      <div className="w-full bg-app-surface/60 border-b border-app-border px-3.5 sm:px-6 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        {/* Status Indicator */}
        <div className="flex items-center space-x-2.5 min-w-0">
          <span className="text-xs text-app-subtext font-medium hidden xs:inline">
            Tournament Status:
          </span>

          <div
            className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border ${currentBadge.badgeClass}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${currentBadge.dotClass}`} />
            <span>{currentBadge.label}</span>
          </div>

          {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-app-subtext" />}
        </div>

        {/* Action Controls */}
        <div className="flex items-center flex-wrap gap-2 self-start sm:self-auto">
          {errorMsg && (
            <span className="text-xs text-rose-400 flex items-center space-x-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
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
                    'Transitioning to LIVE unlocks the participant arena, allowing contestants to download challenge archives and submit answers.',
                })
              }
              disabled={transitioning}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Start Contest (Go Live)</span>
            </button>
          )}

          {/* LIVE -> FROZEN */}
          {status === 'LIVE' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'FROZEN',
                  title: 'Freeze Tournament Submissions',
                  description:
                    'Freezing the contest pauses new stage submissions and freezes the live leaderboard for contestants while keeping telemetry active.',
                })
              }
              disabled={transitioning}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Pause className="w-3 h-3 fill-white" />
              <span>Freeze Submissions</span>
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
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3 h-3 fill-white" />
              <span>Resume Contest</span>
            </button>
          )}

          {/* (LIVE or FROZEN) -> CONCLUDED */}
          {(status === 'LIVE' || status === 'FROZEN') && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'CONCLUDED',
                  title: 'Conclude Contest & Finalize Standings',
                  description:
                    'Concluded status finalizes all participant scores and publishes the final official standings. This action closes submissions permanently.',
                })
              }
              disabled={transitioning}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3 h-3" />
              <span>Conclude Contest</span>
            </button>
          )}

          {/* CONCLUDED -> Reset to DRAFT */}
          {status === 'CONCLUDED' && (
            <button
              onClick={() =>
                setConfirmModal({
                  targetStatus: 'DRAFT',
                  title: 'Reset Tournament to Draft',
                  description:
                    'Resetting to DRAFT returns the contest to setup mode and locks the participant arena.',
                })
              }
              disabled={transitioning}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-app-surface hover:bg-app-hover border border-app-border text-app-text text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to Draft</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-100">
          <div className="w-full max-w-sm sm:max-w-md p-5 sm:p-6 bg-app-surface border border-app-border rounded-2xl shadow-xl space-y-4 text-left">
            <h3 className="text-sm font-bold text-app-text">{confirmModal.title}</h3>
            <p className="text-xs text-app-subtext leading-relaxed">{confirmModal.description}</p>

            <div className="p-3 rounded-xl bg-app-bg border border-app-border text-xs flex items-center justify-between">
              <span className="text-app-subtext">State Transition:</span>
              <span className="font-semibold text-app-text">
                {status} &rarr; {confirmModal.targetStatus}
              </span>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={transitioning}
                className="px-3.5 py-2 text-xs font-medium text-app-subtext hover:text-app-text bg-app-hover rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleExecuteTransition(confirmModal.targetStatus)}
                disabled={transitioning}
                className="flex items-center space-x-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                {transitioning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Updating...</span>
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
