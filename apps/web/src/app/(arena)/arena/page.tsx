'use client';

import React, { useEffect, useState, useCallback, useRef, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import { ParsedFile, StageManifest, User } from '@/lib/types';
import {
  extractZipInBrowser,
  extractStageArchiveInBrowser,
  ZipEngineError,
  pickDefaultStageFile,
} from '@/lib/zip-engine';
import { AntiCheatWrapper } from '@/components/arena/AntiCheatWrapper';
import { InBrowserIDE } from '@/components/arena/InBrowserIDE';
import { UnlockNextStageModal } from '@/components/arena/UnlockNextStageModal';
import { BypassStageModal } from '@/components/arena/BypassStageModal';
import { ZipPasswordModal } from '@/components/arena/ZipPasswordModal';
import { DraftArenaLock } from '@/components/arena/DraftArenaLock';
import { DisqualifiedScreen } from '@/components/arena/DisqualifiedScreen';
import { ContestCompletedScreen } from '@/components/arena/ContestCompletedScreen';
import { BroadcastAnnouncementModal } from '@/components/arena/BroadcastAnnouncementModal';
import { useContestLifecycle } from '@/hooks/useContestLifecycle';
import { useAdminBroadcasts } from '@/hooks/useAdminBroadcasts';
import { initializeProgressQueueListeners } from '@/lib/offline-progress-queue';
import { saveStageArchive, getCachedStageArchive, saveTokenArchive, getCachedTokenArchive, clearTokenArchive } from '@/lib/stage-cache';
import {
  resolveStageOneBlob,
  resolveNextStageZipBlob,
  extractPackGuideFilesFromOuter,
} from '@/lib/zip-engine';
import { supabase } from '@/lib/supabase';
import {
  getContestantSession,
  clearContestantSession,
  updateContestantSessionToken,
} from '@/lib/session';
import {
  Loader2,
  AlertCircle,
  ShieldAlert,
  LogOut,
  ArrowLeft,
} from 'lucide-react';

const LiveLeaderboard = dynamic(
  () => import('@/components/arena/LiveLeaderboard').then((m) => m.LiveLeaderboard),
  { ssr: false }
);

const BroadcastHistoryDrawer = dynamic(
  () => import('@/components/arena/BroadcastHistoryDrawer').then((m) => m.BroadcastHistoryDrawer),
  { ssr: false }
);

const ContestCompletionModal = dynamic(
  () => import('@/components/arena/ContestCompletionModal').then((m) => m.ContestCompletionModal),
  { ssr: false }
);

const STAGE_LIST_CACHE_KEY = 'arena_stage_list_v1';

const DEFAULT_STAGE_COUNT = 3;

function buildStagesFromArchiveCount(stageCount: number): StageManifest[] {
  const count = Math.max(1, stageCount);
  return Array.from({ length: count }, (_, i) => ({
    stageNumber: i + 1,
    title: `Stage ${i + 1}`,
    isPasswordProtected: i > 0,
    allowedCopyFilename: 'AI_TUTOR_PROMPT.txt',
    points: Math.min(100 + i * 25, 300),
  }));
}

const DEFAULT_STAGES: StageManifest[] = buildStagesFromArchiveCount(DEFAULT_STAGE_COUNT);

function ArenaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tokenParam = searchParams.get('token');
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);

  // Account Mismatch State (when token does not belong to logged in user)
  const [accountMismatch, setAccountMismatch] = useState<{
    error: string;
    sessionEmail: string;
    token: string;
  } | null>(null);

  // Initialize offline progress queue listeners
  useEffect(() => {
    const cleanup = initializeProgressQueueListeners();
    return cleanup;
  }, []);

  // Refresh user data on leaderboard sync event
  useEffect(() => {
    const handleSyncRefresh = () => {
      if (!token) return;
      const session = getContestantSession();
      if (!session) return;

      fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          userEmail: session.email,
          userName: session.name,
          userId: session.uid,
        }),
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

  // Token Archive Blob — the full outer ZIP containing all stage ZIPs
  // Fetched once per session, cached in IndexedDB, used for all stage unlocks
  const [tokenArchiveBlob, setTokenArchiveBlob] = useState<Blob | null>(null);
  const [tokenArchiveStageCount, setTokenArchiveStageCount] = useState<number>(0);
  const [usingTokenArchive, setUsingTokenArchive] = useState<boolean>(false);

  // Nested Stages & Terminal Level States
  const [isLastStage, setIsLastStage] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const nextStageZipBlobsRef = useRef<Record<number, Blob>>({});
  const [nextStageZipBlobs, setNextStageZipBlobs] = useState<Record<number, Blob>>({});

  // Unlock Next Stage Modal State
  const [isUnlockModalOpen, setIsUnlockModalOpen] = useState(false);
  const [isBypassModalOpen, setIsBypassModalOpen] = useState(false);

  // Password Modal State
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passwordModalError, setPasswordModalError] = useState<string | null>(null);

  // Leaderboard State
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);

  // UI status
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Stable refs to prevent re-render cascading loops
  const tokenRef = useRef<string | null>(token);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  const tokenArchiveBlobRef = useRef<Blob | null>(null);
  const packGuideFilesRef = useRef<ParsedFile[]>([]);
  const stageFilesMapRef = useRef<Record<number, ParsedFile[]>>({});
  const unlockedStagePasswordsRef = useRef<Record<number, string>>(unlockedStagePasswords);
  const fetchTokenArchivePromiseRef = useRef<Promise<Blob | null> | null>(null);
  const loadingStageRef = useRef<number | null>(null);

  const rememberNextStageZip = useCallback((stageNum: number, blob: Blob) => {
    nextStageZipBlobsRef.current[stageNum] = blob;
    setNextStageZipBlobs((prev) => ({ ...prev, [stageNum]: blob }));
  }, []);

  const applyTokenArchiveToSession = useCallback((blob: Blob, stageCount: number) => {
    tokenArchiveBlobRef.current = blob;
    setTokenArchiveBlob(blob);
    setTokenArchiveStageCount(stageCount);
    setUsingTokenArchive(true);
    setStages((prev) => {
      const built = buildStagesFromArchiveCount(stageCount);
      if (prev.length !== built.length) return built;
      return built.map((s) => {
        const existing = prev.find((p) => p.stageNumber === s.stageNumber);
        const keepTitle =
          existing?.title &&
          !/Neural Anomaly|Quantum Key|Master Architecture/i.test(existing.title);
        return keepTitle ? { ...s, title: existing.title } : s;
      });
    });
  }, []);

  // 1. Mandatory Login Check & Token Ownership Cross-Verification
  useEffect(() => {
    // Check if user is logged in
    const session = getContestantSession();
    const rawToken = (tokenParam || searchParams.get('tokenid') || '').trim().toUpperCase();

    if (!session || !session.email) {
      // User is NOT logged in: redirect to login page preserving any target token
      const redirectUrl = rawToken
        ? `/?token=${encodeURIComponent(rawToken)}&loginRequired=true&redirect=/arena`
        : '/?loginRequired=true&redirect=/arena';
      router.replace(redirectUrl);
      return;
    }

    const storedToken =
      typeof window !== 'undefined'
        ? (localStorage.getItem('participant_token') || '').trim().toUpperCase()
        : '';
    const activeToken = rawToken || session.assignedToken || storedToken;

    if (!activeToken) {
      // Logged in, but hasn't entered a team code yet -> redirect to home page team code entry
      router.replace('/?redirect=/arena');
      return;
    }

    setToken(activeToken);

    const authenticate = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token: activeToken,
            userEmail: session.email,
            userName: session.name,
            userId: session.uid,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.authenticated) {
          if (res.status === 403 && (data.role === 'disqualified' || data.user?.is_disqualified)) {
            setIsDisqualified(true);
            setDisqualifyReason(data.error || 'Account suspended for fair-play violations.');
            setUser(data.user || null);
            setLoading(false);
            return;
          }

          // Token mismatch: token does NOT belong to the logged-in account
          setAccountMismatch({
            error: data.error || 'Access Denied: This token is not signed for your account.',
            sessionEmail: session.email,
            token: activeToken,
          });
          setLoading(false);
          return;
        }

        if (data.user?.role === 'disqualified' || data.user?.is_disqualified) {
          setIsDisqualified(true);
          setDisqualifyReason('Account suspended for fair-play violations.');
          setUser(data.user);
          setLoading(false);
          return;
        }

        // Token is verified and belongs to this user!
        updateContestantSessionToken(activeToken);
        setUser(data.user);
        setSelectedStageNumber(data.user.current_stage || 1);

        // Stage manifest (session cache + network)
        try {
          const cacheKey = `${STAGE_LIST_CACHE_KEY}:${activeToken}`;
          let cachedRaw = sessionStorage.getItem(cacheKey);
          if (cachedRaw?.includes('Neural Anomaly')) {
            try {
              sessionStorage.removeItem(cacheKey);
            } catch {
              /* ignore */
            }
            cachedRaw = null;
          }
          if (cachedRaw) {
            try {
              const cachedStages = JSON.parse(cachedRaw) as StageManifest[];
              if (Array.isArray(cachedStages) && cachedStages.length > 0) {
                setStages(cachedStages);
              }
            } catch {
              /* ignore */
            }
          }

          const listRes = await fetch('/api/stage/list', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: activeToken }),
          });
          if (listRes.ok) {
            const listData = await listRes.json();
            if (listData.stages && listData.stages.length > 0) {
              setStages(listData.stages);
              sessionStorage.setItem(cacheKey, JSON.stringify(listData.stages));
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



  // ── Token Archive Fetcher ──────────────────────────────────────────────────
  // Fetches the outer archive ZIP once and caches it in IndexedDB + RAM.
  const fetchTokenArchive = useCallback(async (currentToken: string): Promise<Blob | null> => {
    // Check RAM ref first
    if (tokenArchiveBlobRef.current) return tokenArchiveBlobRef.current;

    // Concurrency deduplication
    if (fetchTokenArchivePromiseRef.current) {
      return fetchTokenArchivePromiseRef.current;
    }

    const fetchPromise = (async () => {
      try {
        let meta: {
          downloadUrl?: string;
          stageCount?: number;
          archiveKey?: string;
          isTokenArchive?: boolean;
          error?: string;
          message?: string;
        } | null = null;

        try {
          const res = await fetch('/api/stage/fetch-archive', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: currentToken }),
          });
          meta = await res.json().catch(() => ({}));
          if (!res.ok) {
            if (meta?.error === 'NO_TOKEN_ARCHIVE') {
              throw new Error(meta.message || 'No challenge archive is assigned to your team yet.');
            }
            if (meta?.error === 'ARCHIVE_FILE_MISSING') {
              throw new Error(
                meta.message ||
                  'Challenge ZIP is missing from storage. Contact the organizer to re-upload the pool and assign your team again.'
              );
            }
            const raw = meta?.message || meta?.error || 'Failed to fetch archive';
            if (/object not found/i.test(String(raw))) {
              throw new Error(
                'Challenge ZIP is missing from storage. Contact the organizer to re-upload the pool and assign your team again.'
              );
            }
            throw new Error(raw);
          }
        } catch (fetchErr) {
          const cached = await getCachedTokenArchive(currentToken);
          if (cached) {
            applyTokenArchiveToSession(cached.blob, cached.stageCount);
            return cached.blob;
          }
          throw fetchErr;
        }

        if (!meta?.isTokenArchive || !meta.downloadUrl) return null;

        const stageCount = Math.max(1, meta.stageCount || 1);
        const archiveKey = meta.archiveKey;

        const cached = await getCachedTokenArchive(currentToken);
        if (cached && (!archiveKey || cached.archiveKey === archiveKey)) {
          applyTokenArchiveToSession(cached.blob, cached.stageCount || stageCount);
          return cached.blob;
        }

        const storageRes = await fetch(meta.downloadUrl);
        if (!storageRes.ok) throw new Error('Failed to download archive from storage');

        const blob = await storageRes.blob();
        void saveTokenArchive(currentToken, blob, stageCount, archiveKey);
        applyTokenArchiveToSession(blob, stageCount);
        return blob;
      } finally {
        fetchTokenArchivePromiseRef.current = null;
      }
    })();

    fetchTokenArchivePromiseRef.current = fetchPromise;
    return fetchPromise;
  }, [applyTokenArchiveToSession]);

  /** Stage 1 has no password — preload into SANDBOX tree while user is on a later stage. */
  const prefetchStageOneIntoMap = useCallback(async () => {
    const currentToken = tokenRef.current;
    if (!currentToken || stageFilesMapRef.current[1]?.length) return;

    try {
      const tokenArchive = tokenArchiveBlobRef.current || (await fetchTokenArchive(currentToken));
      if (!tokenArchive) return;

      const stageBlob = await resolveStageOneBlob(tokenArchive);
      const result = await extractStageArchiveInBrowser(stageBlob, undefined, '', 1);
      const taggedFiles = result.files.map((f) => ({ ...f, stageNumber: 1 }));
      packGuideFilesRef.current = taggedFiles.filter((f) =>
        ['START_HERE.md', 'RULES_AND_SCORING.md', 'PASSWORD_FORMAT.md', 'INCIDENT_REPORT_TEMPLATE.md'].includes(
          f.name
        )
      );
      stageFilesMapRef.current[1] = taggedFiles;
      setStageFilesMap((prev) => ({ ...prev, 1: taggedFiles }));
      if (result.nextZipBlob) rememberNextStageZip(2, result.nextZipBlob);

      const titleFromReadme = result.stageTitle?.trim();
      if (titleFromReadme) {
        setStages((prev) =>
          prev.map((s) => (s.stageNumber === 1 ? { ...s, title: titleFromReadme } : s))
        );
      }
    } catch {
      /* optional prefetch */
    }
  }, [fetchTokenArchive, rememberNextStageZip]);

  useEffect(() => {
    if (!token || !tokenArchiveBlob) return;
    void prefetchStageOneIntoMap();
  }, [token, tokenArchiveBlob, prefetchStageOneIntoMap]);

  // 2. Fetch stage manifest and download ZIP to RAM
  const loadStage = useCallback(
    async (stageNum: number, providedPassword?: string) => {
      const currentToken = tokenRef.current;
      if (!currentToken) return;

      // Check if files for this stage are already decoded and cached in RAM
      const cachedStageFiles = stageFilesMapRef.current[stageNum];
      if (cachedStageFiles && cachedStageFiles.length > 0) {
        setFiles(cachedStageFiles);
        setActiveFile(cachedStageFiles[0]);
        setOpenFiles((prev) => (prev.some((f) => f.path === cachedStageFiles[0].path) ? prev : [...prev, cachedStageFiles[0]]));
        setIsPasswordModalOpen(false);
        setPasswordModalError(null);
        setLoading(false);
        // Check if next zip exists for this cached stage
        setIsLastStage(!nextStageZipBlobsRef.current[stageNum + 1] && stageNum >= tokenArchiveStageCount);
        return;
      }

      // Concurrency guard: avoid duplicate loading of the same stage
      if (loadingStageRef.current === stageNum) return;
      loadingStageRef.current = stageNum;

      setLoading(true);
      setError(null);
      setPasswordModalError(null);

      const effectivePassword = providedPassword || unlockedStagePasswordsRef.current[stageNum] || undefined;

      try {
        let tokenArchive: Blob | null = null;
        try {
          tokenArchive = await fetchTokenArchive(currentToken);
        } catch (archiveErr: any) {
          throw archiveErr;
        }

        if (tokenArchive) {
          let stageBlob: Blob;

          if (stageNum === 1) {
            stageBlob = await resolveStageOneBlob(tokenArchive);
            setActiveZipBlob(stageBlob);

            const result = await extractStageArchiveInBrowser(stageBlob, undefined, '', 1);
            const taggedFiles = result.files.map((f) => ({ ...f, stageNumber: 1 }));
            packGuideFilesRef.current = taggedFiles.filter((f) =>
              ['START_HERE.md', 'RULES_AND_SCORING.md', 'PASSWORD_FORMAT.md', 'INCIDENT_REPORT_TEMPLATE.md'].includes(
                f.name
              )
            );
            stageFilesMapRef.current[1] = taggedFiles;
            setFiles(taggedFiles);
            setStageFilesMap((prev) => ({ ...prev, [1]: taggedFiles }));

            let stageTwoBlob = result.nextZipBlob;
            if (!stageTwoBlob) {
              stageTwoBlob =
                (await resolveNextStageZipBlob(tokenArchive, 2, {
                  stagePasswords: unlockedStagePasswordsRef.current,
                })) || undefined;
            }

            const hasMoreStages = Boolean(stageTwoBlob || result.hasNextZip || tokenArchiveStageCount > 1);
            if (hasMoreStages) {
              if (stageTwoBlob) rememberNextStageZip(2, stageTwoBlob);
              setIsLastStage(false);
              setStages((prev) => {
                const s1 = prev.find((s) => s.stageNumber === 1) || {
                  stageNumber: 1,
                  title: result.stageTitle || 'Stage 1: Initial Investigation',
                  isPasswordProtected: false,
                  allowedCopyFilename: 'AI_TUTOR_PROMPT.txt',
                  points: 100,
                  hasNextStage: true,
                };
                const s2 = prev.find((s) => s.stageNumber === 2) || {
                  stageNumber: 2,
                  title: 'Stage 2',
                  isPasswordProtected: true,
                  allowedCopyFilename: 'AI_TUTOR_PROMPT.txt',
                  points: 100,
                };
                return [s1, s2];
              });
            } else {
              setIsLastStage(tokenArchiveStageCount <= 1);
            }

            const defaultFile = pickDefaultStageFile(taggedFiles);
            if (defaultFile) {
              setActiveFile(defaultFile);
              setOpenFiles([defaultFile]);
            }

            setIsPasswordModalOpen(false);
            setLoading(false);
            return;
          } else {
            // Stage N > 1: get the inner zip blob stored from previous stage extraction
            stageBlob = nextStageZipBlobsRef.current[stageNum];

            // If not directly present in ref (e.g. page refreshed into Stage N), replay extraction from stage 1
            if (!stageBlob) {
              try {
                stageBlob = (await resolveNextStageZipBlob(tokenArchive, stageNum, {
                  stagePasswords: unlockedStagePasswordsRef.current,
                })) as Blob;
                rememberNextStageZip(stageNum, stageBlob);
              } catch {
                let currentBlob = await resolveStageOneBlob(tokenArchive);
                for (let s = 1; s < stageNum; s++) {
                  const sPass = unlockedStagePasswordsRef.current[s] || (s === 1 ? undefined : '');
                  const sResult = await extractStageArchiveInBrowser(currentBlob, sPass, '', s);
                  if (sResult.nextZipBlob) {
                    currentBlob = sResult.nextZipBlob;
                    rememberNextStageZip(s + 1, sResult.nextZipBlob);
                  }
                }
                stageBlob = currentBlob;
              }
            }

            setActiveZipBlob(stageBlob);

            if (!effectivePassword) {
              setIsPasswordModalOpen(true);
              setLoading(false);
              return;
            }

            try {
              const stageCopyFile =
                stages.find((s) => s.stageNumber === stageNum)?.allowedCopyFilename || 'ai_prompt.txt';
              const result = await extractStageArchiveInBrowser(
                stageBlob,
                effectivePassword,
                stageCopyFile,
                stageNum
              );
              let taggedFiles = result.files.map((f) => ({ ...f, stageNumber: stageNum }));
              if (stageNum >= 2 && tokenArchive) {
                try {
                  if (!packGuideFilesRef.current.length) {
                    packGuideFilesRef.current = await extractPackGuideFilesFromOuter(tokenArchive);
                  }
                  const have = new Set(taggedFiles.map((f) => f.name));
                  const guides = packGuideFilesRef.current
                    .filter((g) => !have.has(g.name))
                    .map((g) => ({ ...g, stageNumber: stageNum }));
                  taggedFiles = [...guides, ...taggedFiles];
                } catch {
                  /* pack guides optional */
                }
              }
              stageFilesMapRef.current[stageNum] = taggedFiles;
              setFiles(taggedFiles);
              setStageFilesMap((prev) => ({ ...prev, [stageNum]: taggedFiles }));

              // Cache validated password
              unlockedStagePasswordsRef.current = { ...unlockedStagePasswordsRef.current, [stageNum]: effectivePassword };
              setUnlockedStagePasswords((prev) => {
                const next = { ...prev, [stageNum]: effectivePassword };
                try { sessionStorage.setItem('unlocked_stage_passwords', JSON.stringify(next)); } catch {}
                return next;
              });

              if (result.hasNextZip && result.nextZipBlob) {
                rememberNextStageZip(stageNum + 1, result.nextZipBlob);
                setIsLastStage(false);

                // Add next stage to stages manifest dynamically
                setStages((prev) => {
                  const updated = [...prev];
                  const curIdx = updated.findIndex((s) => s.stageNumber === stageNum);
                  if (curIdx >= 0) {
                    updated[curIdx] = {
                      ...updated[curIdx],
                      title: result.stageTitle || `Stage ${stageNum}`,
                      isPasswordProtected: false,
                      hasNextStage: true,
                    };
                  } else {
                    updated.push({
                      stageNumber: stageNum,
                      title: result.stageTitle || `Stage ${stageNum}`,
                      isPasswordProtected: false,
                      allowedCopyFilename: 'AI_TUTOR_PROMPT.txt',
                      points: 100,
                      hasNextStage: true,
                    });
                  }

                  if (!updated.some((s) => s.stageNumber === stageNum + 1)) {
                    updated.push({
                      stageNumber: stageNum + 1,
                      title: `Stage ${stageNum + 1}`,
                      isPasswordProtected: true,
                      allowedCopyFilename: 'AI_TUTOR_PROMPT.txt',
                      points: 100,
                    });
                  }
                  return updated.sort((a, b) => a.stageNumber - b.stageNumber);
                });
              } else {
                // No further zip found: THIS IS THE LAST STAGE!
                setIsLastStage(true);
                setStages((prev) =>
                  prev.map((s) =>
                    s.stageNumber === stageNum
                      ? {
                          ...s,
                          title: result.stageTitle || `Stage ${stageNum} (Final)`,
                          isPasswordProtected: false,
                          isLastStage: true,
                          hasNextStage: false,
                        }
                      : s
                  )
                );
              }

              const defaultFile = pickDefaultStageFile(taggedFiles);
              if (defaultFile) {
                setActiveFile(defaultFile);
                setOpenFiles([defaultFile]);
              }

              setIsPasswordModalOpen(false);
              setLoading(false);
              return;
            } catch (zipErr: any) {
              if (zipErr instanceof ZipEngineError) {
                if (zipErr.code === 'PASSWORD_REQUIRED' || zipErr.code === 'INVALID_PASSWORD') {
                  setIsPasswordModalOpen(true);
                  if (effectivePassword) setPasswordModalError('Incorrect archive password. Please try again.');
                  setLoading(false);
                  return;
                }
              }
              throw zipErr;
            }
          }
        }
      } catch (err: any) {
        const msg = err.message || 'Failed to load stage archive';
        if (/object not found/i.test(msg)) {
          setError(
            'Challenge ZIP is missing from storage. Ask the organizer to re-upload case studies in the pool and assign your team again.'
          );
        } else {
          setError(msg);
        }
      } finally {
        loadingStageRef.current = null;
        setLoading(false);
      }
    },
    [fetchTokenArchive, rememberNextStageZip, stages, tokenArchiveStageCount]
  );

  // Real-time listener for administrative disqualification & unblock / reinstatement
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
          setIsUnlockModalOpen(false);
          setIsCompleteModalOpen(false);
          setIsLastStage(false);

          // Reset stored passwords and RAM file cache
          unlockedStagePasswordsRef.current = {};
          setUnlockedStagePasswords({});
          try {
            sessionStorage.removeItem('unlocked_stage_passwords');
          } catch {}

          stageFilesMapRef.current = {};
          setStageFilesMap({});
          nextStageZipBlobsRef.current = {};
          setNextStageZipBlobs({});
          setActiveFile(null);
          setOpenFiles([]);

          // Start from beginning: Stage 1 with Score 0
          setUser((prev) =>
            prev
              ? {
                  ...prev,
                  is_disqualified: false,
                  role: 'participant',
                  is_flagged: false,
                  current_stage: 1,
                  total_score: 0,
                  is_completed: false,
                  completed_at: null,
                }
              : prev
          );

          setSelectedStageNumber(1);
          loadingStageRef.current = null;
          void loadStage(1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, loadStage]);

  // Trigger stage loading when user, token, or selected stage changes
  useEffect(() => {
    if (status === 'DRAFT') return;
    if (user && token && selectedStageNumber) {
      loadStage(selectedStageNumber);
    }
  }, [user?.id, token, selectedStageNumber, status, loadStage]);

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
      stageFilesMapRef.current[selectedStageNumber] = taggedFiles;
      setFiles(taggedFiles);
      setStageFilesMap((prev) => ({ ...prev, [selectedStageNumber]: taggedFiles }));

      // Cache password so it never asks again!
      unlockedStagePasswordsRef.current = { ...unlockedStagePasswordsRef.current, [selectedStageNumber]: password };
      setUnlockedStagePasswords((prev) => {
        const next = { ...prev, [selectedStageNumber]: password };
        try {
          sessionStorage.setItem('unlocked_stage_passwords', JSON.stringify(next));
        } catch {}
        return next;
      });

      const defaultFile = pickDefaultStageFile(taggedFiles);
      if (defaultFile) {
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
    unlockedStagePasswordsRef.current = { ...unlockedStagePasswordsRef.current, [nextStageNumber]: password };
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

  // CONTEST COMPLETED SCREEN: Lock stats and throw contestant out of arena editor
  if (user?.is_completed) {
    return (
      <>
        <ContestCompletedScreen
          user={user}
          totalStages={stages.length}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          onLogout={async () => {
            if (token) { try { await clearTokenArchive(token); } catch {} }
            tokenArchiveBlobRef.current = null;
            stageFilesMapRef.current = {};
            await clearContestantSession();
            router.push('/');
          }}
        />

        {/* Live Leaderboard Modal */}
        <LiveLeaderboard
          isOpen={isLeaderboardOpen}
          onClose={() => setIsLeaderboardOpen(false)}
          currentUserId={user?.id}
          currentUserToken={token}
          contestStatus={status}
        />
      </>
    );
  }


  // ACCOUNT MISMATCH SCREEN: Strict security barrier when direct URL token does not match user account
  if (accountMismatch) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-app-bg text-app-text font-sans selection:bg-emerald-500/20">
        <div className="p-6 sm:p-8 max-w-md w-full bg-app-surface border border-rose-500/35 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 mx-auto shadow-xs">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-bold tracking-tight text-app-text">
              Access Denied
            </h2>
            <p className="text-xs text-rose-500 dark:text-rose-400 mt-1 font-medium leading-relaxed">
              {accountMismatch.error}
            </p>
          </div>

          <div className="p-3.5 rounded-2xl bg-app-bg/70 border border-app-border text-left space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-app-subtext">Logged-In Account:</span>
              <span className="font-mono font-bold text-app-text">{accountMismatch.sessionEmail}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[11px] text-app-subtext">Target Token:</span>
              <span className="font-mono font-bold text-rose-500">{accountMismatch.token}</span>
            </div>
          </div>

          <p className="text-[11px] text-app-subtext leading-relaxed">
            This room token is not registered for your currently logged-in account. Please switch to the account this token was generated for, or enter your own team code.
          </p>

          <div className="space-y-2 pt-2">
            <button
              onClick={async () => {
                await clearContestantSession();
                router.replace(`/?token=${encodeURIComponent(accountMismatch.token)}&loginRequired=true`);
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-app-accent text-app-bg font-bold text-xs hover:opacity-95 transition-all cursor-pointer shadow-xs flex items-center justify-center space-x-2"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Log In with Matching Account</span>
            </button>

            <button
              onClick={() => router.push('/')}
              className="w-full py-2 px-4 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text text-xs font-semibold transition-all cursor-pointer flex items-center justify-center space-x-1.5"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Enter Your Team Code</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'DRAFT') {
    return <DraftArenaLock user={user} contestState={contestState} />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-app-bg text-app-text font-sans">
        <div className="p-6 sm:p-8 max-w-md w-full bg-app-surface border border-rose-500/35 rounded-3xl shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-500 mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-app-text">Access Denied</h2>
          <p className="text-xs text-app-subtext font-medium leading-relaxed">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 px-4 rounded-xl bg-app-text text-app-bg text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer min-h-[44px]"
          >
            Return to Login
          </button>
        </div>
      </div>
    );
  }

  const selectedStage = stages.find((s) => s.stageNumber === selectedStageNumber);
  const progressStage = Math.max(user?.current_stage ?? 1, selectedStageNumber);
  const nextUnlockStageNumber = progressStage + 1;

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
          teamName={user?.team_name}
          teamSize={user?.team_size}
          totalScore={user?.total_score || 0}
          contestStartedAt={user?.contest_started_at}
          isLastStage={isLastStage}
          onOpenCompleteModal={() => setIsCompleteModalOpen(true)}
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
          onOpenBypassModal={() => setIsBypassModalOpen(true)}
          bypassStageNumber={nextUnlockStageNumber}
          onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
          onLogout={async () => {
            if (token) { try { await clearTokenArchive(token); } catch {} }
            tokenArchiveBlobRef.current = null;
            stageFilesMapRef.current = {};
            await clearContestantSession();
            router.push('/');
          }}
        />

        {/* Unlock Next Stage Archive Password Modal */}
        <BypassStageModal
          isOpen={isBypassModalOpen}
          stageNumber={nextUnlockStageNumber}
          accessToken={token}
          onClose={() => setIsBypassModalOpen(false)}
          onBypassComplete={(stageNum, decryptionKey, pointsAwarded) => {
            handleUnlockSuccess(stageNum, decryptionKey, pointsAwarded, '');
            setIsBypassModalOpen(false);
          }}
        />

        <UnlockNextStageModal
          isOpen={isUnlockModalOpen}
          currentStageNumber={progressStage}
          nextStageNumber={nextUnlockStageNumber}
          nextStageTitle={`Stage ${Math.max(user?.current_stage ?? 1, selectedStageNumber) + 1}`}
          points={
            stages.find(
              (s) => s.stageNumber === Math.max(user?.current_stage ?? 1, selectedStageNumber) + 1
            )?.points || selectedStage?.points || 100
          }
          accessToken={token}
          nextStageZipBlob={
            nextStageZipBlobs[Math.max(user?.current_stage ?? 1, selectedStageNumber) + 1] ?? null
          }
          tokenArchiveBlob={usingTokenArchive ? tokenArchiveBlob : undefined}
          stagePasswords={unlockedStagePasswords}
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
          currentUser={user || undefined}
          contestStatus={status}
        />

        {/* Chat-Like Tournament Broadcast History Side Panel (Unclearable) */}
        <BroadcastHistoryDrawer
          isOpen={isBroadcastDrawerOpen}
          onClose={() => setIsBroadcastDrawerOpen(false)}
          announcements={announcementsHistory}
        />

        {/* Final Contest Completion Modal — allows participants to submit recovery phrase */}
        <ContestCompletionModal
          isOpen={isCompleteModalOpen}
          totalStages={stages.length}
          accessToken={token}
          onClose={() => setIsCompleteModalOpen(false)}
          onContestComplete={(score) => {
            setUser((prev) => (prev ? { ...prev, is_completed: true, total_score: score ?? prev.total_score } : null));
          }}
        />
      </AntiCheatWrapper>
    </>
  );
}

export default function ArenaPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen bg-app-bg text-app-text font-mono text-xs sm:text-sm">
          <Loader2 className="w-5 h-5 animate-spin mr-2.5 text-app-subtext" />
          <span>Initializing Contest Arena...</span>
        </div>
      }
    >
      <ArenaContent />
    </Suspense>
  );
}
