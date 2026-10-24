'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
  extractZipInBrowser,
  extractStageArchiveInBrowser,
  resolveNextStageZipBlob,
  verifyStageUnlockPassword,
} from '@/lib/zip-engine';
import { enqueueStageProgress } from '@/lib/offline-progress-queue';
import { getCachedStageArchive, saveStageArchive } from '@/lib/stage-cache';
import confetti from 'canvas-confetti';
import { KeyRound, Eye, EyeOff, X, WifiOff, CloudLightning, Clock, ShieldAlert } from 'lucide-react';

interface UnlockNextStageModalProps {
  nextStageZipBlob?: Blob | null;
  isOpen: boolean;
  currentStageNumber: number;
  nextStageNumber: number;
  nextStageTitle?: string;
  points?: number;
  accessToken: string;
  /** If provided, uses nested-ZIP in-browser decryption (new token archive system). */
  tokenArchiveBlob?: Blob | null;
  /** Passwords already verified for prior stages (nested-chain replay). */
  stagePasswords?: Record<number, string>;
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
  nextStageZipBlob,
  tokenArchiveBlob,
  stagePasswords,
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
  const localFailedAttemptsRef = useRef<number>(0);
  const lastStatusFetchRef = useRef<{ stage: number; at: number; cooldown: number } | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (successTimerRef.current) {
        clearTimeout(successTimerRef.current);
      }
    };
  }, []);

  // Clear password, errors, and check active cooldown whenever modal opens or stage transitions
  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
      setShowPassword(false);
      stageOpenTimeRef.current = Date.now();
      setIsOfflineMode(typeof navigator !== 'undefined' && !navigator.onLine);

      if (accessToken && nextStageNumber) {
        const cached = lastStatusFetchRef.current;
        const cacheFresh =
          cached && cached.stage === nextStageNumber && Date.now() - cached.at < 5000;
        if (cacheFresh) {
          if (cached.cooldown > 0) setCooldownSeconds(cached.cooldown);
        } else {
          fetch('/api/stage/password-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              stageNumber: nextStageNumber,
              action: 'status',
            }),
          })
            .then((res) => res.json())
            .then((data) => {
              const cd = data?.cooldownSeconds || 0;
              lastStatusFetchRef.current = { stage: nextStageNumber, at: Date.now(), cooldown: cd };
              if (cd > 0) setCooldownSeconds(cd);
            })
            .catch(() => {});
        }
      }
    } else {
      setPassword('');
      setErrorMessage(null);
      setSuccessMessage(null);
    }
  }, [isOpen, nextStageNumber, accessToken]);

  // Smooth 1-second countdown timer when cooldown is active
  useEffect(() => {
    if (cooldownSeconds <= 0) return;
    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) return 0;
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  if (!isOpen) return null;

  const handleClose = () => {
    setPassword('');
    setErrorMessage(null);
    onClose();
  };

  const handleUnlockSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cooldownSeconds > 0) return;

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

    const resolveTargetZip = async () => {
      if (!tokenArchiveBlob) return nextStageZipBlob ?? null;
      return resolveNextStageZipBlob(tokenArchiveBlob, nextStageNumber, {
        prefetched: nextStageZipBlob,
        stagePasswords: { ...stagePasswords, [nextStageNumber]: cleanPassword },
      });
    };

    // Helper to apply local fallback cooldown on wrong attempt
    const applyFailureCooldown = (serverCooldown?: number, errorMsg?: string) => {
      localFailedAttemptsRef.current += 1;
      const count = localFailedAttemptsRef.current;
      const fallbackCooldown = count >= 5 ? 60 : count >= 3 ? 15 : 0;
      const effectiveCooldown = serverCooldown && serverCooldown > 0 ? serverCooldown : fallbackCooldown;

      if (effectiveCooldown > 0) {
        setCooldownSeconds(effectiveCooldown);
      }

      setErrorMessage(
        errorMsg ||
          (effectiveCooldown > 0
            ? `Too many incorrect passwords. Try again in ${effectiveCooldown} seconds.`
            : `Invalid stage key. ${Math.max(0, 3 - count)} attempt(s) remaining before a 15-second cooldown.`)
      );
    };

    // Helper to queue progress locally and advance optimistic UI
    const queueAndProceed = async (downloadUrl: string = '', pointsWon: number = points) => {
      localFailedAttemptsRef.current = 0;
      setCooldownSeconds(0);
      setPassword('');

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

      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setPassword('');
        onUnlockSuccess(
          nextStageNumber,
          cleanPassword,
          pointsWon,
          downloadUrl
        );
        handleClose();
      }, 1200);
    };

    // --- Branch A: Client is Offline ---
    if (isOffline) {
      try {
        let offlineValid = false;
        if (tokenArchiveBlob) {
          offlineValid = await verifyStageUnlockPassword(
            tokenArchiveBlob,
            nextStageNumber,
            cleanPassword
          );
          if (!offlineValid) {
            applyFailureCooldown(undefined, 'Invalid stage key. Decryption failed.');
            setValidating(false);
            return;
          }
        } else if (nextStageZipBlob) {
          try {
            await extractStageArchiveInBrowser(nextStageZipBlob, cleanPassword);
            offlineValid = true;
          } catch {
            applyFailureCooldown(undefined, 'Invalid stage key. Decryption failed.');
            setValidating(false);
            return;
          }
        } else {
          const cached = await getCachedStageArchive(nextStageNumber);
          if (cached?.blob) {
            try {
              await extractZipInBrowser(cached.blob, cleanPassword, cached.allowedCopyFilename);
              offlineValid = true;
            } catch {
              applyFailureCooldown(undefined, 'Invalid stage key. Decryption failed.');
              setValidating(false);
              return;
            }
          }
        }

        if (offlineValid) {
          await queueAndProceed();
          return;
        } else {
          applyFailureCooldown(undefined, 'Invalid stage key. Try again.');
          setValidating(false);
          return;
        }
      } catch (err: any) {
        applyFailureCooldown(undefined, err.message || 'Offline verification failed.');
        setValidating(false);
        return;
      }
    }

    // --- Branch B: Client is Online ---
    try {
      // 1. Status Check for nextStageNumber rate-limit
      try {
        const statusRes = await fetch('/api/stage/password-attempt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken, stageNumber: nextStageNumber, action: 'status' }),
        });
        const statusData = await statusRes.json();
        if (!statusRes.ok) {
          if (statusData.cooldownSeconds > 0) {
            setCooldownSeconds(statusData.cooldownSeconds);
          }
          throw new Error(statusData.error || 'Password cooldown is currently active.');
        }
      } catch (statusErr: any) {
        if (!navigator.onLine || statusErr.name === 'TypeError') {
          console.warn('[UnlockNextStageModal] Network unavailable checking status, checking offline cache');
        } else {
          throw statusErr;
        }
      }

      // ── Token Archive Path (nested archive system) ────────────────────────
      const targetZip = tokenArchiveBlob ? await resolveTargetZip() : nextStageZipBlob;
      if (tokenArchiveBlob) {
        const unlockOk = await verifyStageUnlockPassword(
          tokenArchiveBlob,
          nextStageNumber,
          cleanPassword
        );
        if (!unlockOk) {
          // Password wrong — register failure with server
          let serverCooldown = 0;
          let serverError = 'Invalid stage key. Verification failed.';
          try {
            const attemptRes = await fetch('/api/stage/password-attempt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken, stageNumber: nextStageNumber, action: 'failed' }),
            });
            const attemptData = await attemptRes.json();
            serverCooldown = attemptData.cooldownSeconds || 0;
            if (attemptData.error) serverError = attemptData.error;
          } catch {}

          applyFailureCooldown(serverCooldown, serverError);
          setValidating(false);
          return;
        }

        // Password is correct — confirm with server and award points
        try {
          const verifyRes = await fetch('/api/stage/verify-stage-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              stageNumber: nextStageNumber,
              password: cleanPassword,
              completedAt: completionIso,
              completedTimestamp,
              durationSeconds,
            }),
          });

          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.success) {
            if (verifyData.cooldownSeconds > 0) {
              setCooldownSeconds(verifyData.cooldownSeconds);
            }
            throw new Error(verifyData.error || 'Stage key verification failed.');
          }

          const pointsAwarded = verifyData.scoreAwarded || points;
          localFailedAttemptsRef.current = 0;
          setCooldownSeconds(0);
          setPassword('');

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
            setPassword('');
            onUnlockSuccess(nextStageNumber, cleanPassword, pointsAwarded, '');
            handleClose();
          }, 1100);
        } catch (verifyErr: any) {
          if (!navigator.onLine || verifyErr.name === 'TypeError' || verifyErr.message?.includes('fetch')) {
            await queueAndProceed('', points);
            return;
          }
          throw verifyErr;
        }
        return;
      }

      if (nextStageZipBlob) {
        try {
          await extractStageArchiveInBrowser(nextStageZipBlob, cleanPassword);
        } catch {
          let serverCooldown = 0;
          let serverError = 'Invalid stage key. Verification failed.';
          try {
            const attemptRes = await fetch('/api/stage/password-attempt', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accessToken, stageNumber: nextStageNumber, action: 'failed' }),
            });
            const attemptData = await attemptRes.json();
            serverCooldown = attemptData.cooldownSeconds || 0;
            if (attemptData.error) serverError = attemptData.error;
          } catch {}
          applyFailureCooldown(serverCooldown, serverError);
          setValidating(false);
          return;
        }

        try {
          const verifyRes = await fetch('/api/stage/verify-stage-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              accessToken,
              stageNumber: nextStageNumber,
              password: cleanPassword,
              completedAt: completionIso,
              completedTimestamp,
              durationSeconds,
            }),
          });
          const verifyData = await verifyRes.json();
          if (!verifyRes.ok || !verifyData.success) {
            if (verifyData.cooldownSeconds > 0) setCooldownSeconds(verifyData.cooldownSeconds);
            throw new Error(verifyData.error || 'Stage key verification failed.');
          }
          const pointsAwarded = verifyData.scoreAwarded || points;
          localFailedAttemptsRef.current = 0;
          setCooldownSeconds(0);
          setPassword('');
          try {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ['#e2e8f0', '#34d399', '#f59e0b'] });
          } catch {}
          setSuccessMessage(`Stage ${nextStageNumber} Key Verified! +${pointsAwarded} PTS awarded.`);
          setTimeout(() => {
            setPassword('');
            onUnlockSuccess(nextStageNumber, cleanPassword, pointsAwarded, '');
            handleClose();
          }, 1100);
        } catch (verifyErr: any) {
          if (!navigator.onLine || verifyErr.name === 'TypeError' || verifyErr.message?.includes('fetch')) {
            await queueAndProceed('', points);
            return;
          }
          throw verifyErr;
        }
        return;
      }

      // ── Legacy Per-Stage ZIP Path ──────────────────────────────────────────
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
        const cached = await getCachedStageArchive(nextStageNumber);
        if (cached?.blob) {
          await extractZipInBrowser(cached.blob, cleanPassword, cached.allowedCopyFilename);
          await queueAndProceed();
          return;
        }
        throw accessErr;
      }

      let zipBlob: Blob;
      try {
        const storageRes = await fetch(accessData.downloadUrl);
        if (!storageRes.ok) {
          throw new Error('Failed to retrieve next stage archive from storage.');
        }
        zipBlob = await storageRes.blob();
        void saveStageArchive(nextStageNumber, zipBlob, {
          title: nextStageTitle,
          allowedCopyFilename: accessData.allowedCopyFilename,
        });
      } catch (storageErr) {
        const cached = await getCachedStageArchive(nextStageNumber);
        if (cached?.blob) {
          zipBlob = cached.blob;
        } else {
          throw storageErr;
        }
      }

      try {
        await extractZipInBrowser(zipBlob, cleanPassword, accessData.allowedCopyFilename);
      } catch {
        let serverCooldown = 0;
        let serverError = 'Invalid stage key. Verification failed.';
        try {
          const attemptRes = await fetch('/api/stage/password-attempt', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken, stageNumber: nextStageNumber, action: 'failed' }),
          });
          const attemptData = await attemptRes.json();
          serverCooldown = attemptData.cooldownSeconds || 0;
          if (attemptData.error) serverError = attemptData.error;
        } catch {}

        applyFailureCooldown(serverCooldown, serverError);
        setValidating(false);
        return;
      }

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
          if (submitData.cooldownSeconds > 0) {
            setCooldownSeconds(submitData.cooldownSeconds);
          }
          throw new Error(submitData.error || submitData.message || 'Stage key verification failed.');
        }

        const pointsAwarded = submitData.scoreAwarded || points;
        localFailedAttemptsRef.current = 0;
        setCooldownSeconds(0);
        setPassword('');

        try {
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#e2e8f0', '#34d399', '#f59e0b'],
          });
        } catch {}

        setSuccessMessage(`Stage ${nextStageNumber} Key Verified! +${pointsAwarded} PTS awarded.`);

        if (successTimerRef.current) clearTimeout(successTimerRef.current);
        successTimerRef.current = setTimeout(() => {
          setPassword('');
          onUnlockSuccess(
            nextStageNumber,
            cleanPassword,
            pointsAwarded,
            accessData.downloadUrl
          );
          handleClose();
        }, 1100);
      } catch (submitErr: any) {
        if (!navigator.onLine || submitErr.name === 'TypeError' || submitErr.message?.includes('fetch')) {
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
      onClick={handleClose}
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
            onClick={handleClose}
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

        {/* Live Cooldown Active Banner */}
        {cooldownSeconds > 0 && (
          <div className="p-3 text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-xl font-mono flex items-center justify-between shadow-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 animate-spin" />
              <span className="font-semibold">Rate Limit: Wait before retry</span>
            </div>
            <span className="font-extrabold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-lg border border-amber-500/40 text-xs">
              {cooldownSeconds}s
            </span>
          </div>
        )}

        {errorMessage && (
          <div className="p-3 text-xs text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl font-medium shadow-xs flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
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
                placeholder="e.g. SEV2-PAYMENT-1431"
                autoFocus
                disabled={validating || cooldownSeconds > 0}
                className="w-full bg-app-bg border border-app-border rounded-xl px-3 pr-9 py-2.5 text-xs text-app-text shadow-inner focus:border-app-accent focus:outline-none transition-colors placeholder:text-app-subtext/40 font-mono disabled:opacity-50 disabled:cursor-not-allowed"
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
              Enter the passcode found from previous stage investigation files.
            </p>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-3 border-t border-app-border">
            <button
              type="button"
              onClick={handleClose}
              disabled={validating}
              className="px-3.5 py-1.5 rounded-xl text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={validating || cooldownSeconds > 0 || !password.trim()}
              className="px-4 py-1.5 rounded-xl bg-app-accent text-app-bg text-xs font-semibold hover:opacity-95 active:scale-[0.98] shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {validating
                ? 'Verifying...'
                : cooldownSeconds > 0
                ? `Retry in ${cooldownSeconds}s`
                : 'Verify & Progress'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}