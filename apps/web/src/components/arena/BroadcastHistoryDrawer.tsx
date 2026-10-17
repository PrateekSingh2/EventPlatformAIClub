'use client';

import React from 'react';
import { Megaphone, AlertTriangle, AlertOctagon, Info, X, Shield, Clock } from 'lucide-react';
import { Announcement } from '@/lib/types';

interface BroadcastHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  announcements: Announcement[];
}

export function BroadcastHistoryDrawer({
  isOpen,
  onClose,
  announcements,
}: BroadcastHistoryDrawerProps) {
  if (!isOpen) return null;

  const urgencyPill = (urgency: string) => {
    switch (urgency) {
      case 'critical':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
            <AlertOctagon className="w-3 h-3 text-rose-400" />
            CRITICAL
          </span>
        );
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            ALERT
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Info className="w-3 h-3 text-cyan-400" />
            INFO
          </span>
        );
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Side Panel Drawer */}
      <div
        role="complementary"
        aria-label="Tournament Broadcast Feed"
        className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] bg-app-surface/95 backdrop-blur-2xl border-l border-app-border shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col animate-in slide-in-from-right duration-250 select-none"
      >
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-app-border flex items-center justify-between bg-app-surface/60">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs">
              <Megaphone className="w-4 h-4 text-app-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-app-text tracking-tight">
                  Broadcast Feed
                </h3>
                <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-app-muted text-app-accent border border-app-border">
                  {announcements.length} {announcements.length === 1 ? 'Message' : 'Messages'}
                </span>
              </div>
              <p className="text-[11px] text-app-subtext">Official organizer transmission stream</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-app-subtext hover:text-app-text cursor-pointer p-1.5 rounded-xl hover:bg-app-hover transition-colors"
            title="Close Feed"
            aria-label="Close Broadcast Feed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informational Sub-header */}
        <div className="px-4 py-2 bg-app-muted/40 border-b border-app-border text-[11px] text-app-subtext flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-app-accent" />
            Permanent Broadcast Log (Unclearable)
          </span>
          <span className="font-mono text-[10px] text-app-subtext/80">Realtime Synced</span>
        </div>

        {/* Message Feed (Chat-like stream, read-only) */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y-0">
          {announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-3 text-app-subtext">
              <div className="w-12 h-12 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-app-subtext">
                <Megaphone className="w-6 h-6 opacity-40" />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold text-app-text">No Broadcasts Yet</p>
                <p className="text-[11px] max-w-xs text-app-subtext">
                  Organizer announcements, stage unlock notices, and critical tournament alerts will appear here in real-time.
                </p>
              </div>
            </div>
          ) : (
            announcements.map((ann, idx) => {
              const formattedDate = new Date(ann.created_at).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
              });
              const formattedTime = new Date(ann.created_at).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={ann.id || `ann-${idx}`}
                  className="rounded-2xl border border-app-border bg-app-bg/60 p-4 space-y-2 shadow-xs hover:border-app-accent/40 transition-colors"
                >
                  {/* Chat bubble header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-app-muted border border-app-border flex items-center justify-center text-[10px] font-bold text-app-accent">
                        AI
                      </div>
                      <span className="text-xs font-bold text-app-text">
                        {ann.created_by || 'Admin'}
                      </span>
                      {urgencyPill(ann.urgency)}
                    </div>

                    <div className="flex items-center gap-1 text-[10px] font-mono text-app-subtext">
                      <Clock className="w-3 h-3 text-app-subtext/70" />
                      <span>{formattedDate} {formattedTime}</span>
                    </div>
                  </div>

                  {/* Message body in chat bubble style */}
                  <div className="p-3 rounded-xl bg-app-surface/90 border border-app-border/80 text-xs sm:text-sm text-app-text leading-relaxed whitespace-pre-wrap font-sans">
                    {ann.message}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer info notice - explicitly NO chat input */}
        <div className="p-3.5 border-t border-app-border bg-app-surface text-center">
          <p className="text-[10px] font-mono text-app-subtext">
            Official announcements only &bull; Read-only stream
          </p>
        </div>
      </div>
    </>
  );
}
