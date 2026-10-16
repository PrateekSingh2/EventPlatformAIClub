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
import { Loader2, AlertCircle } from 'lucide-react';

function ArenaContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const tokenParam = searchParams.get('token');
  const [token, setToken] = useState<string>('');
  const [user, setUser] = useState<User | null>(null);

  // Stages & Files State
  const [stages, setStages] = useState<StageManifest[]>([]);
  const [selectedStageNumber, setSelectedStageNumber] = useState<number>(1);
  const [files, setFiles] = useState<ParsedFile[]>([]);
  const [activeFile, setActiveFile] = useState<ParsedFile | null>(null);
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

  // 1. Authenticate user from token param or localStorage
  useEffect(() => {
    const activeToken = tokenParam || localStorage.getItem('participant_token') || '';
    if (!activeToken) {
      router.push('/');
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
          setError(data.error || 'Authentication token expired or invalid');
          setLoading(false);
          return;
        }

        setUser(data.user);
        setSelectedStageNumber(data.user.current_stage || 1);
      } catch (err: any) {
        setError(err.message || 'Failed to authenticate');
        setLoading(false);
      }
    };

    authenticate();
  }, [tokenParam, router]);

  // 2. Fetch stage manifest and download ZIP to RAM
  const loadStage = useCallback(
    async (stageNum: number, providedPassword?: string) => {
      if (!token) return;
      setLoading(true);
      setError(null);
      setPasswordModalError(null);

      try {
        // Fetch 60-second presigned GET URL & sanitized quiz questions
        const accessRes = await fetch('/api/stage/access-zip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: token, stageNumber: stageNum }),
        });

        const accessData = await accessRes.json();
        if (!accessRes.ok) {
          throw new Error(accessData.error || `Unable to access Stage ${stageNum}`);
        }

        setAllowedCopyFilename(accessData.allowedCopyFilename || '');

        // Fetch binary archive directly from Supabase Storage into browser RAM
        const storageRes = await fetch(accessData.downloadUrl);
        if (!storageRes.ok) {
          throw new Error('Failed to download stage archive from storage');
        }

        const blob = await storageRes.blob();
        setActiveZipBlob(blob);

        // Decompress strictly in memory
        try {
          const extractedFiles = await extractZipInBrowser(
            blob,
            providedPassword,
            accessData.allowedCopyFilename
          );

          setFiles(extractedFiles);
          if (extractedFiles.length > 0) {
            // Select first text or markdown file, or first file by default
            const defaultFile =
              extractedFiles.find((f) => f.name.toLowerCase() === accessData.allowedCopyFilename?.toLowerCase()) ||
              extractedFiles.find((f) => f.type === 'markdown' || f.type === 'text') ||
              extractedFiles[0];
            setActiveFile(defaultFile);
          } else {
            setActiveFile(null);
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
            return prev;
          });
        } catch (zipErr: any) {
          if (zipErr instanceof ZipEngineError) {
            if (zipErr.code === 'PASSWORD_REQUIRED' || zipErr.code === 'INVALID_PASSWORD') {
              setIsPasswordModalOpen(true);
              if (providedPassword) {
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
    [token]
  );

  // Trigger stage loading when user or selected stage changes
  useEffect(() => {
    if (user && token && selectedStageNumber) {
      loadStage(selectedStageNumber);
    }
  }, [user, token, selectedStageNumber, loadStage]);

  // Handler for password modal submit
  const handlePasswordSubmit = async (password: string) => {
    if (!activeZipBlob) return;
    try {
      const extractedFiles = await extractZipInBrowser(
        activeZipBlob,
        password,
        allowedCopyFilename
      );

      setFiles(extractedFiles);
      if (extractedFiles.length > 0) {
        setActiveFile(extractedFiles[0]);
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
    // Advance to next stage and immediately extract with the validated password
    setSelectedStageNumber(nextStageNumber);
    loadStage(nextStageNumber, password);
  };

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
    <AntiCheatWrapper
      activeFilename={activeFile?.name || ''}
      allowedCopyFilename={allowedCopyFilename}
      activeFileContent={activeFile?.content || ''}
      accessToken={token}
      stageNumber={selectedStageNumber}
    >
      <InBrowserIDE
        stages={stages}
        currentStageNumber={user?.current_stage || 1}
        selectedStageNumber={selectedStageNumber}
        files={files}
        activeFile={activeFile}
        allowedCopyFilename={allowedCopyFilename}
        loading={loading}
        participantName={user?.name || 'Participant'}
        totalScore={user?.total_score || 0}
        onSelectStage={(stageNum) => setSelectedStageNumber(stageNum)}
        onSelectFile={(file) => setActiveFile(file)}
        onOpenUnlockModal={() => setIsUnlockModalOpen(true)}
        onOpenLeaderboard={() => setIsLeaderboardOpen(true)}
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
      />
    </AntiCheatWrapper>
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
