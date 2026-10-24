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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
      <div
        className="w-full max-w-md bg-app-surface border border-app-border rounded-3xl shadow-2xl p-6 sm:p-7 relative text-app-text space-y-5 animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center text-amber-500 shrink-0">
              <Trophy className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-app-text tracking-tight">
                Final Stage Completion
              </h3>
              <p className="text-xs text-app-subtext font-mono">
                Terminal Stage Reached ({totalStages} of {totalStages})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-app-subtext hover:text-app-text hover:bg-app-hover border border-app-border transition-colors cursor-pointer min-h-[32px] min-w-[32px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Narrative Box */}
        <div className="p-3.5 rounded-2xl bg-app-surface-raised border border-app-border text-xs text-app-text leading-relaxed space-y-1.5">
          <p className="font-semibold text-amber-500">
            You have extracted the deepest evidence layer.
          </p>
          <p className="text-[11px] text-app-subtext">
            Enter the <strong>Final Recovery Phrase</strong> stated in the final stage brief (or your conclusion code) to conclude the investigation, permanently lock your score on the leaderboard, and finalize your contest record.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-app-subtext tracking-wide uppercase">
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
                className="w-full px-4 py-2.5 rounded-xl bg-app-bg border border-app-border focus:border-amber-500 focus:outline-none text-app-text font-mono text-xs sm:text-sm tracking-wide placeholder:text-app-subtext/40 transition-colors shadow-inner min-h-[44px]"
              />
              <KeyRound className="w-4 h-4 text-app-subtext absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-500 dark:text-rose-400 text-xs font-medium animate-in fade-in">
              {errorMessage}
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-500 dark:text-emerald-400 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          <div className="flex items-center space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={validating || Boolean(successMessage)}
              className="flex-1 py-2.5 px-4 rounded-xl border border-app-border hover:bg-app-hover text-app-subtext hover:text-app-text text-xs font-semibold transition-colors cursor-pointer min-h-[42px]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating || Boolean(successMessage)}
              className="flex-1 py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs active:scale-[0.98] transition-colors cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 min-h-[42px]"
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
