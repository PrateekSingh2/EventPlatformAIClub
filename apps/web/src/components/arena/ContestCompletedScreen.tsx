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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 bg-app-bg text-app-text font-sans selection:bg-zinc-800 selection:text-white relative">
      <div className="p-6 sm:p-8 max-w-md w-full bg-app-surface border border-app-border rounded-2xl shadow-xl text-center space-y-5 animate-in fade-in duration-200">
        
        {/* Trophy Celebration Icon */}
        <div className="mx-auto w-16 h-16 rounded-2xl bg-app-surface-raised border border-app-border flex items-center justify-center text-amber-400 shadow-xs">
          <Trophy className="w-8 h-8 text-amber-400" />
        </div>

        {/* Headings */}
        <div className="space-y-1">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Contest Completed &bull; Case Solved</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-app-text">
            Congratulations, {user?.name || 'Contestant'}!
          </h1>
          <p className="text-xs text-app-subtext max-w-sm mx-auto leading-relaxed">
            You have successfully cracked every challenge layer and completed the investigation.
          </p>
        </div>

        {/* Stats Locked Display */}
        <div className="grid grid-cols-2 gap-2.5 text-left">
          <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-0.5">
            <span className="text-[10px] text-app-subtext font-medium uppercase tracking-wider block">
              Final Score (Locked)
            </span>
            <span className="text-xl font-bold font-mono text-emerald-400">
              {user?.total_score || 0} <span className="text-xs text-app-subtext font-normal">PTS</span>
            </span>
          </div>

          <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-0.5">
            <span className="text-[10px] text-app-subtext font-medium uppercase tracking-wider block">
              Stages Solved
            </span>
            <span className="text-xl font-bold font-mono text-app-text">
              {totalStages} / {totalStages}
            </span>
          </div>

          <div className="col-span-2 p-3 rounded-xl bg-app-surface-raised border border-app-border space-y-1 text-xs">
            <div className="flex justify-between items-center text-app-subtext">
              <span>Team:</span>
              <span className="font-semibold text-app-text font-mono">{user?.team_name || user?.name}</span>
            </div>
            <div className="flex justify-between items-center text-app-subtext">
              <span>Completed At:</span>
              <span className="font-mono text-app-text text-[11px]">{completedDate}</span>
            </div>
            <div className="flex justify-between items-center text-app-subtext">
              <span>Status:</span>
              <span className="font-mono text-emerald-400 font-semibold flex items-center gap-1 text-[11px]">
                <Lock className="w-3 h-3" /> Verified & Locked
              </span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          {onOpenLeaderboard && (
            <button
              onClick={onOpenLeaderboard}
              className="flex-1 py-2.5 px-4 rounded-xl bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs transition-opacity cursor-pointer flex items-center justify-center space-x-1.5 min-h-[40px]"
            >
              <Trophy className="w-3.5 h-3.5" />
              <span>View Leaderboard</span>
            </button>
          )}

          {onLogout && (
            <button
              onClick={onLogout}
              className="py-2.5 px-4 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text text-xs font-medium transition-colors cursor-pointer flex items-center justify-center space-x-1.5 min-h-[40px]"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
