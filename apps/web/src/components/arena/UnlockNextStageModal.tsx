'use client';

import React, { useState } from 'react';
import { extractZipInBrowser, ZipEngineError } from '@/lib/zip-engine';
import confetti from 'canvas-confetti';
import {
  Lock,
  Unlock,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Loader2,
  Sparkles,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
} from 'lucide-react';

interface UnlockNextStageModalProps {
  isOpen: boolean;
  currentStageNumber: number;
  nextStageNumber: number;
  nextStageTitle?: string;
  points?: number;
  accessToken: string;
  onClose: () => void;
  onUnlockSuccess: (
    nextStageNumber: number,
    password: string,
    pointsAwarded: number,
    downloadUrl: string
  ) => void;
}

export function UnlockNextStageModal({
  isOpen,
  currentStageNumber,
  nextStageNumber,
  nextStageTitle,
  points = 100,
  accessToken,
  onClose,
  onUnlockSuccess,
}: UnlockNextStageModalProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [validating, setValidating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPassword = password.trim();
    if (!cleanPassword) {
      setErrorMessage('Please enter the next stage archive password.');
      return;
    }

    setValidating(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      // 1. Fetch access credentials and presigned download URL for next stage
      const accessRes = await fetch('/api/stage/access-zip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          stageNumber: nextStageNumber,
        }),
      });

      const accessData = await accessRes.json();
      if (!accessRes.ok) {
        throw new Error(accessData.error || `Unable to access Stage ${nextStageNumber}`);
      }

      // 2. Fetch the next stage ZIP binary directly into RAM
      const storageRes = await fetch(accessData.downloadUrl);
      if (!storageRes.ok) {
        throw new Error('Failed to retrieve next stage archive from storage.');
      }
      const zipBlob = await storageRes.blob();

      // 3. Validate password by attempting in-memory extraction of the next stage ZIP
      try {
        await extractZipInBrowser(zipBlob, cleanPassword, accessData.allowedCopyFilename);
      } catch (zipErr: any) {
        // Validation failed! Password does not decrypt next stage archive
        setErrorMessage('Wrong password, try to figure it out once again.');
        setValidating(false);
        return;
      }

      // 4. Password decrypted the archive successfully! Notify server to advance stage & award points
      const submitRes = await fetch('/api/stage/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          stageNumber: currentStageNumber,
          nextStagePassword: cleanPassword,
          answers: [0, 0], // Compatibility with stage gate
        }),
      });

      const submitData = await submitRes.json();
      const pointsAwarded = submitData.scoreAwarded || points;

      // 5. Fire celebratory confetti
      try {
        confetti({
          particleCount: 120,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#22d3ee', '#8b5cf6', '#10b981'],
        });
      } catch {
        // Safe fallback
      }

      setSuccessMessage(
        `Stage ${nextStageNumber} Archive Decrypted! +${pointsAwarded} PTS awarded.`
      );

      setTimeout(() => {
        onUnlockSuccess(
          nextStageNumber,
          cleanPassword,
          pointsAwarded,
          accessData.downloadUrl
        );
        onClose();
      }, 1500);
    } catch (err: any) {
      setErrorMessage(
        err.message?.toLowerCase().includes('password')
          ? 'Wrong password, try to figure it out once again.'
          : err.message || 'Validation failed. Please try again.'
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md">
      <div className="relative w-full max-w-lg p-6 glass-panel-highlight rounded-3xl border border-cyan-500/40 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-violet-500/20 border border-cyan-500/30 text-cyan-400">
              <Unlock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                  Stage Gate
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  Clear Stage {currentStageNumber}
                </span>
              </div>
              <h2 className="text-base font-extrabold text-white tracking-tight">
                Unlock Stage {nextStageNumber}
              </h2>
            </div>
          </div>

          <div className="text-right">
            <span className="text-[10px] text-slate-400 uppercase font-mono">Stage Reward</span>
            <div className="text-xs font-extrabold text-cyan-400 font-mono">+{points} PTS</div>
          </div>
        </div>

        {/* Guidance Prompt */}
        <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs text-slate-300 leading-relaxed space-y-1.5">
          <p className="flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              To clear <strong>Stage {currentStageNumber}</strong> and advance, you must deduce the decryption password for the <strong>Stage {nextStageNumber}</strong> archive from your current files.
            </span>
          </p>
        </div>

        {/* Error Feedback Banner */}
        {errorMessage && (
          <div className="flex items-center gap-3 p-3.5 text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-500/60 rounded-xl animate-shake">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Success Feedback Banner */}
        {successMessage && (
          <div className="flex items-center gap-3 p-3.5 text-xs font-semibold text-emerald-300 bg-emerald-950/60 border border-emerald-500/60 rounded-xl">
            <Sparkles className="w-5 h-5 text-emerald-400 shrink-0 animate-spin" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Password Form */}
        <form onSubmit={handleUnlockSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Stage {nextStageNumber} ZIP Decryption Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="Enter deduced password..."
                autoFocus
                disabled={validating}
                className="w-full px-4 py-3 pl-10 pr-10 text-xs sm:text-sm font-mono tracking-wider text-white bg-slate-900/90 border border-slate-700/80 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-colors"
              />
              <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-3.5 text-slate-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={validating}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              Resume Current Stage
            </button>

            <button
              type="submit"
              disabled={validating || !password.trim()}
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-gradient-to-r from-cyan-400 to-violet-400 hover:from-cyan-300 hover:to-violet-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
            >
              {validating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validating Password in RAM...
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4" />
                  Unlock Stage {nextStageNumber}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
