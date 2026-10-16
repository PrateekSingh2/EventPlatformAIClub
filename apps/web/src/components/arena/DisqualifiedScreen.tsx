'use client';

import React from 'react';
import { ShieldAlert, AlertOctagon, Mail, Ban, RotateCcw } from 'lucide-react';
import { User } from '@/lib/types';

interface DisqualifiedScreenProps {
  user: User | null;
  reason?: string | null;
}

export function DisqualifiedScreen({ user, reason }: DisqualifiedScreenProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-100 font-sans selection:bg-rose-500 selection:text-white">
      <div className="w-full max-w-lg p-8 glass-panel rounded-2xl border border-rose-500/50 shadow-2xl space-y-6 text-center relative overflow-hidden bg-rose-950/20">
        {/* Glow */}
        <div className="absolute -top-20 -left-20 w-44 h-44 bg-rose-600/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-44 h-44 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="inline-flex p-4 rounded-2xl bg-rose-500/15 border border-rose-500/40 text-rose-400 shadow-lg">
          <Ban className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold tracking-wider uppercase bg-rose-950 border border-rose-600 text-rose-300">
            <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
            DISQUALIFICATION SANCTION APPLIED
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Account Suspended for Fair-Play Violations
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 max-w-md mx-auto leading-relaxed">
            Your participant credentials have been revoked by tournament administrators due to confirmed
            anti-cheat flags, suspicious speed-run telemetry, or tournament rule infractions.
          </p>
        </div>

        {/* Reason card */}
        <div className="p-4 rounded-xl bg-slate-900/90 border border-rose-900/40 text-left space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-bold flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5" />
            Official Reason / Flag Notice:
          </div>
          <p className="text-xs text-slate-200 font-mono">
            {reason || user?.disqualification_reason || 'Unusual behavioral telemetry and anti-cheat threshold violations.'}
          </p>
        </div>

        {/* Participant Identification */}
        {user && (
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 text-left text-xs font-mono text-slate-400 flex justify-between items-center">
            <div>
              <span className="text-white font-semibold">{user.name}</span> &bull; {user.email}
            </div>
            <span className="text-[10px] text-rose-400 font-bold uppercase">REVOKED</span>
          </div>
        )}

        {/* Appeals & Contact */}
        <div className="pt-2 border-t border-slate-800 text-xs text-slate-400 space-y-2">
          <p>
            If you believe this administrative sanction was issued in error, contact the tournament organizing committee immediately:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href="mailto:contests@aiclub.org?subject=Disqualification%20Appeal"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 border border-rose-700/50 text-rose-300 text-xs font-semibold transition-all cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              <span>contests@aiclub.org</span>
            </a>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold transition-all cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-check Credentials</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
