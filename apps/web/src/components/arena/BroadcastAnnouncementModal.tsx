'use client';

import React from 'react';
import { Megaphone, AlertTriangle, AlertOctagon, Info, X, CheckCircle } from 'lucide-react';
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
      border: 'border-cyan-500/40',
      badge: 'OFFICIAL ANNOUNCEMENT',
      badgeClass: 'bg-cyan-900/60 text-cyan-300 border-cyan-500/40',
      glow: 'shadow-[0_20px_60px_rgba(6,182,212,0.25)]',
      icon: <Info className="w-6 h-6 text-cyan-400 shrink-0" />,
      btnClass: 'bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold',
    },
    warning: {
      border: 'border-amber-500/40',
      badge: 'TOURNAMENT ALERT',
      badgeClass: 'bg-amber-900/60 text-amber-300 border-amber-500/40',
      glow: 'shadow-[0_20px_60px_rgba(245,158,11,0.25)]',
      icon: <AlertTriangle className="w-6 h-6 text-amber-400 shrink-0" />,
      btnClass: 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold',
    },
    critical: {
      border: 'border-rose-500/50',
      badge: 'CRITICAL NOTICE',
      badgeClass: 'bg-rose-900/80 text-rose-300 border-rose-500/50',
      glow: 'shadow-[0_20px_60px_rgba(244,63,94,0.3)]',
      icon: <AlertOctagon className="w-6 h-6 text-rose-400 shrink-0" />,
      btnClass: 'bg-rose-500 hover:bg-rose-400 text-white font-bold',
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md select-none animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-app-surface border ${config.border} rounded-3xl w-full max-w-lg p-6 sm:p-7 space-y-5 ${config.glow} relative overflow-hidden animate-in zoom-in-95 duration-200`}
      >
        {/* Glowing cyber aura */}
        <div className="absolute -top-20 -right-20 w-44 h-44 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-44 h-44 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Top Header: Badge, Icon & Dismiss Cross */}
        <div className="flex items-start justify-between gap-3 relative z-10">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center shadow-xs">
              {config.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10px] font-mono font-extrabold uppercase px-2.5 py-0.5 rounded border tracking-wider ${config.badgeClass}`}
                >
                  {config.badge}
                </span>
                <span className="text-[11px] font-mono text-app-subtext">
                  {formattedTime}
                </span>
              </div>
              <h2 className="text-base sm:text-lg font-bold text-app-text tracking-tight mt-1 flex items-center gap-1.5">
                <Megaphone className="w-4 h-4 text-app-accent inline" />
                Organizer Broadcast
              </h2>
            </div>
          </div>

          {/* Top-Right Cross Button to dismiss */}
          <button
            onClick={() => onAcknowledge(announcement.id)}
            className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-xl hover:bg-app-hover transition-colors"
            title="Close and Acknowledge"
            aria-label="Dismiss Announcement"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Broadcast Message Content */}
        <div className="p-4 sm:p-5 rounded-2xl bg-app-bg/80 border border-app-border text-app-text shadow-inner text-sm sm:text-base leading-relaxed whitespace-pre-wrap font-sans relative z-10">
          {announcement.message}
        </div>

        {/* Bottom Acknowledgment Action Button */}
        <div className="flex items-center justify-between pt-2 border-t border-app-border/80 relative z-10">
          <span className="text-[11px] text-app-subtext font-mono flex items-center gap-1">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500 inline" />
            Sent by {announcement.created_by || 'Tournament Admins'}
          </span>

          <button
            onClick={() => onAcknowledge(announcement.id)}
            className={`px-5 py-2.5 rounded-xl text-xs shadow-md active:scale-[0.98] transition-all cursor-pointer flex items-center gap-1.5 ${config.btnClass}`}
          >
            <span>Acknowledge & Dismiss</span>
          </button>
        </div>
      </div>
    </div>
  );
}
