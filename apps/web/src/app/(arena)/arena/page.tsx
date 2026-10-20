'use client';

import React, { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { ParsedFile, StageManifest, SanitizedQuizQuestion, User } from '@/lib/types';
import { extractZipInBrowser, ZipEngineError } from '@/lib/zip-engine';
import { AntiCheatWrapper } from '@/components/arena/AntiCheatWrapper';
import { InBrowserIDE } from '@/components/arena/InBrowserIDE';
import { UnlockNextStageModal } from '@/components/arena/UnlockNextStageModal';
import { LiveLeaderboard } from '@/components/arena/LiveLeaderboard';
import { ZipPasswordModal } from '@/components/arena/ZipPasswordModal';
import { DraftArenaLock } from '@/components/arena/DraftArenaLock';
import { DisqualifiedScreen } from '@/components/arena/DisqualifiedScreen';
import { BroadcastAnnouncementModal } from '@/components/arena/BroadcastAnnouncementModal';
import { BroadcastHistoryDrawer } from '@/components/arena/BroadcastHistoryDrawer';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { useAdminBroadcasts } from '@/hooks/useAdminBroadcasts';
import { initializeProgressQueueListeners } from '@/lib/offline-progress-queue';
import { saveStageArchive, getCachedStageArchive } from '@/lib/stage-cache';
import { supabase } from '@/lib/supabase';
import { Loader2, AlertCircle } from 'lucide-react';

const DEFAULT_STAGES: StageManifest[] = [
  {
    stageNumber: 1,
    title: 'Neural Anomaly Extraction & Data Decryption',
    isPasswordProtected: false,
    allowedCopyFilename: 'ai_prompt.txt',
    points: 100,
  },
  {
    stageNumber: 2,
    title: 'Quantum Key Distribution Protocol',
    isPasswordProtected: true,
    allowedCopyFilename: 'ai_prompt_stage2.txt',
    points: 150,
  },
  {
    stageNumber: 3,
    title: 'Master Architecture Unlocked',
    isPasswordProtected: true,
    allowedCopyFilename: 'ai_prompt_stage3.txt',
    points: 200,
  },
];

function ArenaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tokenParam = searchParams.get('token');
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);

  // Initialize offline progress queue listeners
  useEffect(() => {
    const cleanup = initializeProgressQueueListeners();
    return cleanup;
  }, []);

  // Refresh user data on leaderboard sync event
  useEffect(() => {
    const handleSyncRefresh = () => {
      if (!token) return;
      fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.authenticated && data.user) {
            setUser(data.user);
          }
        })
        .catch(() => {});
    };
    window.addEventListener('leaderboard-refresh', handleSyncRefresh);
    return () => window.removeEventListener('leaderboard-refresh', handleSyncRefresh);
  }, [token]);

  // Contest Lifecycle & Announcements Hooks
  const { contestState, loading: contestLoading, status } = useContestLifecycle();
  const {
    activeAnnouncement,
    announcementsHistory,
    acknowledgeAnnouncement,
    unreadCount,
  } = useAdminBroadcasts();
  const [isBroadcastDrawerOpen, setIsBroadcastDrawerOpen] = useState(false);

  // Cached passwords for unlocked stages (prevents re-prompting)
  const [unlockedStagePasswords, setUnlockedStagePasswords] = useState<Record<number, string>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const stored = sessionStorage.getItem('unlocked_stage_passwords');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  // Disqualification State
  const [isDisqualified, setIsDisqualified] = useState(false);
  const [disqualifyReason, setDisqualifyReason] = useState<string | null>(null);

  // Stages & Files State
  const [stages, setStages] = useState<StageManifest[]>(DEFAULT_STAGES);
  const [stageFilesMap, setStageFilesMap] = useState<Record<number, ParsedFile[]>>({});
  const [selectedStageNumber, setSelectedStageNumber] = useState<number>(1);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [activeFile, setActiveFile] = useState<ParsedFile | null>(null);
  const [openFiles, setOpenFiles] = useState<ParsedFile[]>([]);
  const [allowedCopyFilename, setAllowedCopyFilename] = useState<string>('');

  // Active Stage ZIP Blob held in RAM
  const [activeZipBlob, setActiveZipBlob] = useState<Blob | null>(null);

  // Unlock Next Stage Modal State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);

  // Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordModalError, setPasswordModalError] = useState<string | null>(null);

  // Leaderboard State
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // UI status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Authenticate user from token param or localStorage with mandatory login check
  useEffect(() => {
    const rawToken = tokenParam || searchParams.get('tokenid') || '';
    const storedToken = typeof window !== 'undefined' ? (localStorage.getItem('participant_token') || '') : '';
    const activeToken = (rawToken || storedToken).trim().toUpperCase();

    if (!activeToken) {
      router.replace('/?loginRequired=true&redirect=/arena');
      return;
    }

    setToken(activeToken);
    localStorage.setItem('participant_token', activeToken);

    const authenticate = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: activeToken }),
        });

        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          if (res.status === 403 || data.role === 'disqualified' || data.user?.is_disqualified) {
            setIsDisqualified(true);
            setDisqualifyReason(data.error || 'Account suspended for fair-play violations.');
            setUser(data.user || null);
            setLoading(false);
            return;
          }
          // Only redirect to login if token is actually rejected
          router.replace('/?loginRequired=true&redirect=/arena');
          return;
        }

        if (data.user?.role === 'disqualified' || data.user?.is_disqualified) {
          setIsDisqualified(true);
          setDisqualifyReason('Account suspended for fair-play violations.');
          setUser(data.user);
          setLoading(false);
          return;
        }

        // Mark session active so contestant is never prompted again on reload or state transition
        sessionStorage.setItem('contestant_session_active', 'true');
        setUser(data.user);
        setSelectedStageNumber(data.user.current_stage || 1);

        // Fetch all stages manifest for VS Code explorer sidebar
        try {
          const listRes = await fetch('/api/stage/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: activeToken }),
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.stages && listData.stages.length > 0) {
              setStages(listData.stages);
            }
          }
        } catch {
          // Keep default stages on error
        }
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate');
        setLoading(false);
      }
    };

    authenticate();
  }, [tokenParam, searchParams, router]);

  // Real-time listener for administrative disqualification
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`participant-status-${user.id}`)
      .on('broadcast', { event: 'disqualified' }, (payload: any) => {
        if (payload?.payload?.userId === user.id) {
          setIsDisqualified(true);
          setDisqualifyReason(payload?.payload?.reason || 'Administrative disqualification applied.');
        }
      })
      .on('broadcast', { event: 'reinstated' }, (payload: any) => {
        if (payload?.payload?.userId === user.id) {
          setIsDisqualified(false);
          setDisqualifyReason(null);
          setPasswordModalError(null);
          setUser((prev) => (prev ? { ...prev, is_disqualified: false, role: 'participant', is_flagged: false } : prev));
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  // 2. Fetch stage manifest and download ZIP to RAM
  const loadStage = useCallback(
    async (stageNum: number, providedPassword?: string) => {
      if (!token) return;

      // Check if files for this stage are already decoded and cached in RAM
      if (stageFilesMap[stageNum] && stageFilesMap[stageNum].length > 0) {
        const cachedFiles = stageFilesMap[stageNum];
        setFiles(cachedFiles);
        if (cachedFiles.length > 0) {
          setActiveFile(cachedFiles[0]);
          setOpenFiles((prev) => (prev.some((f) => f.path === cachedFiles[0].path) ? prev : [...prev, cachedFiles[0]]));
        }
        setIsPasswordModalOpen(false);
        setPasswordModalError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      setPasswordModalError(null);

      const effectivePassword = providedPassword || unlockedStagePasswords[stageNum] || undefined;

      try {
        // Fetch 60-second presigned GET URL & sanitized quiz questions
        const accessRes = await fetch('/api/stage/access-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token, stageNumber: stageNum }),
        });

        const accessData = await accessRes.json();
        if (!accessRes.ok) {
          // If contest is in draft, don't set fatal error; DraftArenaLock will handle UI
          if (accessData.error?.includes('DRAFT')) {
            setLoading(false);
            return;
          }
          throw new Error(accessData.error || `Unable to access Stage ${stageNum}`);
        }

        setAllowedCopyFilename(accessData.allowedCopyFilename || '');

        // Fetch binary archive directly from Supabase Storage into browser RAM & cache locally
        let blob: Blob;
        try {
          const storageRes = await fetch(accessData.downloadUrl);
          if (!storageRes.ok) {
            throw new Error('Failed to download stage archive from storage');
          }
          blob = await storageRes.blob();
          setActiveZipBlob(blob);
          void saveStageArchive(stageNum, blob, {
            title: accessData.title,
            allowedCopyFilename: accessData.allowedCopyFilename,
          });

          // Background prefetch next stage archive so contestants can play uninterrupted even if connection drops
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            const nextStageNum = stageNum + 1;
            void (async () => {
              try {
                const cachedNext = await getCachedStageArchive(nextStageNum);
                if (!cachedNext) {
                  const nextRes = await fetch('/api/stage/access-zip', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ accessToken: token, stageNumber: nextStageNum }),
                  });
                  if (nextRes.ok) {
                    const nextData = await nextRes.json();
                    if (nextData.downloadUrl) {
                      const nextStoreRes = await fetch(nextData.downloadUrl);
                      if (nextStoreRes.ok) {
                        const nextBlob = await nextStoreRes.blob();
                        await saveStageArchive(nextStageNum, nextBlob, {
                          title: nextData.title,
                          allowedCopyFilename: nextData.allowedCopyFilename,
                        });
                      }
                    }
                  }
                }
              } catch {}
            })();
          }
        } catch (downloadErr) {
          const cached = await getCachedStageArchive(stageNum);
          if (cached?.blob) {
            blob = cached.blob;
            setActiveZipBlob(blob);
          } else {
            throw downloadErr;
          }
        }

        // Decompress strictly in memory
        try {
          const extractedFiles = await extractZipInBrowser(
            blob,
            effectivePassword,
            accessData.allowedCopyFilename
          );

          const taggedFiles = extractedFiles.map((f) => ({ ...f, stageNumber: stageNum }));
          setFiles(taggedFiles);
          setStageFilesMap((prev) => ({ ...prev, [stageNum]: taggedFiles }));

          if (effectivePassword) {
            setUnlockedStagePasswords((prev) => {
              const next = { ...prev, [stageNum]: effectivePassword };
              try {
                sessionStorage.setItem('unlocked_stage_passwords', JSON.stringify(next));
              } catch {}
              return next;
            });
          }

          if (taggedFiles.length > 0) {
            const defaultFile =
              taggedFiles.find((f) => f.name.toLowerCase() === accessData.allowedCopyFilename?.toLowerCase()) ||
              taggedFiles.find((f) => f.type === 'markdown' || f.type === 'text') ||
              taggedFiles[0];
            setActiveFile(defaultFile);
            setOpenFiles((prev) => {
              if (prev.some((f) => f.path === defaultFile.path)) return prev;
              return [...prev, defaultFile];
            });
          } else {
            setActiveFile(null);
            setOpenFiles([]);
          }

          setIsPasswordModalOpen(false);

          // Update stages manifest list
          setStages((prev) => {
            const exists = prev.some((s) => s.stageNumber === stageNum);
            if (!exists) {
              return [
                ...prev,
                {
                  stageNumber: stageNum,
                  title: accessData.title,
                  isPasswordProtected: accessData.isPasswordProtected,
                  allowedCopyFilename: accessData.allowedCopyFilename,
                  points: accessData.points,
                },
              ].sort((a, b) => a.stageNumber - b.stageNumber);
            }
            return prev.map((s) =>
              s.stageNumber === stageNum
                ? {
                    ...s,
                    title: accessData.title || s.title,
                    isPasswordProtected: accessData.isPasswordProtected,
                    allowedCopyFilename: accessData.allowedCopyFilename || s.allowedCopyFilename,
                    points: accessData.points || s.points,
                  }
                : s
            );
          });
        } catch (zipErr: any) {
          if (zipErr instanceof ZipEngineError) {
            if (zipErr.code === 'PASSWORD_REQUIRED' || zipErr.code === 'INVALID_PASSWORD') {
              setIsPasswordModalOpen(true);
              if (effectivePassword) {
                setPasswordModalError('Incorrect archive password. Please try again.');
              }
              return;
            }
          }
          throw zipErr;
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load stage archive');
      } finally {
        setLoading(false);
      }
    },
    [token, stageFilesMap, unlockedStagePasswords]
  );

  // Trigger stage loading when user or selected stage changes
  useEffect(() => {
    if (status === 'DRAFT') return;
    if (user && token && selectedStageNumber) {
      if (stageFilesMap[selectedStageNumber] && stageFilesMap[selectedStageNumber].length > 0) {
        setFiles(stageFilesMap[selectedStageNumber]);
      } else {
        loadStage(selectedStageNumber, unlockedStagePasswords[selectedStageNumber]);
      }
    }
  }, [user, token, selectedStageNumber, status, loadStage, stageFilesMap, unlockedStagePasswords]);

  // Seamless auto-reload when contest status updates from DRAFT to LIVE or FROZEN without login prompt
  useEffect(() => {
    if (status === 'LIVE' || status === 'FROZEN') {
      setError(null);
      if (user && token && selectedStageNumber && files.length === 0) {
        loadStage(selectedStageNumber, unlockedStagePasswords[selectedStageNumber]);
      }
    }
  }, [status, user, token, selectedStageNumber, files.length, loadStage, unlockedStagePasswords]);

  // Handler for password modal submit
  const handlePasswordSubmit = async (password: string) => {
    if (!activeZipBlob) return;
    try {
      const extractedFiles = await extractZipInBrowser(
        activeZipBlob,
        password,
        allowedCopyFilename
      );

      const taggedFiles = extractedFiles.map((f) => ({ ...f, stageNumber: selectedStageNumber }));
      setFiles(taggedFiles);
      setStageFilesMap((prev) => ({ ...prev, [selectedStageNumber]: taggedFiles }));

      // Cache password so it never asks again!
      setUnlockedStagePasswords((prev) => {
        const next = { ...prev, [selectedStageNumber]: password };
        try {
          sessionStorage.setItem('unlocked_stage_passwords', JSON.stringify(next));
        } catch {}
        return next;
      });

      if (taggedFiles.length > 0) {
        setActiveFile(taggedFiles[0]);
        setOpenFiles((prev) => {
          if (prev.some((f) => f.path === taggedFiles[0].path)) return prev;
          return [...prev, taggedFiles[0]];
        });
      } else {
        setActiveFile(null);
        setOpenFiles([]);
      }
      setIsPasswordModalOpen(false);
      setPasswordModalError(null);
    } catch (err: any) {
      throw new Error(err.message || 'Decryption failed.');
    }
  };

  // Handler for successful stage archive password unlock
  const handleUnlockSuccess = (
    nextStageNumber: number,
    password: string,
    pointsAwarded: number,
    downloadUrl: string
  ) => {
    if (user) {
      setUser({
        ...user,
        total_score: (user.total_score || 0) + pointsAwarded,
        current_stage: Math.max(user.current_stage || 1, nextStageNumber),
      });
    }

    // Cache the verified password immediately so it never prompts again
    setUnlockedStagePasswords((prev) => {
      const next = { ...prev, [nextStageNumber]: password };
      try {
        sessionStorage.setItem('unlocked_stage_passwords', JSON.stringify(next));
      } catch {}
      return next;
    });

    // Advance to next stage and immediately extract with the validated password
    setSelectedStageNumber(nextStageNumber);
    loadStage(nextStageNumber, password);
  };

  if (isDisqualified || user?.role === 'disqualified' || user?.is_disqualified) {
    return <DisqualifiedScreen user={user} reason={disqualifyReason} />;
  }

  if (status === 'DRAFT') {
    return <DraftArenaLock user={user} contestState={contestState} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-100">
        <div className="p-8 max-w-md w-full glass-panel-highlight rounded-2xl border border-rose-500/40 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="text-xs text-slate-300">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="px-5 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 rounded-xl hover:bg-cyan-300 transition-all cursor-pointer"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const selectedStage = stages.find((s) => s.stageNumber === selectedStageNumber);

  return (
    <>
      {/* Center Screen Admin Broadcast Announcement Popup with Acknowledgment */}
      <BroadcastAnnouncementModal
        announcement={activeAnnouncement}
        onAcknowledge={acknowledgeAnnouncement}
      />

      <AntiCheatWrapper
        accessToken={token}
        stageNumber={selectedStageNumber}
      >
        <InBrowserIDE
          stages={stages}
          stageFilesMap={stageFilesMap}
          currentStageNumber={user?.current_stage || 1}
          selectedStageNumber={selectedStageNumber}
          files={files}
          activeFile={activeFile}
          openFiles={openFiles}
          onOpenFilesChange={setOpenFiles}
          allowedCopyFilename={allowedCopyFilename}
          loading={loading}
          participantName={user?.name || 'Participant'}
          totalScore={user?.total_score || 0}
          contestStatus={status}
          unreadBroadcastCount={unreadCount}
          onOpenBroadcastDrawer={() => setIsBroadcastDrawerOpen(true)}
          onSelectStage={(stageNum) => {
            setSelectedStageNumber(stageNum);
            if (stageFilesMap[stageNum] && stageFilesMap[stageNum].length > 0) {
              const cachedFiles = stageFilesMap[stageNum];
              setFiles(cachedFiles);
              if (!activeFile || activeFile.stageNumber !== stageNum) {
                setActiveFile(cachedFiles[0]);
                setOpenFiles((prev) => {
                  if (prev.some((f) => f.path === cachedFiles[0].path)) return prev;
                  return [...prev, cachedFiles[0]];
                });
              }
            }
          }}
          onSelectFile={(file) => {
            if (file) {
              if (file.stageNumber && file.stageNumber !== selectedStageNumber) {
                setSelectedStageNumber(file.stageNumber);
                if (stageFilesMap[file.stageNumber]) {
                  setFiles(stageFilesMap[file.stageNumber]);
                }
              }
              setActiveFile(file);
              setOpenFiles((prev) => {
                if (prev.some((f) => f.path === file.path)) return prev;
                return [...prev, file];
              });
            } else {
              setActiveFile(null);
            }
          }}
          onOpenUnlockModal={() => setIsUnlockModalOpen(true)}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          onLogout={() => {
            localStorage.removeItem('participant_token');
            router.push('/');
          }}
        />

        {/* Unlock Next Stage Archive Password Modal */}
        <UnlockNextStageModal
          isOpen={isUnlockModalOpen}
          currentStageNumber={selectedStageNumber}
          nextStageNumber={selectedStageNumber + 1}
          nextStageTitle={`Stage ${selectedStageNumber + 1}`}
          points={selectedStage?.points || 100}
          accessToken={token}
          onClose={() => setIsUnlockModalOpen(false)}
          onUnlockSuccess={handleUnlockSuccess}
        />

        {/* Archive Decryption Password Modal */}
        <ZipPasswordModal
          isOpen={isPasswordModalOpen}
          stageNumber={selectedStageNumber}
          errorMessage={passwordModalError}
          onSubmit={handlePasswordSubmit}
          onCancel={() => setIsPasswordModalOpen(false)}
        />

        {/* Live Supabase Realtime Leaderboard Drawer */}
        <LiveLeaderboard
          isOpen={isLeaderboardOpen}
          onClose={() => setIsLeaderboardOpen(false)}
          currentUserId={user?.id}
          currentUserToken={token}
          contestStatus={status}
        />

        {/* Chat-Like Tournament Broadcast History Side Panel (Unclearable) */}
        <BroadcastHistoryDrawer
          isOpen={isBroadcastDrawerOpen}
          onClose={() => setIsBroadcastDrawerOpen(false)}
          announcements={announcementsHistory}
        />
      </AntiCheatWrapper>
    </>
  );
}

export default function ArenaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-slate-950 text-cyan-400 font-mono text-sm">
          <Loader2 className="w-6 h-6 animate-spin mr-2" />
          Initializing Contest Arena...
        </div>
      }
    >
      <ArenaContent />
    </Suspense>
  );
}
