'use client';

import React, { useState } from 'react';
import confetti from 'canvas-confetti';
import { Trophy, KeyRound, X, CheckCircle2, Loader2, Sparkles } from 'lucide-react';

interface ContestCompletionModalProps {
  isOpen: boolean;
  totalStages: number;
  accessToken: string;
  onClose: () => void;
  onContestComplete: (finalScore?: number) => void;
}

export function ContestCompletionModal({
  isOpen,
  totalStages,
  accessToken,
  onClose,
  onContestComplete,
}: ContestCompletionModalProps) {
  const [finalPhrase, setFinalPhrase] = useState('');
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhrase = finalPhrase.trim();

    if (!cleanPhrase) {
      setErrorMessage('Please enter the final recovery phrase to complete the game.');
      return;
    }

    setValidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await fetch('/api/stage/complete-contest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          finalPhrase: cleanPhrase,
          completedAt: new Date().toISOString(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to complete contest. Please check your recovery phrase.');
      }

      try {
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.5 },
          colors: ['#f59e0b', '#10b981', '#38bdf8', '#a855f7'],
        });
      } catch {}

      setSuccessMessage('Investigation Concluded! Stats locked. Exiting arena...');

      setTimeout(() => {
        onContestComplete(data.totalScore);
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(err.message || 'Submission failed.');
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-app-surface border border-amber-500/40 rounded-3xl shadow-2xl p-6 sm:p-7 relative text-app-text space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-lg">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
                <span>Final Stage Completion</span>
                <Sparkles className="w-4 h-4 text-amber-400" />
              </h3>
              <p className="text-xs text-slate-400 font-mono">
                Terminal Stage Reached ({totalStages} of {totalStages})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-xl text-slate-400 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Narrative Box */}
        <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs text-slate-300 leading-relaxed space-y-1.5">
          <p className="font-semibold text-amber-300">
            You have extracted the deepest evidence layer.
          </p>
          <p className="text-[11px] text-slate-400">
            Enter the <strong>Final Recovery Phrase</strong> stated in the final stage brief (or your conclusion code) to conclude the investigation, permanently lock your score on the leaderboard, and finalize your contest record.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-slate-300 tracking-wide uppercase">
              Final Recovery Phrase / Decryption Flag
            </label>
            <div className="relative">
              <input
                type="text"
                value={finalPhrase}
                onChange={(e) => setFinalPhrase(e.target.value)}
                placeholder="e.g. LEDGER-RESTORED-02"
                disabled={validating || Boolean(successMessage)}
                autoFocus
                className="w-full px-4 py-3 rounded-xl bg-app-bg border border-white/15 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-400/20 text-white font-mono text-sm tracking-wide placeholder:text-slate-600 transition-all shadow-inner"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-400 text-xs font-medium animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={validating || Boolean(successMessage)}
              className="flex-1 py-2.5 px-4 rounded-xl border border-white/10 hover:bg-white/5 text-slate-300 text-xs font-semibold transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating || Boolean(successMessage)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_14px_rgba(245,158,11,0.35)] flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {validating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <Trophy className="w-3.5 h-3.5" />
                  <span>Complete Contest</span>
                </>
              )}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
