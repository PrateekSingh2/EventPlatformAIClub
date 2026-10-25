'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldAlert, X } from 'lucide-react';

interface BypassStageModalProps {
  isOpen: boolean;
  stageNumber: number;
  accessToken: string;
  onClose: () => void;
  /** Server resolved key — used only to decrypt ZIP in RAM, never shown. */
  onBypassComplete?: (stageNumber: number, decryptionKey: string, scoreAwarded: number) => void;
}

export function BypassStageModal({
  isOpen,
  stageNumber,
  accessToken,
  onClose,
  onBypassComplete,
}: BypassStageModalProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setMessage(null);
      setError(null);
      setDone(false);
    }
  }, [isOpen, stageNumber]);

  if (!isOpen) return null;

  const runStep = async (nextStep: 1 | 2 | 3) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/stage/bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, stageNumber, step: nextStep }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Bypass request failed');

      if (nextStep < 3) {
        setStep(nextStep);
        setMessage(data.message || '');
      } else {
        setStep(3);
        const key = String(data.decryptionKey || '').trim();
        if (!key || !data.autoUnlock) {
          throw new Error(data.error || 'Could not unlock this stage automatically.');
        }
        const points = Number(data.scoreAwarded) || 0;
        setDone(true);
        setMessage('Stage unlocked — opening files (0 points for this stage).');
        onBypassComplete?.(stageNumber, key, points);
        setTimeout(() => onClose(), 800);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        role="dialog"
        aria-labelledby="bypass-stage-title"
        className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-zinc-950 shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-amber-500/30 bg-amber-950/40">
          <div className="flex items-center gap-2 text-amber-200">
            <ShieldAlert className="w-5 h-5 shrink-0" />
            <h2 id="bypass-stage-title" className="text-sm font-bold">
              Skip stage {stageNumber} lock
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {step === 0 && (
            <>
              <p className="text-sm text-zinc-300 leading-relaxed">
                Stuck on the ZIP password for stage {stageNumber}? After three confirmations we will{' '}
                <span className="text-emerald-300 font-semibold">open that stage for you</span> — no
                password typing. You earn{' '}
                <span className="text-amber-300 font-semibold">zero points</span> for this stage; admins
                are notified.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 list-disc pl-4">
                <li>Warning 1: Are you sure you want to skip this stage?</li>
                <li>Warning 2: You won&apos;t get any points for this stage.</li>
                <li>Warning 3: Final confirmation — stage unlocks immediately.</li>
              </ul>
              <button
                type="button"
                disabled={loading}
                onClick={() => runStep(1)}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-sm disabled:opacity-60"
              >
                Start bypass warnings
              </button>
            </>
          )}

          {step >= 1 && step < 3 && (
            <>
              <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-950/50 border border-amber-500/30">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-mono text-amber-300/80 mb-1">Warning {step} of 3</p>
                  <p className="text-sm text-zinc-100">{message}</p>
                </div>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => runStep((step + 1) as 2 | 3)}
                className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-zinc-950 font-semibold text-sm disabled:opacity-60"
              >
                {loading ? (
                  <span className="inline-flex items-center gap-2 justify-center">
                    <Loader2 className="w-4 h-4 animate-spin" /> Working…
                  </span>
                ) : step === 1 ? (
                  'Yes, continue'
                ) : (
                  'Unlock stage now (0 points)'
                )}
              </button>
            </>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              {done ? (
                <>
                  <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                  <p className="text-sm text-emerald-300">{message}</p>
                </>
              ) : (
                <>
                  <Loader2 className="w-10 h-10 text-amber-400 animate-spin" />
                  <p className="text-sm text-zinc-300">Decrypting and opening stage {stageNumber}…</p>
                </>
              )}
            </div>
          )}

          {error && (
            <p className="text-xs text-rose-400 bg-rose-950/40 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
