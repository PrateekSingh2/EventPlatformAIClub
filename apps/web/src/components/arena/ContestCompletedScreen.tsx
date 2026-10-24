'use client';

import React from 'react';
import { User } from '@/lib/types';
import { Trophy, ShieldCheck, Lock, LogOut, CheckCircle2 } from 'lucide-react';

interface ContestCompletedScreenProps {
  user: User | null;
  totalStages?: number;
  onOpenLeaderboard?: () => void;
  onLogout?: () => void;
}

export function ContestCompletedScreen({
  user,
  totalStages = 12,
  onOpenLeaderboard,
  onLogout,
}: ContestCompletedScreenProps) {
  const completedDate = user?.completed_at
    ? new Date(user.completed_at).toLocaleString()
    : new Date().toLocaleString();

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 bg-app-bg text-app-text font-sans selection:bg-amber-500/20 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/3 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/3 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      <div className="p-6 sm:p-10 max-w-lg w-full bg-app-surface/90 backdrop-blur-2xl border border-amber-500/30 rounded-3xl shadow-[0_20px_60px_rgba(0,0,0,0.6)] text-center space-y-6 relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Trophy Celebration Icon */}
        <div className="relative mx-auto w-20 h-20 flex items-center justify-center">
          <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-amber-500/20 to-yellow-400/30 blur-md animate-pulse" />
          <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-transparent border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-xl relative z-10">
            <Trophy className="w-10 h-10 text-amber-400" />
          </div>
          <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-app-surface flex items-center justify-center text-slate-950 z-20">
            <CheckCircle2 className="w-4 h-4 text-white" />
          </div>
        </div>

        {/* Headings */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-mono font-bold uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
            <span>Contest Completed • Investigation Solved</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            Congratulations, {user?.name || 'Agent'}!
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-sm mx-auto leading-relaxed">
            You have successfully cracked every nested evidence layer and solved the case study.
          </p>
        </div>

        {/* Stats Locked Display */}
        <div className="grid grid-cols-2 gap-3 text-left">
          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">
              Final Score (Locked)
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-emerald-400">
              {user?.total_score || 0} <span className="text-xs text-slate-400 font-normal">PTS</span>
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1">
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider block">
              Stages Conquered
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono text-cyan-400">
              {totalStages} / {totalStages}
            </span>
          </div>

          <div className="col-span-2 p-3.5 rounded-2xl bg-white/[0.03] border border-white/10 space-y-1 text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Team / Contestant:</span>
              <span className="font-semibold text-white font-mono">{user?.team_name || user?.name}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">Completed At:</span>
              <span className="font-mono text-amber-300 text-[11px]">{completedDate}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-400">State:</span>
              <span className="font-mono text-emerald-400 font-bold flex items-center gap-1 text-[11px]">
                <Lock className="w-3 h-3 text-emerald-400" />
                VERIFIED & LOCKED
              </span>
            </div>
          </div>
        </div>

        {/* Lock Notice */}
        <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300/90 leading-relaxed text-left flex items-start space-x-2.5">
          <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <span>
            Your game session has concluded. Your final standing is permanently locked on the tournament leaderboard to maintain fair play. Workspace access is now disabled.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          {onOpenLeaderboard && (
            <button
              onClick={onOpenLeaderboard}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_14px_rgba(245,158,11,0.35)] flex items-center justify-center space-x-2"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span>View Tournament Leaderboard</span>
            </button>
          )}

          <button
            onClick={() => {
              if (onLogout) {
                onLogout();
              } else {
                localStorage.removeItem('participant_token');
                window.location.href = '/';
              }
            }}
            className="w-full py-2.5 px-4 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1.5"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit &amp; Log Out</span>
          </button>
        </div>

      </div>
    </div>
  );
}
