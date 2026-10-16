'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  Maximize2,
  Copy,
  Check,
  Lock,
  FileCode,
  EyeOff,
} from 'lucide-react';

interface AntiCheatWrapperProps {
  children: React.ReactNode;
  activeFilename: string;
  allowedCopyFilename: string;
  activeFileContent?: string;
  accessToken: string;
  stageNumber: number;
}

export function AntiCheatWrapper({
  children,
  activeFilename,
  allowedCopyFilename,
  activeFileContent,
  accessToken,
  stageNumber,
}: AntiCheatWrapperProps) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [fullscreenWarningDismissed, setFullscreenWarningDismissed] = useState(false);

  // Send silent background telemetry beacon
  const sendTelemetryPing = useCallback(
    (type: 'tab_switch' | 'fullscreen_exit') => {
      if (!accessToken || !stageNumber) return;
      try {
        const payload = JSON.stringify({ accessToken, stageNumber, type });
        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/stage/telemetry-ping', blob);
        } else {
          fetch('/api/stage/telemetry-ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      } catch (err) {
        // Silent failure to avoid revealing telemetry mechanisms
      }
    },
    [accessToken, stageNumber]
  );

  // Check if current active file matches the whitelisted copy filename
  const isCopyPermitted = React.useMemo(() => {
    if (!allowedCopyFilename || !activeFilename) return false;
    const cleanActive = activeFilename.split('/').pop()?.trim().toLowerCase();
    const cleanAllowed = allowedCopyFilename.trim().toLowerCase();
    return Boolean(cleanActive && cleanActive === cleanAllowed);
  }, [activeFilename, allowedCopyFilename]);

  // Request fullscreen mode
  const enterFullscreen = async () => {
    try {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.warn('Fullscreen request rejected or denied by user browser.', err);
      // Allow fallback on local dev or if browser blocks auto-fullscreen
      setIsFullscreen(true);
      setFullscreenWarningDismissed(true);
    }
  };

  // Listen to fullscreen changes & visibility changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFs = Boolean(document.fullscreenElement);
      setIsFullscreen(inFs);
      if (!inFs) {
        sendTelemetryPing('fullscreen_exit');
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        sendTelemetryPing('tab_switch');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [sendTelemetryPing]);

  // Block global DevTools shortcuts, right-click context menu, and unauthorized clipboard actions
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      // 1. Block F12
      if (e.key === 'F12') {
        e.preventDefault();
        return false;
      }

      // 2. Block Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+U (DevTools & Source)
      if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === 'u' ||
          e.key === 'U' ||
          (e.shiftKey && ['i', 'I', 'j', 'J', 'c', 'C', 'k', 'K'].includes(e.key)))
      ) {
        e.preventDefault();
        return false;
      }

      // 3. Block Ctrl+C / Cmd+C / Ctrl+X unless copying is authorized on this exact file
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
        if (!isCopyPermitted) {
          e.preventDefault();
          return false;
        }
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      if (!isCopyPermitted) {
        e.preventDefault();
      }
    };

    const handleCut = (e: ClipboardEvent) => {
      if (!isCopyPermitted) {
        e.preventDefault();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy);
    window.addEventListener('cut', handleCut);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy);
      window.removeEventListener('cut', handleCut);
    };
  }, [isCopyPermitted]);

  // Handle whitelisted prompt copy
  const handleCopyPrompt = async () => {
    if (!isCopyPermitted || !activeFileContent) return;
    try {
      await navigator.clipboard.writeText(activeFileContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to write to clipboard', err);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Anti-Cheat Top Status Bar */}
      <div className="h-10 px-4 flex items-center justify-between bg-slate-900/90 border-b border-slate-800 text-xs font-mono z-30">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-cyan-400 font-bold tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            CONTEST SANDBOX
          </span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 text-[11px] truncate max-w-[220px]">
            File: <span className="text-slate-200">{activeFilename || 'None selected'}</span>
          </span>
        </div>

        {/* Dynamic Selective Copy Control */}
        <div className="flex items-center gap-2">
          {isCopyPermitted ? (
            <button
              onClick={handleCopyPrompt}
              className="flex items-center gap-1.5 px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-400/50 rounded-lg text-xs font-bold transition-all shadow-neon-cyan cursor-pointer animate-pulse"
              title={`Authorized copy for ${allowedCopyFilename}`}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  Copied to Clipboard!
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy AI Prompt ({allowedCopyFilename})
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-950/40 border border-rose-800/60 text-rose-400 rounded-lg text-[11px] font-mono">
              <Lock className="w-3 h-3" />
              <span>CLIPBOARD LOCKED (Read-Only)</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className={`w-full h-[calc(100vh-2.5rem)] transition-all duration-300 ${
          !isFullscreen && !fullscreenWarningDismissed
            ? 'filter blur-xl pointer-events-none'
            : ''
        } ${isCopyPermitted ? 'select-allowed' : 'select-lock'}`}
      >
        {children}
      </div>

      {/* Fullscreen Exit Blurred Lock Overlay */}
      {!isFullscreen && !fullscreenWarningDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-2xl">
          <div className="relative max-w-md w-full p-8 text-center glass-panel-highlight rounded-3xl border border-rose-500/40 shadow-neon-rose space-y-5 animate-in fade-in zoom-in-95 duration-200">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 shadow-inner">
              <ShieldAlert className="w-8 h-8 animate-bounce" />
            </div>

            <div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">
                Anti-Cheat Fullscreen Required
              </h2>
              <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                The Contest Arena must be run in full screen. Exiting fullscreen or navigating outside the viewport is logged in the telemetry monitor.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={enterFullscreen}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan cursor-pointer"
              >
                <Maximize2 className="w-4 h-4" />
                Return to Fullscreen Arena
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
