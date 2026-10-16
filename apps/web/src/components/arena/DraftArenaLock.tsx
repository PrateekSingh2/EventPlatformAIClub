'use client';

import React, { useState, useEffect } from 'react';
import { Lock, Clock, Shield, Sparkles, UserCheck } from 'lucide-react';
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
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black">
      <div className="w-full max-w-xl p-8 glass-panel-highlight rounded-2xl border border-cyan-500/30 shadow-2xl space-y-6 text-center relative overflow-hidden">
        {/* Glowing cyber aura */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-violet-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Lock badge icon */}
        <div className="inline-flex p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 shadow-neon-cyan animate-pulse">
          <Lock className="w-8 h-8" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-cyan-950/60 border border-cyan-500/40 text-cyan-300">
            <Shield className="w-3.5 h-3.5 text-cyan-400" />
            Tournament Status: DRAFT MODE
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Arena Locked — Stand By
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
            {contestState?.title || 'EventPlatform AI Club Contest'} is currently in setup mode.
            The tournament arena and puzzle archives will unlock automatically when the contest goes LIVE.
          </p>
        </div>

        {/* Countdown Timer or Stand By Notice */}
        {timeLeft ? (
          <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
            <div className="flex items-center justify-center gap-2 text-xs font-mono text-cyan-400 font-semibold uppercase tracking-wider">
              <Clock className="w-4 h-4" />
              Contest Starts in...
            </div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
                <div className="text-xl sm:text-2xl font-bold font-mono text-white">{timeLeft.days}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Days</div>
              </div>
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
                <div className="text-xl sm:text-2xl font-bold font-mono text-white">{timeLeft.hours}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Hours</div>
              </div>
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
                <div className="text-xl sm:text-2xl font-bold font-mono text-white">{timeLeft.minutes}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Mins</div>
              </div>
              <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800">
                <div className="text-xl sm:text-2xl font-bold font-mono text-cyan-400">{timeLeft.seconds}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-widest">Secs</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-400">
            <Clock className="w-4 h-4 text-cyan-400 animate-spin" />
            <span>Official tournament start time will be announced shortly by administrators.</span>
          </div>
        )}

        {/* Participant Session Confirmation */}
        {user && (
          <div className="p-3.5 rounded-xl bg-slate-900/40 border border-slate-800/80 flex items-center justify-between text-left">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-xs font-semibold text-white">{user.name}</div>
                <div className="text-[10px] font-mono text-slate-400">{user.email}</div>
              </div>
            </div>
            <span className="text-[10px] font-mono px-2 py-1 rounded bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 font-bold">
              AUTHENTICATED &bull; READY
            </span>
          </div>
        )}

        <div className="text-[11px] text-slate-500 font-mono">
          You are securely connected. Do not close this tab; the arena will refresh into live gameplay automatically.
        </div>
      </div>
    </div>
  );
}
