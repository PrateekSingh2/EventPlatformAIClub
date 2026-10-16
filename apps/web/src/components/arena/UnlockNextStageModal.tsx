'use client';

import React, { useState } from 'react';
import { extractZipInBrowser } from '@/lib/zip-engine';
import confetti from 'canvas-confetti';
import { KeyRound, Eye, EyeOff, X } from 'lucide-react';

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
      setErrorMessage('Please enter the stage decryption key.');
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
        setErrorMessage('Invalid stage key. Verification failed.');
        setValidating(false);
        return;
      }

      // 4. Submit to server to advance stage & award points
      const submitRes = await fetch('/api/stage/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accessToken,
          stageNumber: currentStageNumber,
          nextStagePassword: cleanPassword,
          answers: [0, 0],
        }),
      });

      const submitData = await submitRes.json();
      const pointsAwarded = submitData.scoreAwarded || points;

      // 5. Fire celebratory confetti
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#e2e8f0', '#34d399', '#f59e0b'],
        });
      } catch {}

      setSuccessMessage(`Stage ${nextStageNumber} Key Verified! +${pointsAwarded} PTS awarded.`);

      setTimeout(() => {
        onUnlockSuccess(
          nextStageNumber,
          cleanPassword,
          pointsAwarded,
          accessData.downloadUrl
        );
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMessage(
        err.message?.toLowerCase().includes('password')
          ? 'Invalid stage key. Verification failed.'
          : err.message || 'Validation failed. Please try again.'
      );
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
      <div className="bg-app-surface border border-app-border rounded-lg w-full max-w-sm p-5 space-y-4 shadow-xl">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-app-muted border border-app-border flex items-center justify-center text-app-accent">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-app-text">
                Unlock Stage {nextStageNumber}
              </h3>
              <p className="text-[11px] text-app-subtext">Submit extracted password flag</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-app-subtext hover:text-app-text cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {errorMessage && (
          <div className="p-2 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded font-medium">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded font-medium">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleUnlockSubmit} className="space-y-3">
          <div className="space-y-1">
            <label htmlFor={`stage-key-input-${nextStageNumber}`} className="block text-[11px] font-medium text-app-subtext">
              STAGE_KEY_PASSWORD
            </label>
            <div className="relative">
              <input
                id={`stage-key-input-${nextStageNumber}`}
                name="stageKeyPassword"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. cyber2026"
                autoFocus
                disabled={validating}
                className="w-full bg-app-bg border border-app-border rounded px-3 py-1.5 text-xs text-app-text focus:border-app-accent transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2 text-app-subtext hover:text-app-text cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-app-subtext">
              Hint: Inspect directive parameters inside{' '}
              <span className="font-mono text-app-text underline">ai_prompt.txt</span>
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              disabled={validating}
              className="px-3 py-1.5 rounded text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating || !password.trim()}
              className="px-3.5 py-1.5 rounded bg-app-accent text-app-bg text-xs font-medium hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
            >
              {validating ? 'Verifying...' : 'Verify & Progress'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
