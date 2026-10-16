'use client';

import React from 'react';
import { Megaphone, AlertTriangle, AlertOctagon, Info } from 'lucide-react';
import { Announcement } from '@/lib/types';

interface BroadcastAnnouncementBannerProps {
  announcement: Announcement | null;
}

export function BroadcastAnnouncementBanner({ announcement }: BroadcastAnnouncementBannerProps) {
  if (!announcement) return null;

  const urgencyConfig = {
    info: {
      bg: 'bg-cyan-950/90 border-cyan-500/40 text-cyan-200 shadow-neon-cyan',
      icon: <Info className="w-5 h-5 text-cyan-400 flex-shrink-0 animate-pulse" />,
      badge: 'OFFICIAL ANNOUNCEMENT',
      badgeClass: 'bg-cyan-900/60 text-cyan-300 border-cyan-500/40',
    },
    warning: {
      bg: 'bg-amber-950/90 border-amber-500/40 text-amber-200 shadow-lg shadow-amber-900/40',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 animate-bounce" />,
      badge: 'TOURNAMENT ALERT',
      badgeClass: 'bg-amber-900/60 text-amber-300 border-amber-500/40',
    },
    critical: {
      bg: 'bg-rose-950/95 border-rose-500/50 text-rose-100 shadow-neon-rose',
      icon: <AlertOctagon className="w-5 h-5 text-rose-400 flex-shrink-0 animate-ping" />,
      badge: 'CRITICAL NOTICE',
      badgeClass: 'bg-rose-900/80 text-rose-300 border-rose-500/50',
    },
  };

  const config = urgencyConfig[announcement.urgency] || urgencyConfig.info;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center p-2.5 transition-all animate-in slide-in-from-top duration-300 ease-out"
    >
      <div
        className={`w-full max-w-4xl px-4 py-3 rounded-2xl border backdrop-blur-md flex items-center justify-between gap-3 shadow-2xl ${config.bg}`}
      >
        <div className="flex items-center gap-3 overflow-hidden">
          {config.icon}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2.5 min-w-0">
            <span
              className={`text-[10px] font-mono font-extrabold uppercase px-2 py-0.5 rounded border tracking-wider w-fit flex-shrink-0 ${config.badgeClass}`}
            >
              {config.badge}
            </span>
            <span className="text-xs sm:text-sm font-semibold truncate text-white">
              {announcement.message}
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-slate-400 flex-shrink-0">
          <Megaphone className="w-3 h-3 text-cyan-400" />
          <span>Broadcast Active</span>
        </div>
      </div>
    </div>
  );
}
