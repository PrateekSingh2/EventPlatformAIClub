'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldAlert,
  Maximize2,
  Lock,
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
      } catch {
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
    } catch {
      // Fallback on local dev or if browser blocks auto-fullscreen
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

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-app-bg text-app-text select-none">
      {/* Main Content Area */}
      <div
        className={`w-full h-full transition-all duration-300 ${
          !isFullscreen && !fullscreenWarningDismissed
            ? 'filter blur-xl pointer-events-none'
            : ''
        } ${isCopyPermitted ? 'select-allowed' : 'select-lock'}`}
      >
        {children}
      </div>

      {/* Fullscreen Exit Blurred Lock Overlay */}
      {!isFullscreen && !fullscreenWarningDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
          <div className="relative max-w-sm w-full p-6 text-center bg-app-surface border border-app-border rounded-lg shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 mx-auto rounded bg-app-muted border border-app-border flex items-center justify-center text-amber-500">
              <ShieldAlert className="w-6 h-6" />
            </div>

            <div>
              <h2 className="text-base font-semibold text-app-text tracking-tight">
                Anti-Cheat Fullscreen Required
              </h2>
              <p className="mt-1.5 text-xs text-app-subtext leading-relaxed">
                The Contest Arena must be run in full screen. Exiting fullscreen or navigating outside the viewport is logged in the telemetry monitor.
              </p>
            </div>

            <div className="pt-2">
              <button
                onClick={enterFullscreen}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-semibold rounded bg-app-accent text-app-bg hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
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
