'use client';

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { enqueueTelemetryPing, flushOfflineTelemetryQueue } from '@/lib/offline-telemetry-queue';
import {
  ShieldAlert,
  Maximize2,
  Lock,
  Tv2,
  AppWindow,
} from 'lucide-react';

interface AntiCheatWrapperProps {
  children: React.ReactNode;
  accessToken: string;
  stageNumber: number;
}

export function AntiCheatWrapper({
  children,
  accessToken,
  stageNumber,
}: AntiCheatWrapperProps) {
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [fullscreenWarningDismissed, setFullscreenWarningDismissed] = useState(false);
  const [showClipboardNotice, setShowClipboardNotice] = useState(false);
  const clipboardNoticeTimeoutRef = useRef<number | null>(null);

  // Multi-Monitor & Window Boundary Violation States
  const [isMultiMonitorViolation, setIsMultiMonitorViolation] = useState(false);
  const [multiMonitorViolationReason, setMultiMonitorViolationReason] = useState<string>('');
  const hasReportedMultiMonitorRef = useRef(false);
  const hasReportedDevToolsTimingRef = useRef(false);
  const hasReportedWindowSizeRef = useRef(false);

  // Window Switching (Alt+Tab / Win+Tab / Focus Loss) States
  const [isWindowSwitchViolation, setIsWindowSwitchViolation] = useState(false);
  const [windowSwitchViolationReason, setWindowSwitchViolationReason] = useState<string>('');
  const lastWindowSwitchTimestampRef = useRef<number>(0);

  const notifyClipboardBlocked = useCallback(() => {
    setShowClipboardNotice(true);
    if (clipboardNoticeTimeoutRef.current !== null) {
      window.clearTimeout(clipboardNoticeTimeoutRef.current);
    }
    clipboardNoticeTimeoutRef.current = window.setTimeout(() => {
      setShowClipboardNotice(false);
      clipboardNoticeTimeoutRef.current = null;
    }, 2400);
  }, []);

  // Send silent background telemetry beacon
  const sendTelemetryPing = useCallback(
    (type: 'tab_switch' | 'fullscreen_exit' | 'multi_monitor_detected' | 'devtools_timing' | 'window_size_discrepancy', latencyMs?: number) => {
      if (!accessToken || !stageNumber) return;
      const payload = {
        accessToken,
        stageNumber,
        type,
        ...(latencyMs === undefined ? {} : { latencyMs }),
      };
      void enqueueTelemetryPing(payload)
        .then(flushOfflineTelemetryQueue)
        .catch(() => {
          // If browser storage is unavailable, try a direct delivery while online.
          fetch('/api/stage/telemetry-ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(() => {});
        });
    },
    [accessToken, stageNumber]
  );

  // Flush queued telemetry after reconnect, when the arena becomes visible, and periodically.
  useEffect(() => {
    const flush = () => {
      void flushOfflineTelemetryQueue();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') flush();
    };
    const retryInterval = window.setInterval(flush, 15000);

    window.addEventListener('online', flush);
    window.addEventListener('pageshow', flush);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    flush();

    return () => {
      window.clearInterval(retryInterval);
      window.removeEventListener('online', flush);
      window.removeEventListener('pageshow', flush);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Trigger window switch violation (Alt+Tab / Win+Tab / window blur)
  const triggerWindowSwitchViolation = useCallback(
    (reason: string) => {
      const now = Date.now();
      // Debounce window switch events within 600ms to avoid firing duplicated beacons
      if (now - lastWindowSwitchTimestampRef.current < 600) {
        return;
      }
      lastWindowSwitchTimestampRef.current = now;

      setIsWindowSwitchViolation(true);
      setWindowSwitchViolationReason(reason);
      sendTelemetryPing('tab_switch');
    },
    [sendTelemetryPing]
  );

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

  // Inspect screen details and window boundaries for multi-display movement.
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

    return { isViolating: false, reason: '' };
  }, [sendTelemetryPing]);

  // Continuous monitoring: Screen Details API and window boundary tracking.
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
      if (window.screen && (window.screen as any).removeEventListener) {
        (window.screen as any).removeEventListener('change', runCheck);
      }
    };
  }, [inspectDisplayAndWindowBounds, sendTelemetryPing]);

  // Heuristic DevTools probes. These emit telemetry only; they never lock a participant.
  useEffect(() => {
    let probeLoggedAt = performance.now();

    try {
      const probe: Record<string, unknown> = {};
      Object.defineProperty(probe, 'devtoolsProbe', {
        enumerable: true,
        get: () => {
          const getterLatencyMs = performance.now() - probeLoggedAt;
          if (!hasReportedDevToolsTimingRef.current) {
            hasReportedDevToolsTimingRef.current = true;
            sendTelemetryPing('devtools_timing', getterLatencyMs);
          }
          return `probe evaluated after ${getterLatencyMs.toFixed(1)}ms`;
        },
      });
      probeLoggedAt = performance.now();
      console.log('[Arena diagnostic probe]', probe);
    } catch {
      // Console probing is best-effort and must not affect the arena.
    }

    const inspectWindowSize = () => {
      const widthDifference = window.outerWidth - window.innerWidth;
      if (widthDifference > 160 && !hasReportedWindowSizeRef.current) {
        hasReportedWindowSizeRef.current = true;
        sendTelemetryPing('window_size_discrepancy');
      } else if (widthDifference <= 160) {
        hasReportedWindowSizeRef.current = false;
      }
    };

    inspectWindowSize();
    const resizeInterval = window.setInterval(inspectWindowSize, 1000);
    window.addEventListener('resize', inspectWindowSize);

    return () => {
      window.clearInterval(resizeInterval);
      window.removeEventListener('resize', inspectWindowSize);
    };
  }, [sendTelemetryPing]);

  // Window Focus & Switching (Alt+Tab, Win+Tab, Task Switch) Detection
  useEffect(() => {
    const handleWindowBlur = () => {
      triggerWindowSwitchViolation('Window lost focus: Application switch or Alt+Tab / Win+Tab departure detected.');
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        triggerWindowSwitchViolation('Contest Arena hidden: Participant switched away from browser tab/window.');
      }
    };

    window.addEventListener('blur', handleWindowBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [triggerWindowSwitchViolation]);

  // Handler to clear multi-monitor lock once participant re-aligns to primary display
  const handleResolveMultiMonitor = async () => {
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

  // Handler to resume from window switch lock
  const handleResumeFromWindowSwitch = async () => {
    setIsWindowSwitchViolation(false);
    setWindowSwitchViolationReason('');
    await enterFullscreen();
    if (typeof window !== 'undefined') {
      window.focus();
    }
  };

  // Listen to fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFs = Boolean(document.fullscreenElement);
      setIsFullscreen(inFs);
      if (!inFs) {
        sendTelemetryPing('fullscreen_exit');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [sendTelemetryPing]);

  // Block global DevTools shortcuts, Alt+Tab / Win keys, context menu, and unauthorized clipboard actions
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

      // 3. Catch Alt+Tab, Alt+Escape, or Windows key task switching attempts
      if (e.altKey && (e.key === 'Tab' || e.key === 'Escape')) {
        e.preventDefault();
        triggerWindowSwitchViolation('Window switching shortcut detected (Alt+Tab).');
        return false;
      }

      if (e.key === 'Meta' || e.key === 'OS') {
        triggerWindowSwitchViolation('Operating system task switch key detected (Windows key).');
      }

      // 4. Block keyboard copy and cut shortcuts throughout the arena.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'C' || e.key === 'x' || e.key === 'X')) {
        e.preventDefault();
        notifyClipboardBlocked();
        return false;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Insert') {
        e.preventDefault();
        notifyClipboardBlocked();
        return false;
      }
      if (e.shiftKey && e.key === 'Delete') {
        e.preventDefault();
        notifyClipboardBlocked();
        return false;
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      notifyClipboardBlocked();
    };

    const handleCut = (e: ClipboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      notifyClipboardBlocked();
    };

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target;
      const isPasswordField =
        target instanceof HTMLInputElement &&
        (target.type === 'password' || target.dataset.pasteAllowed === 'true');

      if (!isPasswordField) {
        e.preventDefault();
        e.stopImmediatePropagation();
        notifyClipboardBlocked();
      }
    };

    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('copy', handleCopy, true);
    window.addEventListener('cut', handleCut, true);
    window.addEventListener('paste', handlePaste, true);

    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('copy', handleCopy, true);
      window.removeEventListener('cut', handleCut, true);
      window.removeEventListener('paste', handlePaste, true);
    };
  }, [notifyClipboardBlocked, sendTelemetryPing, triggerWindowSwitchViolation]);

  useEffect(() => () => {
    if (clipboardNoticeTimeoutRef.current !== null) {
      window.clearTimeout(clipboardNoticeTimeoutRef.current);
    }
  }, []);

  // Combined lock state: active if either multi-monitor violation, window switch violation, or fullscreen exit
  const isBlurredArenaLocked =
    isMultiMonitorViolation ||
    isWindowSwitchViolation ||
    (!isFullscreen && !fullscreenWarningDismissed);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-app-bg text-app-text select-none">
      {/* Main Content Area: dynamically blurred and locked */}
      <div
        className={`w-full h-full transition-all duration-300 ${
          isBlurredArenaLocked ? 'filter blur-xl pointer-events-none' : ''
        } select-lock`}
      >
        {children}
      </div>

      {showClipboardNotice && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-xl border border-amber-500/40 bg-slate-950/95 px-4 py-3 text-center text-xs font-medium text-amber-200 shadow-2xl backdrop-blur-md"
        >
          Copying is disabled. Pasting is disabled except in password fields.
        </div>
      )}

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

      {/* 2. Window Switching / Alt+Tab / Focus Loss Blurred Arena Lock Modal */}
      {!isMultiMonitorViolation && isWindowSwitchViolation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-xl animate-in fade-in duration-200">
          <div className="relative max-w-md w-full p-6 text-center bg-app-surface border border-violet-500/40 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-violet-950/60 border border-violet-500/40 flex items-center justify-center text-violet-400 shadow-neon-cyan">
              <AppWindow className="w-7 h-7" />
            </div>

            <div className="space-y-1.5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold tracking-wider uppercase bg-violet-950/80 border border-violet-500/50 text-violet-300">
                <ShieldAlert className="w-3 h-3 text-violet-400" />
                Anti-Cheat Lock: Window Switch Violation
              </div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                Window Switch / Application Departure Detected
              </h2>
              <p className="text-xs text-app-subtext leading-relaxed">
                You have navigated away from the Contest Arena. Pressing Alt+Tab, Windows+Tab, or switching to background applications is strictly prohibited during live tournament play.
              </p>
              {windowSwitchViolationReason && (
                <div className="p-2.5 rounded-xl bg-violet-950/40 border border-violet-800/60 text-[11px] font-mono text-violet-300 text-left">
                  <strong>Trigger:</strong> {windowSwitchViolationReason}
                </div>
              )}
            </div>

            <div className="p-2.5 rounded-xl bg-app-muted/60 border border-app-border text-[10px] font-mono text-slate-400 text-left space-y-1">
              <div>&bull; Event telemetry logged as <span className="text-amber-400 font-bold">tab_switches</span>.</div>
              <div>&bull; Multiple window departures will flag your account on the Telemetry Radar.</div>
              <div>&bull; Keep the Contest Arena focused at all times.</div>
            </div>

            <div className="pt-2">
              <button
                onClick={handleResumeFromWindowSwitch}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold rounded-xl bg-violet-600 hover:bg-violet-500 text-white transition-colors cursor-pointer shadow-lg shadow-violet-950"
              >
                <Maximize2 className="w-4 h-4" />
                Resume Contest Arena
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Fullscreen Exit Blurred Arena Lock Modal */}
      {!isMultiMonitorViolation && !isWindowSwitchViolation && !isFullscreen && !fullscreenWarningDismissed && (
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
