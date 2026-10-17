'use client';

import React, { useState, useEffect } from 'react';
import { Stage, Contest, PreflightValidationResult } from '@/lib/types';
import { validateArchiveDecryption } from '@/lib/zip-engine';
import { downloadTokensFile } from '@/lib/tokens';
import {
  Upload,
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
} from 'lucide-react';

interface StageBuilderTabProps {
  adminSecret: string;
}

type TabMode = 'list' | 'create' | 'edit';

export function StageBuilderTab({ adminSecret }: StageBuilderTabProps) {
  // Mode State: 'list' (shows all contests), 'create' (new contest), 'edit' (edit existing)
  const [mode, setMode] = useState<TabMode>('create');

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

      const uploadRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/zip' },
        body: uploadFile,
      });

      if (!uploadRes.ok) {
        throw new Error(`Storage upload failed with status ${uploadRes.status}`);
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

        {/* Create New vs Edit Existing Switcher Buttons */}
        <div className="flex items-center gap-2">
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
            <span>Create New Contest</span>
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
            <span>Edit Existing Contest ({contests.length})</span>
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
