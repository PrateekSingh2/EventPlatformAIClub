'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Copy, Eye, EyeOff, ShieldAlert, X } from 'lucide-react';

interface BypassStageModalProps {
  isOpen: boolean;
  stageNumber: number;
  accessToken: string;
  onClose: () => void;
  onPasswordRevealed?: (stageNumber: number, password: string) => void;
}

export function BypassStageModal({
  isOpen,
  stageNumber,
  accessToken,
  onClose,
  onPasswordRevealed,
}: BypassStageModalProps) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setMessage(null);
      setError(null);
      setPassword(null);
      setShowPassword(false);
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
        setMessage(data.message || '');
        const pw = String(data.password || '');
        setPassword(pw);
        onPasswordRevealed?.(stageNumber, pw);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyPassword = async () => {
    if (!password) return;
    try {
      await navigator.clipboard.writeText(password);
    } catch {
      /* ignore */
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
              Bypass Stage {stageNumber}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
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
                Stuck on the ZIP password for stage {stageNumber}? You can skip the hunt after three
                confirmations. You will still need to enter the password in Unlock — but you will earn{' '}
                <span className="text-amber-300 font-semibold">zero points</span> for that stage.
              </p>
              <ul className="text-xs text-zinc-400 space-y-1 list-disc pl-4">
                <li>Warning 1: Are you sure you want to skip this stage?</li>
                <li>Warning 2: You won&apos;t get any points for this stage.</li>
                <li>Warning 3: Final confirmation before the password is shown.</li>
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
                {step === 1 ? 'Yes, continue' : 'I understand — confirm again'}
              </button>
            </>
          )}

          {step === 3 && password && (
            <>
              <p className="text-sm text-emerald-300/90">{message}</p>
              <p className="text-xs text-zinc-400">
                Admin will see that you bypassed this stage. Use Unlock Stage with this password — no
                points will be added.
              </p>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-zinc-900 border border-zinc-700 font-mono text-sm">
                <span className="flex-1 truncate">{showPassword ? password : '••••••••••••'}</span>
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={copyPassword}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-400"
                  aria-label="Copy password"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm"
              >
                Done — I&apos;ll unlock manually
              </button>
            </>
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
