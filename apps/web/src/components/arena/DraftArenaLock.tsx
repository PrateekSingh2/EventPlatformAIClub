'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Clock, Shield, UserCheck } from 'lucide-react';
import { User, ContestSettings } from '@/lib/types';

interface DraftArenaLockProps {
  user: User | null;
  contestState: ContestSettings | null;
}

export function DraftArenaLock({ user, contestState }: DraftArenaLockProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  const startTime = contestState?.start_time ? new Date(contestState.start_time).getTime() : null;

  useEffect(() => {
    if (!startTime) {
      setTimeLeft(null);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const diff = startTime - now;

      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 });
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 bg-app-bg text-app-text font-sans">
      <div className="w-full max-w-lg p-6 sm:p-8 bg-app-surface rounded-2xl border border-app-border shadow-xl space-y-6 text-center relative overflow-hidden">
        {/* Lock badge icon */}
        <div className="inline-flex p-3.5 rounded-xl bg-app-surface-raised border border-app-border text-app-text shadow-xs">
          <Lock className="w-6 h-6" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-medium uppercase bg-app-surface-raised border border-app-border text-app-subtext">
            <Shield className="w-3.5 h-3.5" />
            Tournament Status: Draft Mode
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">
            Arena Locked &mdash; Stand By
          </h1>
          <p className="text-xs text-app-subtext max-w-sm mx-auto leading-relaxed">
            {contestState?.title || 'Pixel and Anomaly CTF'} is currently in setup mode.
            The arena and evidence files will unlock automatically when the contest goes live.
          </p>
        </div>

        {/* Countdown Timer or Stand By Notice */}
        {timeLeft ? (
          <div className="p-4 rounded-xl bg-app-surface-raised border border-app-border space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-app-subtext uppercase tracking-wider">
              <Clock className="w-3.5 h-3.5" />
              <span>Contest starts in</span>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-2.5 bg-app-surface rounded-lg border border-app-border">
                <div className="text-lg sm:text-xl font-bold font-mono text-app-text">{timeLeft.days}</div>
                <div className="text-[10px] text-app-subtext uppercase">Days</div>
              </div>
              <div className="p-2.5 bg-app-surface rounded-lg border border-app-border">
                <div className="text-lg sm:text-xl font-bold font-mono text-app-text">{timeLeft.hours}</div>
                <div className="text-[10px] text-app-subtext uppercase">Hours</div>
              </div>
              <div className="p-2.5 bg-app-surface rounded-lg border border-app-border">
                <div className="text-lg sm:text-xl font-bold font-mono text-app-text">{timeLeft.minutes}</div>
                <div className="text-[10px] text-app-subtext uppercase">Mins</div>
              </div>
              <div className="p-2.5 bg-app-surface rounded-lg border border-app-border">
                <div className="text-lg sm:text-xl font-bold font-mono text-emerald-400">{timeLeft.seconds}</div>
                <div className="text-[10px] text-app-subtext uppercase">Secs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3.5 rounded-xl bg-app-surface-raised border border-app-border flex items-center justify-center gap-2 text-xs text-app-subtext">
            <Clock className="w-4 h-4 animate-spin text-app-subtext" />
            <span>Official tournament start time will be announced shortly.</span>
          </div>
        )}

        {/* Participant Session Confirmation */}
        {user && (
          <div className="p-3.5 rounded-xl bg-app-surface-raised border border-app-border flex items-center justify-between text-left">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-app-text">{user.name}</div>
                <div className="text-[11px] font-mono text-app-subtext">{user.email}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
              READY
            </span>
          </div>
        )}

        <div className="text-[11px] text-app-subtext font-mono">
          Session connected. The arena will enter live gameplay automatically when started.
        </div>
      </div>
    </div>
  );
}
