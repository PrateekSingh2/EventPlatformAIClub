'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ShieldAlert,
  Maximize2,
  Lock,
  Tv2,
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

  // Multi-Monitor & Window Boundary Violation States
  const [isMultiMonitorViolation, setIsMultiMonitorViolation] = useState(false);
  const [multiMonitorViolationReason, setMultiMonitorViolationReason] = useState<string>('');
  const hasReportedMultiMonitorRef = useRef(false);
  const isDevToolsDetectedRef = useRef(false);

  // Send silent background telemetry beacon
  const sendTelemetryPing = useCallback(
    (type: 'tab_switch' | 'fullscreen_exit' | 'multi_monitor_detected') => {
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

  // Inspect Screen Details API (window.screen.isExtended), window boundaries, and detached DevTools
  const inspectDisplayAndWindowBounds = useCallback((): {
    isViolating: boolean;
    reason: string;
  } => {
    if (typeof window === 'undefined') return { isViolating: false, reason: '' };

    const screen = window.screen as any;
    const isExtended = Boolean(screen?.isExtended);

    const winX = window.screenX !== undefined ? window.screenX : (window as any).screenLeft ?? 0;
    const winY = window.screenY !== undefined ? window.screenY : (window as any).screenTop ?? 0;
    const winW = window.outerWidth;
    const winH = window.outerHeight;

    const availLeft = typeof screen.availLeft === 'number' ? screen.availLeft : 0;
    const availTop = typeof screen.availTop === 'number' ? screen.availTop : 0;
    const screenWidth = screen.width || window.innerWidth;
    const screenHeight = screen.height || window.innerHeight;
    const availWidth = screen.availWidth || screenWidth;
    const availHeight = screen.availHeight || screenHeight;

    // Tolerance for native OS resizing borders (drop-shadows, 8px DWM border)
    const TOLERANCE = 15;

    // 1. Boundary Check: window dragged across multiple monitors or off-screen
    // A. Detect if window is placed on a secondary monitor (non-zero availLeft or availTop)
    const isOnSecondaryMonitor = availLeft !== 0 || availTop !== 0;

    // B. Detect if window boundary extends outside the screen limits
    const isOutsideLeft = winX < -TOLERANCE;
    const isOutsideRight = winX + winW > screenWidth + TOLERANCE;
    const isOutsideTop = winY < -TOLERANCE;
    const isOutsideBottom = winY + winH > screenHeight + TOLERANCE;

    // C. Detect if window spans multiple monitors (larger than single monitor available space)
    const isSpanningDisplays = winW > availWidth + TOLERANCE || winH > availHeight + TOLERANCE;

    // D. Relative boundary check
    const isRelativeOutside =
      winX < availLeft - TOLERANCE ||
      winX + winW > availLeft + availWidth + TOLERANCE ||
      winY < availTop - TOLERANCE ||
      winY + winH > availTop + availHeight + TOLERANCE;

    // E. Screen Details API: if extended displays are active and window is moved
    const isExtendedMove = isExtended && (isOnSecondaryMonitor || winX !== 0 || winY !== 0 || isOutsideLeft || isOutsideRight);

    if (
      isOnSecondaryMonitor ||
      isOutsideLeft ||
      isOutsideRight ||
      isOutsideTop ||
      isOutsideBottom ||
      isSpanningDisplays ||
      isRelativeOutside ||
      isExtendedMove
    ) {
      return {
        isViolating: true,
        reason: isExtended || isOnSecondaryMonitor
          ? 'Multi-display / extended screen drag detected (Screen Details API).'
          : 'Window boundary anomaly: browser window dragged across or beyond display limits.',
      };
    }

    // 2. Detached DevTools Detection Heuristics
    // A. Persistent getter trigger
    if (isDevToolsDetectedRef.current) {
      return {
        isViolating: true,
        reason: 'DevTools opened in a detached window.',
      };
    }

    // B. Docked DevTools dimension check
    const widthDiff = window.outerWidth - window.innerWidth;
    const heightDiff = window.outerHeight - window.innerHeight;
    const isDocked = widthDiff > 160 || heightDiff > 160;
    const devtoolsOpen = isDevToolsDetectedRef.current || isDocked;
    if (isDocked) {
      return {
        isViolating: true,
        reason: 'Developer Tools inspection panel detected.',
      };
    }

    // C. Active debugger timing check (triggers when DevTools is open, docked OR detached)
    const t0 = performance.now();
    // eslint-disable-next-line no-debugger
    debugger;
    const t1 = performance.now();
    if (t1 - t0 > 100) {
      isDevToolsDetectedRef.current = true;
      return {
        isViolating: true,
        reason: 'DevTools opened in a detached window (active debugger detected).',
      };
    }

    // D. Console getter evaluation test
    try {
      const detector = new Image();
      Object.defineProperty(detector, 'id', {
        get: () => {
          isDevToolsDetectedRef.current = true;
          setIsMultiMonitorViolation(true);
          setMultiMonitorViolationReason('DevTools opened in a detached window.');
          if (!hasReportedMultiMonitorRef.current) {
            sendTelemetryPing('multi_monitor_detected');
            hasReportedMultiMonitorRef.current = true;
          }
          return '';
        },
      });
      console.debug(detector);
    } catch {
      // Ignore evaluation errors
    }

    return { isViolating: false, reason: '' };
  }, [sendTelemetryPing]);

  // Continuous monitoring: Screen Details API, window boundary tracking, and detached DevTools
  useEffect(() => {
    const runCheck = () => {
      const result = inspectDisplayAndWindowBounds();
      if (result.isViolating) {
        setIsMultiMonitorViolation(true);
        setMultiMonitorViolationReason(result.reason);

        // Immediately trigger blurred arena lock and dispatch telemetry beacon once per violation
        if (!hasReportedMultiMonitorRef.current) {
          sendTelemetryPing('multi_monitor_detected');
          hasReportedMultiMonitorRef.current = true;
        }
      }
    };

    // Run initial inspection
    runCheck();

    // Responsive heartbeat check every 250ms
    const intervalId = setInterval(runCheck, 250);

    // Event listeners
    window.addEventListener('resize', runCheck);
    window.addEventListener('mousemove', runCheck);
    window.addEventListener('blur', runCheck);
    window.addEventListener('focus', runCheck);
    document.addEventListener('visibilitychange', runCheck);

    if (window.screen && (window.screen as any).addEventListener) {
      (window.screen as any).addEventListener('change', runCheck);
    }

    // Window Management API permission change listener if supported
    if (typeof navigator !== 'undefined' && (navigator as any).permissions?.query) {
      (navigator as any).permissions
        .query({ name: 'window-management' as any })
        .then((permissionStatus: any) => {
          permissionStatus.addEventListener('change', runCheck);
        })
        .catch(() => {});
    }

    return () => {
      clearInterval(intervalId);
      window.removeEventListener('resize', runCheck);
      window.removeEventListener('mousemove', runCheck);
      window.removeEventListener('blur', runCheck);
      window.removeEventListener('focus', runCheck);
      document.removeEventListener('visibilitychange', runCheck);
      if (window.screen && (window.screen as any).removeEventListener) {
        (window.screen as any).removeEventListener('change', runCheck);
      }
    };
  }, [inspectDisplayAndWindowBounds, sendTelemetryPing]);

  // Handler to clear multi-monitor lock once participant re-aligns to primary display
  const handleResolveMultiMonitor = async () => {
    isDevToolsDetectedRef.current = false;
    const result = inspectDisplayAndWindowBounds();
    if (!result.isViolating) {
      setIsMultiMonitorViolation(false);
      setMultiMonitorViolationReason('');
      hasReportedMultiMonitorRef.current = false;
      await enterFullscreen();
    } else {
      setMultiMonitorViolationReason(
        `${result.reason} Please reposition the browser inside your single primary display and close detached tools.`
      );
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
        setIsMultiMonitorViolation(true);
        setMultiMonitorViolationReason('DevTools shortcut attempt detected (F12).');
        if (!hasReportedMultiMonitorRef.current) {
          sendTelemetryPing('multi_monitor_detected');
          hasReportedMultiMonitorRef.current = true;
        }
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
        setIsMultiMonitorViolation(true);
        setMultiMonitorViolationReason('DevTools shortcut attempt detected.');
        if (!hasReportedMultiMonitorRef.current) {
          sendTelemetryPing('multi_monitor_detected');
          hasReportedMultiMonitorRef.current = true;
        }
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
  }, [isCopyPermitted, sendTelemetryPing]);

  // Combined lock state: active if either multi-monitor violation is detected or fullscreen is exited
  const isBlurredArenaLocked =
    isMultiMonitorViolation || (!isFullscreen && !fullscreenWarningDismissed);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-app-bg text-app-text select-none">
      {/* Main Content Area: dynamically blurred and locked */}
      <div
        className={`w-full h-full transition-all duration-300 ${
          isBlurredArenaLocked ? 'filter blur-xl pointer-events-none' : ''
        } ${isCopyPermitted ? 'select-allowed' : 'select-lock'}`}
      >
        {children}
      </div>

      {/* 1. Multi-Monitor & Detached Window Blurred Arena Lock Modal */}
      {isMultiMonitorViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="relative max-w-md w-full p-6 text-center bg-app-surface border border-rose-500/40 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-950/60 border border-rose-500/40 flex items-center justify-center text-rose-400 shadow-neon-rose">
              <Tv2 className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-rose-950/80 border border-rose-500/50 text-rose-300">
                <ShieldAlert className="w-3 h-3 text-rose-400" />
                Anti-Cheat Lock: Multi-Display Violation
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Multi-Monitor / Detached Window Detected
              </h2>
              <p className="text-xs text-app-subtext leading-relaxed">
                The Contest Arena must be run on a single primary display. Dragging windows across multiple monitors, utilizing extended displays, or opening detached DevTools windows is strictly prohibited.
              </p>
              {multiMonitorViolationReason && (
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-[11px] font-mono text-rose-300 text-left">
                  <strong>Trigger:</strong> {multiMonitorViolationReason}
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-app-muted/60 border border-app-border text-[10px] font-mono text-slate-400 text-left space-y-1">
              <div>&bull; Event telemetry logged as <span className="text-amber-400 font-bold">multi_monitor_detected</span>.</div>
              <div>&bull; Position this window fully inside your primary monitor.</div>
              <div>&bull; Close any detached inspection or developer windows.</div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleResolveMultiMonitor}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-500 text-white transition-colors cursor-pointer shadow-lg shadow-rose-950"
              >
                <Maximize2 className="w-4 h-4" />
                Re-align to Single Display Arena
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. Fullscreen Exit Blurred Arena Lock Modal */}
      {!isMultiMonitorViolation && !isFullscreen && !fullscreenWarningDismissed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="relative max-w-sm w-full p-6 text-center bg-app-surface border border-app-border rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 mx-auto rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-amber-500 shadow-xs">
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
