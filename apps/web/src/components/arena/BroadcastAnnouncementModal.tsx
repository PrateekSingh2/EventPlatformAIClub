'use client';

import React from 'react';
import { Megaphone, AlertTriangle, AlertOctagon, Info, X } from 'lucide-react';
import { Announcement } from '@/lib/types';

interface BroadcastAnnouncementModalProps {
  announcement: Announcement | null;
  onAcknowledge: (id?: string) => void;
}

export function BroadcastAnnouncementModal({
  announcement,
  onAcknowledge,
}: BroadcastAnnouncementModalProps) {
  if (!announcement) return null;

  const urgencyConfig = {
    info: {
      border: 'border-app-border',
      badge: 'OFFICIAL ANNOUNCEMENT',
      badgeClass: 'bg-app-surface-raised text-app-text border-app-border',
      icon: <Info className="w-5 h-5 text-app-text shrink-0" />,
      btnClass: 'bg-app-text text-app-bg hover:opacity-90',
    },
    warning: {
      border: 'border-amber-500/40',
      badge: 'TOURNAMENT ALERT',
      badgeClass: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      icon: <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />,
      btnClass: 'bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold',
    },
    critical: {
      border: 'border-rose-500/50',
      badge: 'CRITICAL NOTICE',
      badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/50',
      icon: <AlertOctagon className="w-5 h-5 text-rose-400 shrink-0" />,
      btnClass: 'bg-rose-600 hover:bg-rose-500 text-white font-semibold',
    },
  };

  const config = urgencyConfig[announcement.urgency] || urgencyConfig.info;

  const formattedTime = new Date(announcement.created_at).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={() => onAcknowledge(announcement.id)}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm select-none animate-in fade-in duration-150"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-app-surface border ${config.border} rounded-2xl w-full max-w-md p-5 sm:p-6 space-y-4 shadow-2xl relative overflow-hidden`}
      >
        {/* Top Header: Badge, Icon & Dismiss Cross */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-app-surface-raised border border-app-border flex items-center justify-center shadow-xs">
              {config.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-semibold uppercase px-2 py-0.5 rounded border tracking-wider ${config.badgeClass}`}
                >
                  {config.badge}
                </span>
                <span className="text-[11px] font-mono text-app-subtext">
                  {formattedTime}
                </span>
              </div>
              <h2 className="text-sm sm:text-base font-bold text-app-text tracking-tight mt-0.5 flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-app-subtext inline" />
                <span>Organizer Broadcast</span>
              </h2>
            </div>
          </div>

          <button
            onClick={() => onAcknowledge(announcement.id)}
            className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-lg hover:bg-app-hover transition-colors"
            title="Close and Acknowledge"
            aria-label="Dismiss Announcement"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Message Content Body */}
        <div className="p-3.5 sm:p-4 rounded-xl bg-app-surface-raised border border-app-border text-xs sm:text-sm text-app-text font-sans leading-relaxed whitespace-pre-wrap select-text">
          {announcement.message}
        </div>

        {/* Action Button: Acknowledge & Continue */}
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-[11px] text-app-subtext">
            Broadcast from Tournament Director
          </span>

          <button
            onClick={() => onAcknowledge(announcement.id)}
            className={`px-4 py-2 rounded-xl text-xs transition-opacity cursor-pointer flex items-center gap-1.5 min-h-[38px] ${config.btnClass}`}
          >
            <span>Acknowledge & Continue</span>
          </button>
        </div>
      </div>
    </div>
  );
}
