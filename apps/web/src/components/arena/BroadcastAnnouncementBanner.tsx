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
      bg: 'bg-app-surface border-app-border text-app-text',
      icon: <Info className="w-4 h-4 text-app-accent flex-shrink-0" />,
      badge: 'ANNOUNCEMENT',
      badgeClass: 'bg-app-surface-raised text-app-text border-app-border',
    },
    warning: {
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
      badge: 'TOURNAMENT ALERT',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    },
    critical: {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-300',
      icon: <AlertOctagon className="w-4 h-4 text-rose-400 flex-shrink-0" />,
      badge: 'CRITICAL NOTICE',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
    },
  };

  const config = urgencyConfig[announcement.urgency] || urgencyConfig.info;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-center p-2.5 transition-all animate-in slide-in-from-top duration-200"
    >
      <div
        className={`w-full max-w-3xl px-3.5 py-2.5 rounded-xl border backdrop-blur-md flex items-center justify-between gap-3 shadow-lg ${config.bg}`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden">
          {config.icon}
          <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
            <span
              className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border tracking-wider w-fit shrink-0 ${config.badgeClass}`}
            >
              {config.badge}
            </span>
            <span className="text-xs sm:text-sm font-medium truncate">
              {announcement.message}
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-[10px] font-mono text-app-subtext shrink-0">
          <Megaphone className="w-3 h-3" />
          <span>Live Broadcast</span>
        </div>
      </div>
    </div>
  );
}
