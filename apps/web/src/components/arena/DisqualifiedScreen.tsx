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
    <div className="flex flex-col items-center justify-center min-h-screen p-4 sm:p-6 bg-app-bg text-app-text font-sans">
      <div className="w-full max-w-lg p-6 sm:p-8 bg-app-surface rounded-2xl border border-rose-500/30 shadow-xl space-y-5 text-center relative overflow-hidden">
        
        <div className="inline-flex p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 shadow-xs">
          <Ban className="w-8 h-8" />
        </div>

        <div className="space-y-1.5">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold uppercase bg-rose-500/10 border border-rose-500/30 text-rose-400">
            <ShieldAlert className="w-3.5 h-3.5" />
            Disqualification Sanction Applied
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-app-text tracking-tight">
            Account Suspended for Fair-Play Violations
          </h1>
          <p className="text-xs text-app-subtext max-w-sm mx-auto leading-relaxed">
            Your participant credentials have been revoked by tournament administrators due to anti-cheat flags or rule infractions.
          </p>
        </div>

        {/* Reason card */}
        <div className="p-3.5 rounded-xl bg-app-surface-raised border border-app-border text-left space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-rose-400 font-semibold flex items-center gap-1.5">
            <AlertOctagon className="w-3.5 h-3.5" />
            Official Reason / Flag Notice:
          </div>
          <p className="text-xs text-app-text font-sans">
            {reason || user?.disqualification_reason || 'Unusual behavioral telemetry and anti-cheat threshold violations.'}
          </p>
        </div>

        {/* Participant Identification */}
        {user && (
          <div className="p-3 bg-app-surface-raised rounded-xl border border-app-border text-left text-xs font-mono text-app-subtext flex justify-between items-center">
            <div>
              <span className="text-app-text font-semibold">{user.name}</span> &bull; {user.email}
            </div>
            <span className="text-[10px] text-rose-400 font-semibold uppercase">REVOKED</span>
          </div>
        )}

        {/* Appeals & Contact */}
        <div className="pt-2 border-t border-app-border text-xs text-app-subtext space-y-2.5">
          <p>
            If you believe this administrative sanction was issued in error, contact the tournament organizing committee:
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <a
              href="mailto:contests@aiclub.org?subject=Disqualification%20Appeal"
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-app-surface-raised hover:bg-app-hover border border-app-border text-app-text text-xs font-medium transition-colors cursor-pointer"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>contests@aiclub.org</span>
            </a>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-app-surface-raised hover:bg-app-hover border border-app-border text-app-text text-xs font-medium transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Re-check Status</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
