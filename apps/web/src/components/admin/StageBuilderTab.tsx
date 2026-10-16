'use client';

import React, { useState, useEffect } from 'react';
import { Stage, QuizQuestion, PreflightValidationResult } from '@/lib/types';
import { validateArchiveDecryption } from '@/lib/zip-engine';
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
  HelpCircle,
  Loader2,
  Check,
  FileArchive,
  KeyRound,
  AlertTriangle,
} from 'lucide-react';

interface StageBuilderTabProps {
  adminSecret: string;
}

export function StageBuilderTab({ adminSecret }: StageBuilderTabProps) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);

  // Form State
  const [stageNumber, setStageNumber] = useState<number>(1);
  const [title, setTitle] = useState('');
  const [s3Key, setS3Key] = useState('');
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [zipPassword, setZipPassword] = useState('');
  const [allowedCopyFilename, setAllowedCopyFilename] = useState('ai_prompt.txt');
  const [minExpectedSeconds, setMinExpectedSeconds] = useState(60);
  const [points, setPoints] = useState(100);

  // 2 Quiz Questions State
  const [questions, setQuestions] = useState<QuizQuestion[]>([
    {
      question: '',
      options: ['', '', '', ''],
      answer_idx: 0,
    },
    {
      question: '',
      options: ['', '', '', ''],
      answer_idx: 0,
    },
  ]);

  // S3 Upload State
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  // Archive Decryption Preflight State
  const [preflightResult, setPreflightResult] = useState<PreflightValidationResult | null>(null);
  const [validatingArchive, setValidatingArchive] = useState(false);

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

  // Save State
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

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
          // Suggest next stage number
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
      fetchStages();
    }
  }, [adminSecret]);

  // Load existing stage into form
  const handleSelectStageToEdit = (stage: Stage) => {
    setStageNumber(stage.stage_number);
    setTitle(stage.title);
    setS3Key(stage.storage_path || stage.s3_key || '');
    setIsPasswordProtected(stage.is_password_protected);
    setZipPassword(stage.zip_password || '');
    setAllowedCopyFilename(stage.allowed_copy_filename);
    setMinExpectedSeconds(stage.min_expected_seconds);
    setPoints(stage.points);
    if (stage.quiz_questions && stage.quiz_questions.length === 2) {
      setQuestions(stage.quiz_questions);
    }
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
      // 1. Get 300-second Signed Upload URL from serverless endpoint
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

      // 2. Direct browser-to-Supabase Storage PUT upload (zero server memory/proxy overhead)
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/zip',
        },
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

  const handleDirectS3Upload = handleDirectStorageUpload;

  // Handle saving stage configuration
  const handleSaveStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !s3Key.trim()) {
      setStatusMessage({
        type: 'error',
        text: 'Title and S3 Key are required before saving stage.',
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
          title,
          storagePath: s3Key,
          s3Key,
          isPasswordProtected,
          zipPassword,
          allowedCopyFilename,
          minExpectedSeconds,
          points,
          quizQuestions: questions,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save stage configuration');
      }

      setStatusMessage({
        type: 'success',
        text: `Stage ${stageNumber} successfully saved to Supabase!`,
      });
      fetchStages();
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err.message || 'Failed to persist stage configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOptionChange = (qIdx: number, optIdx: number, val: string) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[qIdx].options[optIdx] = val;
      return updated;
    });
  };

  const handleCorrectAnswerChange = (qIdx: number, optIdx: number) => {
    setQuestions((prev) => {
      const updated = [...prev];
      updated[qIdx].answer_idx = optIdx;
      return updated;
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Column: Existing Stages */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Configured Stages ({stages.length})
          </h3>
          <button
            onClick={() => {
              setStageNumber(stages.length + 1);
              setTitle('');
              setS3Key('');
              setAllowedCopyFilename('ai_prompt.txt');
              setMinExpectedSeconds(60);
              setPoints(100);
            }}
            className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 font-semibold"
          >
            <Plus className="w-3.5 h-3.5" />
            New Stage
          </button>
        </div>

        {loadingStages ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
            Loading stages...
          </div>
        ) : stages.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs rounded-xl glass-panel border border-slate-800">
            No stages configured yet. Use the form to configure Stage 1.
          </div>
        ) : (
          <div className="space-y-2">
            {stages.map((stg) => (
              <div
                key={stg.id}
                onClick={() => handleSelectStageToEdit(stg)}
                className={`p-3.5 rounded-xl border transition-all cursor-pointer ${
                  stg.stage_number === stageNumber
                    ? 'bg-cyan-500/10 border-cyan-500/40 shadow-sm'
                    : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-cyan-400 font-mono">
                    STAGE {stg.stage_number}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {stg.points} PTS
                  </span>
                </div>
                <h4 className="text-xs font-semibold text-slate-200 truncate">
                  {stg.title}
                </h4>
                <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-500" />
                    &ge;{stg.min_expected_seconds}s
                  </span>
                  {stg.is_password_protected && (
                    <span className="flex items-center gap-1 text-amber-400">
                      <Lock className="w-3 h-3" />
                      Locked
                    </span>
                  )}
                  {stg.allowed_copy_filename && (
                    <span className="text-cyan-300 truncate max-w-[100px]">
                      {stg.allowed_copy_filename}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right Column: Stage Builder & S3 Uploader Form */}
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={handleSaveStage} className="space-y-6">
          {/* Status Message */}
          {statusMessage && (
            <div
              className={`flex items-center gap-2 p-3 text-xs font-medium rounded-xl border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-500/50 text-rose-300'
              }`}
            >
              {statusMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{statusMessage.text}</span>
            </div>
          )}

          {/* Section 1: Basic Stage Metadata */}
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Stage Parameters
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Stage Number
                </label>
                <input
                  type="number"
                  min="1"
                  value={stageNumber}
                  onChange={(e) => setStageNumber(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Stage Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Cryptic Dataset Reconstruction"
                  className="w-full px-3 py-2 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Points Awarded
                </label>
                <input
                  type="number"
                  value={points}
                  onChange={(e) => setPoints(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Min Expected Time (Sec)
                </label>
                <input
                  type="number"
                  value={minExpectedSeconds}
                  onChange={(e) => setMinExpectedSeconds(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono text-white bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                  title="Anti-cheat speed threshold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Whitelisted Copy File
                </label>
                <input
                  type="text"
                  value={allowedCopyFilename}
                  onChange={(e) => setAllowedCopyFilename(e.target.value)}
                  placeholder="e.g. ai_prompt.txt"
                  className="w-full px-3 py-2 text-xs font-mono text-cyan-300 bg-slate-900 border border-slate-700 rounded-xl focus:border-cyan-400"
                  title="Only this file can be copied by participants"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="isPasswordProtected"
                checked={isPasswordProtected}
                onChange={(e) => setIsPasswordProtected(e.target.checked)}
                className="rounded border-slate-700 text-cyan-400 focus:ring-cyan-400"
              />
              <label htmlFor="isPasswordProtected" className="text-xs text-slate-300 cursor-pointer">
                Require password for ZIP decryption (AES / ZipCrypto)
              </label>
            </div>

            {isPasswordProtected && (
              <div className="pt-2">
                <label className="block text-xs font-semibold text-amber-300 mb-1">
                  ZIP Decryption Password (Key required to unlock stage)
                </label>
                <input
                  type="text"
                  value={zipPassword}
                  onChange={(e) => setZipPassword(e.target.value)}
                  placeholder="e.g. cyber2026"
                  className="w-full px-3 py-2 text-xs font-mono text-amber-300 bg-slate-900 border border-slate-700 rounded-xl focus:border-amber-400"
                />
              </div>
            )}
          </div>

          {/* Section 2: Supabase Storage Direct Upload */}
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Upload className="w-4 h-4 text-violet-400" />
              Direct-to-Storage Archive Upload (Supabase Storage)
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Upload Stage ZIP File
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-200 hover:file:bg-slate-700 cursor-pointer"
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
                    className="px-4 py-2 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-neon-violet disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Uploading to Storage...
                      </>
                    ) : (
                      'Upload to Supabase Storage'
                    )}
                  </button>
                </div>

                {/* Preflight Validation Status Display */}
                {validatingArchive && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-xs text-cyan-300 flex items-center gap-2 mt-2">
                    <Loader2 className="w-4 h-4 animate-spin text-cyan-400 flex-shrink-0" />
                    <span>Running in-memory decryption pre-flight check...</span>
                  </div>
                )}

                {preflightResult && !validatingArchive && (
                  <div
                    className={`p-3.5 rounded-xl border text-xs space-y-1.5 mt-2 ${
                      preflightResult.valid
                        ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                        : 'bg-rose-950/40 border-rose-500/50 text-rose-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 font-bold">
                      {preflightResult.valid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <span className="text-emerald-300">Archive Pre-Flight Validated</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                          <span className="text-rose-300">Archive Pre-Flight Failed</span>
                        </>
                      )}
                    </div>
                    <p className="text-[11px] font-mono leading-relaxed">{preflightResult.message}</p>
                    {preflightResult.valid && preflightResult.filenames.length > 0 && (
                      <div className="text-[10px] text-slate-400 font-mono">
                        Contains {preflightResult.fileCount} file(s): {preflightResult.filenames.slice(0, 4).join(', ')}
                        {preflightResult.filenames.length > 4 ? ` (+${preflightResult.filenames.length - 4} more)` : ''}
                      </div>
                    )}
                  </div>
                )}

                {uploadProgress && (
                  <p className="text-[11px] font-mono text-cyan-400 mt-1">
                    {uploadProgress}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Storage Path (Supabase Storage)
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

          {/* Section 3: 2-Question Stage Gate Quiz Builder */}
          <div className="p-5 rounded-2xl glass-panel border border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-400" />
                2-Question Gate Quiz Builder
              </h3>
              <span className="text-[10px] text-slate-400 font-mono">
                Participants must score 2/2 to unlock next stage
              </span>
            </div>

            {questions.map((q, qIdx) => (
              <div
                key={qIdx}
                className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3"
              >
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-xs font-mono font-bold flex items-center justify-center">
                    {qIdx + 1}
                  </span>
                  <input
                    type="text"
                    value={q.question}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQuestions((prev) => {
                        const updated = [...prev];
                        updated[qIdx].question = val;
                        return updated;
                      });
                    }}
                    placeholder={`Question ${qIdx + 1} Prompt...`}
                    className="flex-1 px-3 py-1.5 text-xs text-white bg-slate-950 border border-slate-700 rounded-lg focus:border-cyan-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                  {q.options.map((opt, optIdx) => {
                    const isCorrect = q.answer_idx === optIdx;
                    return (
                      <div
                        key={optIdx}
                        className={`flex items-center gap-2 p-1.5 rounded-lg border ${
                          isCorrect
                            ? 'bg-emerald-500/10 border-emerald-500/40'
                            : 'bg-slate-950 border-slate-800'
                        }`}
                      >
                        <input
                          type="radio"
                          name={`correct-answer-q${qIdx}`}
                          checked={isCorrect}
                          onChange={() => handleCorrectAnswerChange(qIdx, optIdx)}
                          className="text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                          title="Mark as correct answer"
                        />
                        <span className="text-[10px] font-mono text-slate-400 font-bold">
                          {String.fromCharCode(65 + optIdx)}
                        </span>
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + optIdx)}`}
                          className="flex-1 px-2 py-1 text-xs text-white bg-transparent border-0 focus:outline-none"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={
                saving ||
                validatingArchive ||
                (uploadFile !== null && preflightResult !== null && !preflightResult.valid)
              }
              className="flex items-center gap-2 px-6 py-2.5 text-xs font-bold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving Stage...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save Stage Configuration</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
