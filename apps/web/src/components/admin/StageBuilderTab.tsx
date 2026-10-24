'use client';

import React, { useState, useEffect } from 'react';
import { Stage, Contest, PreflightValidationResult } from '@/lib/types';
import { validateArchiveDecryption, extractInnerZipBlob } from '@/lib/zip-engine';
import { downloadTokensFile } from '@/lib/tokens';
import { supabase } from '@/lib/supabase';
import {
  Upload,
  Shuffle,
  Plus,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Layers,
  FileCode,
  Clock,
  Loader2,
  Check,
  FileArchive,
  KeyRound,
  AlertTriangle,
  Trophy,
  Download,
  Trash2,
  Edit3,
  Users,
  Radio,
  ArrowLeft,
  Sparkles,
  RefreshCw,
  FileSpreadsheet,
  Eye,
  EyeOff,
  Database,
  ArrowUp,
  ArrowDown,
  Wand2,
  CheckCheck,
  ShieldCheck,
} from 'lucide-react';

interface StageBuilderTabProps {
  adminSecret: string;
}

type TabMode = 'bulk' | 'list' | 'create' | 'edit';

export function StageBuilderTab({ adminSecret }: StageBuilderTabProps) {
  // Mode State: 'list' (shows all contests), 'create' (new contest), 'edit' (edit existing)
  const [mode, setMode] = useState<TabMode>('bulk');

  // Bulk Token Archives State (Option 1: Pure Multi-Stage ZIPs, Zero CSV)
  const [bulkZipFiles, setBulkZipFiles] = useState<File[]>([]);
  const [bulkStageCount, setBulkStageCount] = useState<number>(12);
  const [detectingStages, setDetectingStages] = useState(false);
  const [bulkTokenMappings, setBulkTokenMappings] = useState<string[]>([]);
  const [availableTokens, setAvailableTokens] = useState<Array<{ token: string; label: string }>>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkUploadProgress, setBulkUploadProgress] = useState<string | null>(null);
  const [bulkCommittedArchives, setBulkCommittedArchives] = useState<Array<{
    id: string;
    access_token: string;
    storage_path: string;
    stage_count: number;
    uploaded_at: string;
  }>>([]);
  const [loadingCommittedArchives, setLoadingCommittedArchives] = useState(false);

  // Contests Directory State
  const [contests, setContests] = useState<Contest[]>([]);
  const [loadingContests, setLoadingContests] = useState(false);
  const [activeEditingContestId, setActiveEditingContestId] = useState<string | null>(null);

  // Contest Metadata State
  const [contestTitle, setContestTitle] = useState('Pixel and Anomaly CTF 2026');
  const [numberOfTeams, setNumberOfTeams] = useState<number>(50);

  // Stages List in current contest
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);

  // Active Stage Form State
  const [stageNumber, setStageNumber] = useState<number>(1);
  const [title, setTitle] = useState('');
  const [s3Key, setS3Key] = useState('');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [zipPassword, setZipPassword] = useState('');
  const [allowedCopyFilename, setAllowedCopyFilename] = useState('ai_prompt.txt');
  const [minExpectedSeconds, setMinExpectedSeconds] = useState(60);
  const [points, setPoints] = useState(100);

  // Storage Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Archive Decryption Preflight State
  const [preflightResult, setPreflightResult] = useState<PreflightValidationResult | null>(null);
  const [validatingArchive, setValidatingArchive] = useState(false);

  // Save / Deploy State
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Preflight validation effect: re-runs whenever selected archive or password changes
  useEffect(() => {
    if (!uploadFile) {
      setPreflightResult(null);
      return;
    }

    let isMounted = true;
    const runValidation = async () => {
      setValidatingArchive(true);
      try {
        const result = await validateArchiveDecryption(uploadFile, zipPassword);
        if (isMounted) {
          setPreflightResult(result);
          if (result.isEncrypted && !isPasswordProtected) {
            setIsPasswordProtected(true);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setPreflightResult({
            valid: false,
            isEncrypted: false,
            fileCount: 0,
            filenames: [],
            message: err.message || 'Validation error',
            error: 'ERROR',
          });
        }
      } finally {
        if (isMounted) {
          setValidatingArchive(false);
        }
      }
    };

    runValidation();
    return () => {
      isMounted = false;
    };
  }, [uploadFile, zipPassword, isPasswordProtected]);

  // Fetch available participant & team tokens for auto-mapping
  const fetchAvailableTokens = async () => {
    setLoadingTokens(true);
    try {
      const res = await fetch('/api/admin/participants', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.participants) {
        const tokenMap = new Map<string, string>();
        for (const p of data.participants as any[]) {
          const t = (p.access_token || '').trim().toUpperCase();
          if (t && !tokenMap.has(t)) {
            const label = p.team_name ? `Team: ${p.team_name}` : p.name ? `${p.name} (${p.email})` : t;
            tokenMap.set(t, label);
          }
        }
        const tokensArray = Array.from(tokenMap.entries()).map(([token, label]) => ({ token, label }));
        setAvailableTokens(tokensArray);

        // Auto-randomize challenge archives across participants if files already loaded
        setBulkTokenMappings((prev) => {
          if (bulkZipFiles.length === 0) return prev;
          if (prev.length === bulkZipFiles.length && prev.some(Boolean)) return prev;
          const shuffled = [...tokensArray].sort(() => Math.random() - 0.5);
          return bulkZipFiles.map((_, i) => shuffled[i % shuffled.length]?.token || `TOKEN-${i + 1}`);
        });
      }
    } catch (err) {
      console.warn('Failed to fetch participant tokens for bulk mapping', err);
    } finally {
      setLoadingTokens(false);
    }
  };

  // Fetch committed token archives from the database
  const fetchCommittedArchives = async () => {
    setLoadingCommittedArchives(true);
    try {
      const res = await fetch(`/api/admin/stages/bulk-upload?adminSecret=${encodeURIComponent(adminSecret)}`, {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.archives) {
        setBulkCommittedArchives(data.archives);
      }
    } catch (err) {
      console.warn('Failed to fetch committed archives', err);
    } finally {
      setLoadingCommittedArchives(false);
    }
  };

  // Handle selection of X ZIP files + auto-detect stage count in RAM
  const handleZipFilesChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((f) => f.name.toLowerCase().endsWith('.zip'));
    // Sort files by natural alphanumeric order (1, 2, ... 9, 10)
    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    setBulkZipFiles(files);

    // Automatically randomize token assignments across all registered participants
    if (availableTokens.length > 0) {
      const shuffled = [...availableTokens].sort(() => Math.random() - 0.5);
      const randomized = files.map((_, i) => shuffled[i % shuffled.length].token);
      setBulkTokenMappings(randomized);
    } else {
      setBulkTokenMappings(files.map((_, i) => `TOKEN-${String(i + 1).padStart(3, '0')}`));
    }

    // In-browser RAM inspection: auto-detect total stage count from first archive
    if (files.length > 0) {
      setDetectingStages(true);
      try {
        const { BlobReader, ZipReader } = await import('@zip.js/zip.js');
        const reader = new ZipReader(new BlobReader(files[0]));
        const entries = await reader.getEntries();
        await reader.close();

        const stageNumbers = new Set<number>([1]);
        for (const entry of entries) {
          const zipMatch = entry.filename.match(/stage(\d+)\.zip/i);
          if (zipMatch) stageNumbers.add(parseInt(zipMatch[1], 10));

          const dirMatch = entry.filename.match(/^stage(\d+)[\/\\]/i);
          if (dirMatch) stageNumbers.add(parseInt(dirMatch[1], 10));
        }

        const detected = Math.max(...Array.from(stageNumbers));
        if (detected > 1) {
          setBulkStageCount(detected);
        }
      } catch (err) {
        console.warn('Could not inspect archive header in RAM', err);
      } finally {
        setDetectingStages(false);
      }
    }
  };

  // Randomly distribute challenge archives across all registered participants in database
  const handleRandomizeAssignments = () => {
    if (availableTokens.length === 0) {
      setStatusMessage({ type: 'error', text: 'No registered participant tokens found in database. Ingest participants first.' });
      return;
    }
    // Fisher-Yates random shuffle
    const shuffled = [...availableTokens];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const randomized = bulkZipFiles.map((_, i) => shuffled[i % shuffled.length].token);
    setBulkTokenMappings(randomized);
    setStatusMessage({
      type: 'success',
      text: `Randomly distributed ${bulkZipFiles.length} challenge archive(s) across ${availableTokens.length} registered participant(s)!`,
    });
  };

  // Move a ZIP file up or down in the roster
  const handleMoveZip = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= bulkZipFiles.length) return;

    setBulkZipFiles((prev) => {
      const updated = [...prev];
      const temp = updated[index];
      updated[index] = updated[targetIndex];
      updated[targetIndex] = temp;
      return updated;
    });
  };

  // Sort ZIP files naturally (A-Z or Z-A)
  const handleSortZips = (direction: 'asc' | 'desc') => {
    setBulkZipFiles((prev) => {
      const sorted = [...prev].sort((a, b) =>
        direction === 'asc'
          ? a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
          : b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' })
      );
      return sorted;
    });
  };

  // Execute bulk upload (Pure ZIP architecture: No CSV needed)
  const handleExecuteBulkUpload = async () => {
    if (bulkZipFiles.length === 0) {
      setStatusMessage({ type: 'error', text: 'Please select the ZIP archives to deploy.' });
      return;
    }

    const missingTokens = bulkTokenMappings.some((t, i) => i < bulkZipFiles.length && (!t || !t.trim()));
    if (missingTokens) {
      setStatusMessage({ type: 'error', text: 'All ZIP files must have an assigned access token.' });
      return;
    }

    const activeTokens = bulkTokenMappings.slice(0, bulkZipFiles.length).map((t) => t.trim().toUpperCase());
    const uniqueTokens = new Set(activeTokens);
    if (uniqueTokens.size !== activeTokens.length) {
      setStatusMessage({ type: 'error', text: 'Duplicate access tokens detected. Each ZIP file must be mapped to a unique token.' });
      return;
    }

    setBulkUploading(true);
    setStatusMessage(null);

    try {
      // 1. Request presigned upload targets
      setBulkUploadProgress(`Requesting upload credentials for ${bulkZipFiles.length} archives...`);
      const presignRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'presign',
          adminSecret,
          tokens: activeTokens,
        }),
      });

      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadTargets) {
        throw new Error(presignData.error || 'Failed to generate signed upload targets');
      }

      const targets: Array<{
        accessToken: string;
        uploadUrl: string;
        token: string;
        storagePath: string;
      }> = presignData.uploadTargets;

      // 2. Upload each ZIP file directly to Supabase Storage
      const committedPayload: Array<{
        accessToken: string;
        storagePath: string;
        stageCount: number;
      }> = [];

      for (let i = 0; i < bulkZipFiles.length; i++) {
        const file = bulkZipFiles[i];
        const target = targets[i];

        setBulkUploadProgress(
          `Uploading archive ${i + 1} of ${bulkZipFiles.length}: ${file.name} for token ${target.accessToken}...`
        );

        let uploaded = false;
        try {
          const { error: uploadErr } = await supabase.storage
            .from('stages')
            .uploadToSignedUrl(target.storagePath, target.token, file);
          if (!uploadErr) uploaded = true;
        } catch {}

        if (!uploaded && target.uploadUrl) {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(target.uploadUrl, {
            method: 'POST',
            body: formData,
          });
          if (!res.ok) {
            throw new Error(`Failed to upload ${file.name} to storage: ${res.statusText}`);
          }
        }

        committedPayload.push({
          accessToken: target.accessToken,
          storagePath: target.storagePath,
          stageCount: bulkStageCount,
        });
      }

      // 3. Commit to database
      setBulkUploadProgress('Registering token archives in database...');
      const commitRes = await fetch('/api/admin/stages/bulk-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'commit',
          adminSecret,
          archives: committedPayload,
        }),
      });

      const commitData = await commitRes.json();
      if (!commitRes.ok || !commitData.success) {
        throw new Error(commitData.error || 'Failed to commit token archives');
      }

      setStatusMessage({
        type: 'success',
        text: `Successfully deployed ${committedPayload.length} unique challenge archives (${bulkStageCount} stages each) directly to storage and mapped to participant tokens!`,
      });

      setBulkZipFiles([]);
      setBulkTokenMappings([]);
      await fetchCommittedArchives();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Bulk upload failed',
      });
    } finally {
      setBulkUploading(false);
      setBulkUploadProgress(null);
    }
  };

  // Delete an existing token archive
  const handleDeleteArchive = async (tokenToDelete: string) => {
    if (!window.confirm(`Are you sure you want to delete the stage archive for token "${tokenToDelete}"?`)) return;
    try {
      const res = await fetch('/api/admin/stages/bulk-upload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret, accessToken: tokenToDelete }),
      });
      if (res.ok) {
        await fetchCommittedArchives();
        setStatusMessage({ type: 'success', text: `Deleted token archive for ${tokenToDelete}.` });
      } else {
        const d = await res.json();
        throw new Error(d.error || 'Failed to delete archive');
      }
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Delete archive failed' });
    }
  };

  // Fetch all existing contests

  // Fetch all existing contests
  const fetchContests = async () => {
    try {
      setLoadingContests(true);
      const res = await fetch('/api/admin/contest/manage', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.contests) {
        setContests(data.contests);
      }
    } catch (err) {
      console.error('Failed to fetch contests', err);
    } finally {
      setLoadingContests(false);
    }
  };

  // Fetch configured stages from server
  const fetchStages = async () => {
    try {
      setLoadingStages(true);
      const res = await fetch('/api/admin/stages', {
        headers: { 'x-admin-secret': adminSecret },
      });
      const data = await res.json();
      if (res.ok && data.stages) {
        setStages(data.stages);
        if (data.stages.length > 0) {
          const maxNum = Math.max(...data.stages.map((s: Stage) => s.stage_number));
          setStageNumber(maxNum + 1);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stages', err);
    } finally {
      setLoadingStages(false);
    }
  };

  useEffect(() => {
    if (adminSecret) {
      fetchContests();
      fetchStages();
    }
  }, [adminSecret]);

  // Load existing stage into stage form
  const handleSelectStageToEdit = (stage: Stage) => {
    setStageNumber(stage.stage_number);
    setTitle(stage.title);
    setS3Key(stage.storage_path || stage.s3_key || '');
    setIsPasswordProtected(stage.is_password_protected);
    setZipPassword(stage.zip_password || '');
    setAllowedCopyFilename(stage.allowed_copy_filename);
    setMinExpectedSeconds(stage.min_expected_seconds);
    setPoints(stage.points);
    setStatusMessage(null);
  };

  // Clear stage form for adding a new stage
  const handleNewStage = () => {
    const nextNum = stages.length > 0 ? Math.max(...stages.map((s) => s.stage_number)) + 1 : 1;
    setStageNumber(nextNum);
    setTitle('');
    setS3Key('');
    setIsPasswordProtected(false);
    setZipPassword('');
    setAllowedCopyFilename('ai_prompt.txt');
    setMinExpectedSeconds(60);
    setPoints(100);
    setUploadFile(null);
    setPreflightResult(null);
    setStatusMessage(null);
  };

  // Direct Browser-to-Supabase Storage Upload via Signed Upload URL
  const handleDirectStorageUpload = async () => {
    if (!uploadFile) {
      setStatusMessage({ type: 'error', text: 'Please select a ZIP file to upload.' });
      return;
    }

    setUploading(true);
    setUploadProgress('Requesting Supabase Signed Upload URL...');
    setStatusMessage(null);

    try {
      const presignRes = await fetch('/api/admin/storage-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          stageNumber,
          filename: uploadFile.name,
        }),
      });

      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadUrl) {
        throw new Error(presignData.error || 'Failed to generate storage upload URL');
      }

      setUploadProgress('Uploading archive directly to Supabase Storage...');

      let uploadSuccess = false;
      let lastErrMsg = '';

      // 1. Primary: Official Supabase Storage SDK uploadToSignedUrl (handles multipart/form-data & tokens)
      try {
        const targetPath = presignData.storagePath || presignData.s3Key;
        const { error: uploadErr } = await supabase.storage
          .from('stages')
          .uploadToSignedUrl(targetPath, presignData.token, uploadFile);

        if (!uploadErr) {
          uploadSuccess = true;
        } else {
          lastErrMsg = uploadErr.message;
        }
      } catch (sdkErr: any) {
        lastErrMsg = sdkErr.message || 'SDK upload error';
      }

      // 2. Fallback: Direct fetch with FormData (standard Supabase storage-api endpoint)
      if (!uploadSuccess && presignData.uploadUrl) {
        try {
          const formData = new FormData();
          formData.append('', uploadFile);
          formData.append('cacheControl', '3600');

          const uploadRes = await fetch(presignData.uploadUrl, {
            method: 'PUT',
            body: formData,
          });

          if (uploadRes.ok) {
            uploadSuccess = true;
          } else {
            // 3. Fallback: Raw binary PUT
            const rawUploadRes = await fetch(presignData.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/zip' },
              body: uploadFile,
            });
            if (rawUploadRes.ok) {
              uploadSuccess = true;
            } else {
              throw new Error(lastErrMsg || `Storage upload failed with status ${uploadRes.status}`);
            }
          }
        } catch (fetchErr: any) {
          if (!uploadSuccess) {
            throw new Error(lastErrMsg || fetchErr.message || 'Storage upload failed');
          }
        }
      }

      const savedPath = presignData.storagePath || presignData.s3Key;
      setS3Key(savedPath);
      setUploadProgress(null);
      setStatusMessage({
        type: 'success',
        text: `Archive uploaded directly to Supabase Storage: ${savedPath}`,
      });
    } catch (err: any) {
      setUploadProgress(null);
      setStatusMessage({
        type: 'error',
        text: err.message || 'Direct storage upload failed',
      });
    } finally {
      setUploading(false);
    }
  };

  // Save single stage configuration
  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !s3Key.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Stage Title and Storage Path (ZIP) are required before saving stage.',
      });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/stages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          stageNumber,
          title: title.trim(),
          storagePath: s3Key,
          s3Key,
          isPasswordProtected,
          zipPassword,
          allowedCopyFilename,
          minExpectedSeconds,
          points,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save stage configuration');
      }

      setStatusMessage({
        type: 'success',
        text: `Stage ${stageNumber} successfully saved to contest manifest!`,
      });
      await fetchStages();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to persist stage configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  // Save and Deploy Contest
  const handleSaveAndDeployContest = async () => {
    if (!contestTitle.trim()) {
      setStatusMessage({ type: 'error', text: 'Please provide a valid Contest Title.' });
      return;
    }
    if (numberOfTeams <= 0) {
      setStatusMessage({ type: 'error', text: 'Number of teams must be at least 1.' });
      return;
    }

    setSaving(true);
    setStatusMessage(null);

    try {
      if (mode === 'create') {
        // Create brand new contest -> generates tokens = numberOfTeams and downloads them
        const res = await fetch('/api/admin/contest/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminSecret,
            action: 'create',
            title: contestTitle.trim(),
            teamsCount: numberOfTeams,
            stages,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to deploy new contest');
        }

        // AUTOMATICALLY DOWNLOAD TOKENS TEXT FILE AS REQUESTED
        if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
          downloadTokensFile(contestTitle.trim(), data.tokens);
        }

        setStatusMessage({
          type: 'success',
          text: `Contest "${contestTitle}" deployed! Generated and downloaded ${data.tokens?.length || numberOfTeams} unique team tokens in AX-DEMO-2026 format.`,
        });

        await fetchContests();
      } else {
        // Edit existing contest -> DOES NOT regenerate tokens, keeps previous tokens
        const res = await fetch('/api/admin/contest/manage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminSecret,
            action: 'update',
            contestId: activeEditingContestId,
            title: contestTitle.trim(),
            stages,
            teamsCount: numberOfTeams,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update contest');
        }

        setStatusMessage({
          type: 'success',
          text: `Contest "${contestTitle}" updated successfully! Existing team tokens preserved.`,
        });

        await fetchContests();
      }
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Contest operation failed',
      });
    } finally {
      setSaving(false);
    }
  };

  // Switch to editing an existing contest
  const handleStartEditingContest = (contest: Contest) => {
    setActiveEditingContestId(contest.id);
    setContestTitle(contest.title);
    setNumberOfTeams(contest.teams_count || contest.tokens?.length || 50);
    if (contest.stages && contest.stages.length > 0) {
      setStages(contest.stages);
    }
    setMode('edit');
    setStatusMessage(null);
  };

  // Delete a contest
  const handleDeleteContest = async (contest: Contest) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to delete contest "${contest.title}"? This cannot be undone.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch('/api/admin/contest/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminSecret,
          action: 'delete',
          contestId: contest.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete contest');
      }

      await fetchContests();
      setStatusMessage({
        type: 'success',
        text: `Contest "${contest.title}" has been deleted.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to delete contest',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Navigation & Contest Mode Switcher */}
      <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Trophy className="w-4 h-4 text-amber-400" />
            Contest & Stage Rule Manager
          </h2>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Configure tournament stages, cryptographic zip archives, and automated team access token generation.
          </p>
        </div>

        {/* Mode Switcher Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setMode('bulk');
              setStatusMessage(null);
              fetchCommittedArchives();
              fetchAvailableTokens();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'bulk'
                ? 'bg-emerald-500 text-slate-950 shadow-neon-emerald'
                : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <FileArchive className="w-3.5 h-3.5" />
            <span>Bulk Challenge Archives (Pure ZIPs)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('create');
              setActiveEditingContestId(null);
              setContestTitle('Pixel and Anomaly CTF 2026');
              setNumberOfTeams(50);
              setStatusMessage(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'create'
                ? 'bg-cyan-500 text-slate-950 shadow-neon-cyan'
                : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Single Stages & Contest</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('list');
              setStatusMessage(null);
              fetchContests();
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              mode === 'list'
                ? 'bg-amber-500 text-slate-950 shadow-neon-amber'
                : 'bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Contests ({contests.length})</span>
          </button>
        </div>
      </div>

      {/* Status Feedback Banner */}
      {statusMessage && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
              : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* =========================================================================
          VIEW 0: BULK TOKEN ARCHIVES (Pure ZIP Architecture — Zero CSV)
         ========================================================================= */}
      {mode === 'bulk' && (
        <div className="space-y-6">
          {/* Header Description Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900 to-slate-900 border border-emerald-500/30">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-emerald-400" />
                  Native Challenge Stage Deployment — Pure ZIPs (No CSV Required)
                </h3>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Each ZIP is fully self-contained: <span className="text-emerald-400 font-bold">Stage 1 is unlocked</span> by default, and <span className="text-cyan-400 font-bold">Stages 2..Y are pre-encrypted</span> inside. Decryption is performed natively in the contestant's browser RAM upon entering the correct password (just like Windows File Explorer). <span className="text-slate-400 italic">No passwords or CSV comparison files are ever needed.</span>
                </p>
              </div>
              <div className="shrink-0 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchCommittedArchives();
                    fetchAvailableTokens();
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Roster</span>
                </button>
              </div>
            </div>

            {/* Architecture Highlights */}
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-[11px] font-mono">1</span>
                  Drag & Drop X Archives
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Upload all X multi-stage challenge ZIPs at once. Each ZIP is delivered uniquely to one contestant/team token.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-[11px] font-mono">2</span>
                  Native RAM Decryption
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Like Windows or WinRAR, the browser decrypts the nested ZIP using the ZIP's internal CRC/HMAC headers directly in client RAM.
                </p>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <div className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center text-[11px] font-mono">3</span>
                  Zero Password Clashing
                </div>
                <p className="text-[11px] text-slate-400 leading-normal">
                  No CSV means zero ordering mismatch risk. Whatever password was used to encrypt the ZIP unlocks it instantly.
                </p>
              </div>
            </div>
          </div>

          {/* Upload & Stage Configuration Card */}
          <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-slate-800">
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Upload className="w-4 h-4 text-emerald-400" />
                  Select Challenge ZIP Archives
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Choose all X multi-stage ZIP files. Each archive will be uniquely mapped to a participant token.
                </p>
              </div>

              {/* Stage Count Configuration */}
              <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-xl">
                <span className="text-[11px] text-slate-400 font-medium" title="Nested archives automatically discover each stage dynamically from decrypted inner ZIPs">Nested Stages Architecture:</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={bulkStageCount}
                  onChange={(e) => setBulkStageCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-12 px-2 py-0.5 bg-slate-950 border border-slate-700 rounded text-center text-xs font-bold text-emerald-400 font-mono"
                />
                {detectingStages && (
                  <span className="text-[10px] text-cyan-400 flex items-center gap-1 font-mono">
                    <Loader2 className="w-3 h-3 animate-spin" /> Auto-detecting...
                  </span>
                )}
              </div>
            </div>

            {/* Drop Zone */}
            <label className="block border-2 border-dashed border-slate-700 hover:border-emerald-500/60 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-slate-900/40 hover:bg-slate-900/70">
              <Upload className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
              <span className="text-xs font-bold text-slate-200 block">
                {bulkZipFiles.length === 0
                  ? 'Click or drag & drop all X multi-stage ZIP archives here'
                  : `${bulkZipFiles.length} ZIP archive(s) selected (${(bulkZipFiles.reduce((acc, f) => acc + f.size, 0) / 1024 / 1024).toFixed(1)} MB total)`}
              </span>
              <span className="text-[11px] text-slate-400 block mt-1">
                Select all participant archives simultaneously • *.zip only
              </span>
              <input
                type="file"
                multiple
                accept=".zip,application/zip"
                onChange={handleZipFilesChange}
                className="hidden"
              />
            </label>
          </div>

          {/* Token Assignment & Archive Preview Table */}
          {bulkZipFiles.length > 0 && (
            <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-4 animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                <div>
                  <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-amber-400" />
                    Participant Token Binding ({bulkZipFiles.length} Archives)
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Assign each challenge archive to a team token. Unlocking is strictly in-browser via RAM decryption.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex items-center border border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleSortZips('asc')}
                      disabled={bulkZipFiles.length <= 1}
                      className="px-2.5 py-1.5 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-r border-slate-700 disabled:opacity-40 cursor-pointer"
                      title="Sort ZIPs 1→N"
                    >
                      Sort 1→N
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSortZips('desc')}
                      disabled={bulkZipFiles.length <= 1}
                      className="px-2.5 py-1.5 text-[11px] bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 cursor-pointer"
                      title="Sort ZIPs N→1"
                    >
                      Sort N→1
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleRandomizeAssignments}
                    disabled={availableTokens.length === 0}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 transition-all cursor-pointer disabled:opacity-50 font-bold shadow-xs"
                    title="Randomly distribute challenge archives across all registered participants"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>🎲 Randomize to All Participants ({availableTokens.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setBulkZipFiles([]);
                      setBulkTokenMappings([]);
                    }}
                    className="px-2.5 py-1.5 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>

              {/* Roster Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <th className="py-2.5 px-3">Order</th>
                      <th className="py-2.5 px-3">Challenge Archive</th>
                      <th className="py-2.5 px-3">Stage Structure</th>
                      <th className="py-2.5 px-3">Assigned Access Token</th>
                      <th className="py-2.5 px-3">Team / Participant</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {bulkZipFiles.map((zipFile, idx) => {
                      const currentToken = bulkTokenMappings[idx] || '';
                      const matchedTokenObj = availableTokens.find((t) => t.token === currentToken);

                      return (
                        <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                          <td className="py-2.5 px-3 text-slate-400 font-bold whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span className="w-5 text-right font-mono">{idx + 1}</span>
                              <div className="flex flex-col gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveZip(idx, 'up')}
                                  className="text-[9px] text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer p-0.5 leading-none rounded hover:bg-slate-800"
                                  title="Move ZIP Up"
                                >
                                  ▲
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === bulkZipFiles.length - 1}
                                  onClick={() => handleMoveZip(idx, 'down')}
                                  className="text-[9px] text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer p-0.5 leading-none rounded hover:bg-slate-800"
                                  title="Move ZIP Down"
                                >
                                  ▼
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-200">
                            <div className="flex items-center gap-2">
                              <FileArchive className="w-4 h-4 text-emerald-400 shrink-0" />
                              <span className="truncate max-w-[200px] font-semibold">{zipFile.name}</span>
                              <span className="text-[10px] text-slate-500">({(zipFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                                S1: Unlocked
                              </span>
                              {Array.from({ length: Math.max(0, bulkStageCount - 1) }).map((_, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="px-1.5 py-0.5 rounded text-[10px] bg-cyan-500/10 border border-cyan-500/20 text-cyan-400"
                                >
                                  S{sIdx + 2}: Native Encrypted
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-1 bg-emerald-950/60 border border-emerald-500/30 rounded-lg text-xs font-mono text-emerald-400 font-bold tracking-wider">
                                {currentToken || 'PENDING'}
                              </span>
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-slate-400 border border-slate-700">
                                🎲 Auto-Randomized
                              </span>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300">
                            {matchedTokenObj ? (
                              <div className="flex items-center gap-1.5">
                                <Users className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                                <span className="font-semibold text-white text-xs">
                                  {matchedTokenObj.label}
                                </span>
                              </div>
                            ) : currentToken ? (
                              <span className="text-[11px] text-slate-400 font-mono">Token: {currentToken}</span>
                            ) : (
                              <span className="text-[11px] text-amber-400 italic">Unassigned</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Deploy Action Bar */}
              <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-[11px] text-slate-400">
                  {bulkUploadProgress && (
                    <div className="flex items-center gap-2 text-cyan-400 font-mono">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{bulkUploadProgress}</span>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleExecuteBulkUpload}
                  disabled={bulkUploading || bulkZipFiles.length === 0}
                  className="flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-all shadow-neon-emerald disabled:opacity-50 cursor-pointer"
                >
                  {bulkUploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deploying Archives...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Deploy All {bulkZipFiles.length} Challenge Archives</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Active Deployed Token Archives Table */}
          <div className="p-5 rounded-2xl bg-app-surface border border-app-border space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <Database className="w-4 h-4 text-cyan-400" />
                Active Deployed Token Archives in Database ({bulkCommittedArchives.length})
              </h4>
              <button
                type="button"
                onClick={fetchCommittedArchives}
                className="text-xs text-cyan-400 hover:underline cursor-pointer flex items-center gap-1"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Refresh</span>
              </button>
            </div>

            {loadingCommittedArchives ? (
              <div className="p-6 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                <span>Loading committed archives...</span>
              </div>
            ) : bulkCommittedArchives.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-slate-950/40 rounded-xl border border-slate-800">
                No token archives deployed yet. Upload your multi-stage ZIP archives above to deploy.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-slate-800 text-[11px] font-mono text-slate-400">
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">Access Token</th>
                      <th className="py-2.5 px-3">Storage Path</th>
                      <th className="py-2.5 px-3">Stages</th>
                      <th className="py-2.5 px-3">Deployed At</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {bulkCommittedArchives.map((arch, idx) => (
                      <tr key={arch.id} className="hover:bg-slate-900/50 transition-colors">
                        <td className="py-2.5 px-3 text-slate-400 font-bold">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-bold text-emerald-400">{arch.access_token}</td>
                        <td className="py-2.5 px-3 text-slate-300 text-[11px] truncate max-w-[220px]">
                          {arch.storage_path}
                        </td>
                        <td className="py-2.5 px-3 text-cyan-400 font-bold">
                          {arch.stage_count} Stages
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          {new Date(arch.uploaded_at).toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteArchive(arch.access_token)}
                            className="px-2 py-1 rounded-lg text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 text-[11px] transition-colors cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          VIEW 1: LIST OF EXISTING CONTESTS (Edit or Delete)
         ========================================================================= */}
      {mode === 'list' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Available Contests in Database ({contests.length})
            </h3>
            <button
              onClick={fetchContests}
              className="text-xs text-cyan-400 hover:underline cursor-pointer"
            >
              Refresh Contests
            </button>
          </div>

          {loadingContests ? (
            <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
              <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
              <span>Loading contests directory...</span>
            </div>
          ) : contests.length === 0 ? (
            <div className="p-8 text-center text-slate-400 bg-app-surface border border-app-border rounded-2xl text-xs space-y-2">
              <p>No contests found in database.</p>
              <button
                onClick={() => setMode('create')}
                className="px-4 py-2 rounded-xl bg-cyan-400 text-slate-950 font-bold text-xs cursor-pointer inline-flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Your First Contest</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contests.map((c) => (
                <div
                  key={c.id}
                  className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-3 relative hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-bold text-sm text-white">{c.title}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {c.id}</p>
                    </div>
                    <span
                      className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold uppercase ${
                        c.status === 'LIVE'
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                          : c.status === 'FROZEN'
                          ? 'bg-sky-500/20 text-sky-400 border border-sky-500/40'
                          : 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-300">
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-cyan-400" />
                      <span>{c.teams_count || c.tokens?.length || 0} Teams</span>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center gap-2">
                      <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                      <span>{c.tokens?.length || 0} Tokens</span>
                    </div>
                  </div>

                  {/* Actions Bar */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-800 text-xs">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleStartEditingContest(c)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 font-bold transition-colors cursor-pointer"
                        title="Edit stages and rules without regenerating tokens"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>Edit Contest</span>
                      </button>

                      {c.tokens && c.tokens.length > 0 && (
                        <button
                          onClick={() => downloadTokensFile(c.title, c.tokens)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                          title="Download all tokens as a formatted text file"
                        >
                          <Download className="w-3 h-3 text-emerald-400" />
                          <span>Tokens (.txt)</span>
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => handleDeleteContest(c)}
                      className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
                      title="Delete Contest"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          VIEW 2 & 3: CREATE NEW CONTEST / EDIT CONTEST FORM
         ========================================================================= */}
      {(mode === 'create' || mode === 'edit') && (
        <div className="space-y-6">
          {/* Contest Global Parameters Section */}
          <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                {mode === 'edit' && (
                  <button
                    onClick={() => setMode('list')}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors mr-1 cursor-pointer"
                    title="Back to Contests List"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-cyan-400" />
                  {mode === 'create' ? 'Step 1: Setup New Contest Parameters' : `Editing Contest: ${contestTitle}`}
                </h3>
              </div>
              <span className="text-[11px] font-mono text-cyan-400">
                {mode === 'create' ? 'New Deployment' : 'Preserving Tokens Mode'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Contest Name / Event Title *
                </label>
                <input
                  type="text"
                  value={contestTitle}
                  onChange={(e) => setContestTitle(e.target.value)}
                  placeholder="e.g. Pixel and Anomaly CTF 2026"
                  className="w-full px-3 py-2 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Number of Teams / Tokens *
                </label>
                <input
                  type="number"
                  min="1"
                  max="10000"
                  value={numberOfTeams}
                  onChange={(e) => setNumberOfTeams(Math.max(1, parseInt(e.target.value) || 1))}
                  disabled={mode === 'edit'}
                  className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400 disabled:opacity-50"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {mode === 'create'
                    ? 'Generates N unique tokens on deploy'
                    : 'Tokens locked (edit mode preserves tokens)'}
                </span>
              </div>
            </div>

            {/* Instruction Callout */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                <span>
                  Tokens format: <code className="text-cyan-400 font-bold font-mono">AX-DEMO-2026</code> (2 letters, 4 letters, 4 digits). One token is valid for one ID only.
                </span>
              </div>
              <button
                type="button"
                onClick={handleSaveAndDeployContest}
                disabled={saving || !contestTitle.trim()}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Deploying...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save & Deploy Contest</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Main Stage Builder Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Configured Stages in Contest */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Stages Manifest ({stages.length})
                </h3>
                <button
                  onClick={handleNewStage}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 transition-colors font-semibold cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Stage</span>
                </button>
              </div>

              {loadingStages ? (
                <div className="p-8 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                  <Loader2 className="w-4 h-4 animate-spin text-cyan-400" />
                  <span>Loading stages...</span>
                </div>
              ) : stages.length === 0 ? (
                <div className="p-6 text-center text-slate-400 bg-app-surface border border-app-border rounded-2xl text-xs space-y-2">
                  <p>No stages configured yet.</p>
                  <p className="text-[11px] text-slate-400">Use the form to configure Stage 1 with problem files.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {stages.map((stage) => {
                    const isSelected = stage.stage_number === stageNumber;
                    return (
                      <div
                        key={stage.stage_number}
                        onClick={() => handleSelectStageToEdit(stage)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-cyan-500/10 border-cyan-500 text-white shadow-neon-cyan'
                            : 'bg-app-surface border-app-border text-slate-300 hover:bg-slate-800/60'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-bold text-cyan-400">
                              STAGE {stage.stage_number}
                            </span>
                            {stage.is_password_protected && (
                              <span title="Password Protected">
                                <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold truncate mt-0.5">{stage.title}</div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                            {stage.storage_path || stage.s3_key}
                          </div>
                        </div>
                        <span className="text-xs font-mono font-bold text-emerald-400 shrink-0 ml-2">
                          +{stage.points} PTS
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Stage Configuration Form (WITHOUT quiz questions) */}
            <div className="lg:col-span-2">
              <form onSubmit={handleSaveStage} className="space-y-5">
                {/* Section 1: General Stage Metadata */}
                <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-cyan-400" />
                      Stage {stageNumber} Parameters
                    </h3>
                    <span className="text-[10px] text-cyan-400 font-mono">Archive & Rules</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Stage Number *
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={stageNumber}
                        onChange={(e) => setStageNumber(parseInt(e.target.value) || 1)}
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                        required
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Stage Title *
                      </label>
                      <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="e.g. Neural Anomaly Extraction & Data Decryption"
                        className="w-full px-3 py-2 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Points Awarded *
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="10"
                        value={points}
                        onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Min Expected (Secs)
                      </label>
                      <input
                        type="number"
                        min="0"
                        value={minExpectedSeconds}
                        onChange={(e) => setMinExpectedSeconds(parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Allowed Copy File
                      </label>
                      <input
                        type="text"
                        value={allowedCopyFilename}
                        onChange={(e) => setAllowedCopyFilename(e.target.value)}
                        placeholder="ai_prompt.txt"
                        className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Section 2: ZIP Archive & Encryption Settings */}
                <div className="p-4 sm:p-5 rounded-2xl bg-app-surface border border-app-border space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                      <FileArchive className="w-4 h-4 text-cyan-400" />
                      Stage ZIP Archive & Storage
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">In-Memory Preflight Verified</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="flex items-center space-x-2 pt-2">
                      <input
                        type="checkbox"
                        id="isPasswordProtected"
                        checked={isPasswordProtected}
                        onChange={(e) => setIsPasswordProtected(e.target.checked)}
                        className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-900 border-slate-700 cursor-pointer"
                      />
                      <label
                        htmlFor="isPasswordProtected"
                        className="text-xs font-semibold text-slate-200 cursor-pointer"
                      >
                        Requires Decryption Password
                      </label>
                    </div>

                    {isPasswordProtected && (
                      <div>
                        <label className="block text-xs font-semibold text-amber-300 mb-1 flex items-center gap-1">
                          <KeyRound className="w-3.5 h-3.5" />
                          Archive Password *
                        </label>
                        <input
                          type="text"
                          value={zipPassword}
                          onChange={(e) => setZipPassword(e.target.value)}
                          placeholder="e.g. quantum-anomaly-2026"
                          className="w-full px-3 py-2 text-xs font-mono text-amber-200 bg-slate-900 border border-amber-500/50 rounded-xl focus:border-amber-400"
                        />
                      </div>
                    )}
                  </div>

                  {/* ZIP Archive Upload & Preflight Checks */}
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-300">
                      Problem ZIP Archive Upload *
                    </label>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <input
                        type="file"
                        accept=".zip"
                        onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        className="flex-1 text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-800 file:text-cyan-300 hover:file:bg-slate-700 cursor-pointer bg-slate-900 rounded-xl border border-slate-700 p-1"
                      />

                      <button
                        type="button"
                        onClick={handleDirectStorageUpload}
                        disabled={
                          !uploadFile ||
                          uploading ||
                          validatingArchive ||
                          (preflightResult !== null && !preflightResult.valid)
                        }
                        className="flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {uploading ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload to Storage</span>
                          </>
                        )}
                      </button>
                    </div>

                    {uploadProgress && (
                      <p className="text-[11px] text-cyan-300 font-mono">{uploadProgress}</p>
                    )}

                    {/* Preflight Validation Status Display */}
                    {validatingArchive && (
                      <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center gap-2 text-xs text-slate-300 font-mono">
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                        <span>Running in-memory decryption pre-flight check...</span>
                      </div>
                    )}

                    {preflightResult && !validatingArchive && (
                      <div
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          preflightResult.valid
                            ? 'bg-emerald-950/50 border-emerald-500/50 text-emerald-300'
                            : 'bg-rose-950/50 border-rose-500/50 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 font-bold">
                          {preflightResult.valid ? (
                            <>
                              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                              <span>Archive Pre-Flight Validated</span>
                            </>
                          ) : (
                            <>
                              <AlertCircle className="w-4 h-4 text-rose-400" />
                              <span>Archive Pre-Flight Failed</span>
                            </>
                          )}
                        </div>
                        <p className="text-[11px] font-mono leading-relaxed">{preflightResult.message}</p>
                        {preflightResult.valid && preflightResult.filenames.length > 0 && (
                          <p className="text-[10px] text-emerald-400/80 font-mono">
                            Contains {preflightResult.fileCount} file(s): {preflightResult.filenames.slice(0, 4).join(', ')}
                            {preflightResult.filenames.length > 4 ? ` (+${preflightResult.filenames.length - 4} more)` : ''}
                          </p>
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Storage Path (Supabase Storage Key)
                      </label>
                      <input
                        type="text"
                        value={s3Key}
                        onChange={(e) => setS3Key(e.target.value)}
                        placeholder="e.g. stage-1/1729000000-dataset.zip"
                        className="w-full px-3 py-2 text-xs font-mono text-slate-300 bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                {/* Submit / Action Buttons */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleNewStage}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Reset Form
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      disabled={
                        saving ||
                        validatingArchive ||
                        (uploadFile !== null && preflightResult !== null && !preflightResult.valid)
                      }
                      className="flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all cursor-pointer"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Saving Stage...</span>
                        </>
                      ) : (
                        <>
                          <Save className="w-3.5 h-3.5" />
                          <span>Save Stage {stageNumber}</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleSaveAndDeployContest}
                      disabled={saving || !contestTitle.trim()}
                      className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>{mode === 'create' ? 'Save & Deploy Contest' : 'Update Contest'}</span>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
