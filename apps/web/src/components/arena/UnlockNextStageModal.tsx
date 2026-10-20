'use client';

import React, { useEffect, useState, useRef } from 'react';
import { extractZipInBrowser } from '@/lib/zip-engine';
import { enqueueStageProgress } from '@/lib/offline-progress-queue';
import { getCachedStageArchive, saveStageArchive } from '@/lib/stage-cache';
import confetti from 'canvas-confetti';
import { KeyRound, Eye, EyeOff, X, WifiOff, CloudLightning } from 'lucide-react';

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
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isOfflineMode, setIsOfflineMode] = useState(false);

  const stageOpenTimeRef = useRef<number>(Date.now());

  useEffect(() => {
    if (isOpen) {
      stageOpenTimeRef.current = Date.now();
      setIsOfflineMode(typeof navigator !== 'undefined' && !navigator.onLine);
    }
  }, [isOpen]);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setCooldownSeconds((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

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

    const completedTimestamp = Date.now();
    const completionIso = new Date(completedTimestamp).toISOString();
    const durationSeconds = Math.max(1, Math.round((completedTimestamp - stageOpenTimeRef.current) / 1000));
    const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

    // Helper to queue progress locally and advance optimistic UI
    const queueAndProceed = async (downloadUrl: string = '', pointsWon: number = points) => {
      await enqueueStageProgress({
        accessToken,
        stageNumber: currentStageNumber,
        nextStagePassword: cleanPassword,
        completedAt: completionIso,
        completedTimestamp,
        durationSeconds,
        pointsAwarded: pointsWon,
      });

      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#e2e8f0', '#34d399', '#f59e0b'],
        });
      } catch {}

      const timeFormatted = new Date(completedTimestamp).toLocaleTimeString();
      setSuccessMessage(`Stage ${nextStageNumber} Key Verified! Offline beacon queued at ${timeFormatted} for leaderboard sync.`);

      setTimeout(() => {
        onUnlockSuccess(
          nextStageNumber,
          cleanPassword,
          pointsWon,
          downloadUrl
        );
        onClose();
      }, 1400);
    };

    // --- Branch A: Client is Offline ---
    if (isOffline) {
      try {
        const cached = await getCachedStageArchive(nextStageNumber);
        let offlineValid = false;

        if (cached?.blob) {
          try {
            await extractZipInBrowser(cached.blob, cleanPassword, cached.allowedCopyFilename);
            offlineValid = true;
          } catch {
            setErrorMessage('Invalid stage key. Verification failed.');
            setValidating(false);
            return;
          }
        } else {
          // Fallback verification for demo passwords
          if (
            (nextStageNumber === 2 && cleanPassword === 'cyber2026') ||
            (nextStageNumber === 3 && cleanPassword === 'quantum4096')
          ) {
            offlineValid = true;
          }
        }

        if (offlineValid) {
          await queueAndProceed();
          return;
        } else {
          setErrorMessage('Invalid stage key. Try again or reconnect.');
          setValidating(false);
          return;
        }
      } catch (err: any) {
        setErrorMessage(err.message || 'Offline verification failed.');
        setValidating(false);
        return;
      }
    }

    // --- Branch B: Client is Online ---
    try {
      try {
        const statusRes = await fetch('/api/stage/password-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, stageNumber: currentStageNumber, action: 'status' }),
        });
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          setCooldownSeconds(statusData.cooldownSeconds || 0);
          throw new Error(statusData.error || 'Unable to verify password attempt limit.');
        }
      } catch (statusErr: any) {
        // If network dropped right here, treat as offline
        if (!navigator.onLine || statusErr.name === 'TypeError') {
          console.warn('[UnlockNextStageModal] Network unavailable checking status, checking offline cache');
        } else {
          throw statusErr;
        }
      }

      // 1. Fetch access credentials and presigned download URL for next stage
      let accessData: any = null;
      try {
        const accessRes = await fetch('/api/stage/access-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            stageNumber: nextStageNumber,
          }),
        });

        accessData = await accessRes.json();
        if (!accessRes.ok) {
          throw new Error(accessData.error || `Unable to access Stage ${nextStageNumber}`);
        }
      } catch (accessErr: any) {
        // If server access failed due to network, check cached archive
        const cached = await getCachedStageArchive(nextStageNumber);
        if (cached?.blob) {
          await extractZipInBrowser(cached.blob, cleanPassword, cached.allowedCopyFilename);
          await queueAndProceed();
          return;
        }
        throw accessErr;
      }

      // 2. Fetch the next stage ZIP binary directly into RAM & cache locally
      let zipBlob: Blob;
      try {
        const storageRes = await fetch(accessData.downloadUrl);
        if (!storageRes.ok) {
          throw new Error('Failed to retrieve next stage archive from storage.');
        }
        zipBlob = await storageRes.blob();
        // Persist to IndexedDB stage cache in background for offline durability
        void saveStageArchive(nextStageNumber, zipBlob, {
          title: nextStageTitle,
          allowedCopyFilename: accessData.allowedCopyFilename,
        });
      } catch (storageErr) {
        // Try fallback to local cached stage
        const cached = await getCachedStageArchive(nextStageNumber);
        if (cached?.blob) {
          zipBlob = cached.blob;
        } else {
          throw storageErr;
        }
      }

      // 3. Validate password by attempting in-memory extraction of the next stage ZIP
      try {
        await extractZipInBrowser(zipBlob, cleanPassword, accessData.allowedCopyFilename);
      } catch (zipErr: any) {
        try {
          const attemptRes = await fetch('/api/stage/password-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, stageNumber: currentStageNumber, action: 'failed' }),
          });
          const attemptData = await attemptRes.json();
          setCooldownSeconds(attemptData.cooldownSeconds || 0);
          setErrorMessage(attemptData.error || 'Invalid stage key. Verification failed.');
        } catch {
          setErrorMessage('Invalid stage key. Verification failed.');
        }
        return;
      }

      // 4. Submit to server with exact completion timestamps for leaderboard
      try {
        const submitRes = await fetch('/api/stage/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            accessToken,
            stageNumber: currentStageNumber,
            nextStagePassword: cleanPassword,
            completedAt: completionIso,
            completedTimestamp,
            durationSeconds,
            answers: [0, 0],
          }),
        });

        const submitData = await submitRes.json();
        if (!submitRes.ok || !submitData.success) {
          setCooldownSeconds(submitData.cooldownSeconds || 0);
          throw new Error(submitData.error || submitData.message || 'Stage key verification failed.');
        }

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
      } catch (submitErr: any) {
        // If network failure occurred during submit, queue in beacon queue!
        if (!navigator.onLine || submitErr.name === 'TypeError' || submitErr.message?.includes('fetch')) {
          console.warn('[UnlockNextStageModal] Network drop during submit, queueing in IndexedDB');
          await queueAndProceed(accessData?.downloadUrl || '', points);
          return;
        }
        throw submitErr;
      }
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
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xl z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-app-surface border border-app-border rounded-3xl w-full max-w-sm p-6 space-y-4 shadow-[0_25px_60px_rgba(0,0,0,0.6)] relative overflow-hidden"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-10 h-10 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs">
              <KeyRound className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-bold text-app-text tracking-tight">
                  Unlock Stage {nextStageNumber}
                </h3>
                {isOfflineMode && (
                  <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <WifiOff className="w-2.5 h-2.5" /> Offline
                  </span>
                )}
              </div>
              <p className="text-[11px] text-app-subtext">Submit extracted password flag</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-xl hover:bg-app-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {isOfflineMode && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-500 flex items-start gap-2">
            <CloudLightning className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              You are currently offline. Your progress and exact completion timestamp will be securely saved in the IndexedDB beacon queue and synced to the leaderboard once you reconnect.
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 text-xs text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl font-medium shadow-xs">
            {errorMessage}
          </div>
        )}

        {successMessage && (
          <div className="p-3 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-xl font-medium shadow-xs">
            {successMessage}
          </div>
        )}

        <form onSubmit={handleUnlockSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`stage-key-input-${nextStageNumber}`} className="block text-[11px] font-mono text-app-subtext">
              STAGE_KEY_PASSWORD
            </label>
            <div className="relative">
              <input
                id={`stage-key-input-${nextStageNumber}`}
                name="stageKeyPassword"
                data-paste-allowed="true"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMessage(null);
                }}
                placeholder="e.g. cyber2026"
                autoFocus
                disabled={validating || cooldownSeconds > 0}
                className="w-full bg-app-bg border border-app-border rounded-xl px-3 pr-9 py-2.5 text-xs text-app-text shadow-inner focus:border-app-accent focus:outline-none transition-colors placeholder:text-app-subtext/40 font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 top-2.5 text-app-subtext hover:text-app-text cursor-pointer p-1"
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-app-subtext">
              Hint: Inspect directive parameters inside{' '}
              <span className="font-mono text-app-text font-semibold underline decoration-app-subtext/40">ai_prompt.txt</span>
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={onClose}
              disabled={validating}
              className="px-3.5 py-1.5 rounded-xl text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating || cooldownSeconds > 0 || !password.trim()}
              className="px-4 py-1.5 rounded-xl bg-app-accent text-app-bg text-xs font-semibold hover:opacity-95 active:scale-[0.98] shadow-sm transition-all cursor-pointer disabled:opacity-50"
            >
              {validating ? 'Verifying...' : cooldownSeconds > 0 ? `Retry in ${cooldownSeconds}s` : 'Verify & Progress'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
