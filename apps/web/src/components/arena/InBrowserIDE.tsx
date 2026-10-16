'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedFile, StageManifest, ContestStatus } from '@/lib/types';
import { SheetViewer } from './SheetViewer';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  FolderArchive,
  Layers,
  Trophy,
  HelpCircle,
  ChevronRight,
  ShieldCheck,
  Lock,
  Unlock,
  Sparkles,
  Maximize2,
  FileQuestion,
  Pause,
  CheckCircle2,
} from 'lucide-react';

interface InBrowserIDEProps {
  stages: StageManifest[];
  currentStageNumber: number;
  selectedStageNumber: number;
  files: ParsedFile[];
  activeFile: ParsedFile | null;
  allowedCopyFilename: string;
  loading: boolean;
  participantName: string;
  totalScore: number;
  contestStatus?: ContestStatus;
  onSelectStage: (stageNum: number) => void;
  onSelectFile: (file: ParsedFile) => void;
  onOpenUnlockModal: () => void;
  onOpenLeaderboard: () => void;
}

export function InBrowserIDE({
  stages,
  currentStageNumber,
  selectedStageNumber,
  files,
  activeFile,
  allowedCopyFilename,
  loading,
  participantName,
  totalScore,
  contestStatus = 'LIVE',
  onSelectStage,
  onSelectFile,
  onOpenUnlockModal,
  onOpenLeaderboard,
}: InBrowserIDEProps) {
  const [sidebarTab, setSidebarTab] = useState<'files' | 'stages'>('files');

  const selectedStage = stages.find((s) => s.stageNumber === selectedStageNumber);
  const isFrozen = contestStatus === 'FROZEN';
  const isConcluded = contestStatus === 'CONCLUDED';

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Application Bar */}
      <header className="h-14 px-4 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 rounded-xl text-cyan-400">
            <Layers className="w-4 h-4" />
            <span className="font-extrabold text-xs tracking-wider uppercase">
              Stage {selectedStageNumber}
            </span>
          </div>
          <span className="text-sm font-semibold text-white truncate max-w-[280px]">
            {selectedStage?.title || `Stage ${selectedStageNumber}`}
          </span>
          {selectedStage?.isPasswordProtected && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
              <Lock className="w-3 h-3" />
              AES Locked
            </span>
          )}

          {isFrozen && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold">
              <Pause className="w-3 h-3 fill-amber-400" />
              SUBMISSIONS FROZEN
            </span>
          )}

          {isConcluded && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold">
              <CheckCircle2 className="w-3 h-3 text-purple-400" />
              CONTEST CONCLUDED
            </span>
          )}
        </div>

        {/* Center / Right Action Controls */}
        <div className="flex items-center gap-3">
          {/* Unlock Next Stage Button */}
          {isFrozen ? (
            <button
              disabled
              title="Contest is currently frozen. Stage submissions are paused."
              className="flex items-center gap-2 px-4 py-2 bg-amber-950/60 border border-amber-500/40 text-amber-300 rounded-xl text-xs font-bold opacity-75 cursor-not-allowed"
            >
              <Pause className="w-4 h-4 fill-amber-400" />
              <span>Submissions Paused</span>
            </button>
          ) : isConcluded ? (
            <button
              disabled
              title="Contest is concluded. Submissions are closed."
              className="flex items-center gap-2 px-4 py-2 bg-purple-950/60 border border-purple-500/40 text-purple-300 rounded-xl text-xs font-bold opacity-75 cursor-not-allowed"
            >
              <CheckCircle2 className="w-4 h-4 text-purple-400" />
              <span>Contest Concluded</span>
            </button>
          ) : (
            <button
              onClick={onOpenUnlockModal}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-violet-600 to-cyan-500 hover:from-violet-500 hover:to-cyan-400 text-white rounded-xl text-xs font-bold transition-all shadow-neon-violet cursor-pointer"
            >
              <Unlock className="w-4 h-4" />
              <span>Unlock Next Stage</span>
              <span className="px-1.5 py-0.2 bg-white/20 rounded text-[10px] font-mono">
                +{selectedStage?.points || 100} PTS
              </span>
            </button>
          )}

          {/* Open Leaderboard Button */}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/80 rounded-xl text-xs font-semibold transition-all cursor-pointer"
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Leaderboard</span>
          </button>

          {/* Participant Profile Pill */}
          <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl">
            <div className="w-6 h-6 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
              {participantName ? participantName.charAt(0).toUpperCase() : 'U'}
            </div>
            <div className="text-left font-mono">
              <div className="text-[11px] font-bold text-slate-200 leading-tight">
                {participantName}
              </div>
              <div className="text-[10px] text-cyan-400 font-extrabold leading-tight">
                {totalScore} PTS
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Workspace: Left Sidebar + Center Editor Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside className="w-64 sm:w-72 bg-slate-900/60 border-r border-slate-800/80 flex flex-col shrink-0">
          {/* Sidebar Tab Switcher */}
          <div className="flex border-b border-slate-800/80 bg-slate-950/40 p-1 gap-1">
            <button
              onClick={() => setSidebarTab('files')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                sidebarTab === 'files'
                  ? 'bg-slate-800 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FileCode className="w-3.5 h-3.5" />
              Stage Files ({files.length})
            </button>
            <button
              onClick={() => setSidebarTab('stages')}
              className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                sidebarTab === 'stages'
                  ? 'bg-slate-800 text-white font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderArchive className="w-3.5 h-3.5" />
              All Stages ({stages.length})
            </button>
          </div>

          {/* Sidebar Content */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {sidebarTab === 'files' ? (
              loading ? (
                <div className="p-8 text-center text-slate-500 text-xs">
                  <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Decompressing archive in RAM...
                </div>
              ) : files.length === 0 ? (
                <div className="p-6 text-center text-slate-500 text-xs">
                  <FileQuestion className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                  No files extracted yet
                </div>
              ) : (
                files.map((file) => {
                  const isActive = activeFile?.path === file.path;
                  const isCopyable = file.isCopyAllowed;

                  return (
                    <button
                      key={file.path}
                      onClick={() => onSelectFile(file)}
                      className={`w-full flex items-center justify-between p-2 rounded-xl text-left transition-all cursor-pointer group ${
                        isActive
                          ? 'bg-cyan-500/15 border border-cyan-500/40 text-cyan-200'
                          : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {file.type === 'spreadsheet' ? (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : file.type === 'markdown' ? (
                          <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                        ) : (
                          <FileCode className="w-4 h-4 text-violet-400 shrink-0" />
                        )}
                        <span className="text-xs font-mono truncate">{file.name}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {isCopyable && (
                          <span
                            className="px-1.5 py-0.2 text-[9px] font-mono font-bold bg-cyan-400 text-slate-950 rounded uppercase shadow-sm"
                            title="Whitelisted copy file"
                          >
                            PROMPT
                          </span>
                        )}
                        <span className="text-[10px] text-slate-500 font-mono">
                          {(file.size / 1024).toFixed(0)}K
                        </span>
                      </div>
                    </button>
                  );
                })
              )
            ) : (
              stages.map((stage) => {
                const isCurrent = stage.stageNumber === currentStageNumber;
                const isSelected = stage.stageNumber === selectedStageNumber;
                const isUnlocked = stage.stageNumber <= currentStageNumber;

                return (
                  <button
                    key={stage.stageNumber}
                    onClick={() => onSelectStage(stage.stageNumber)}
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl text-left transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-violet-500/20 border border-violet-500/40 text-violet-200 shadow-sm'
                        : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <div
                        className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold font-mono ${
                          isCurrent
                            ? 'bg-cyan-400 text-slate-950'
                            : isUnlocked
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : 'bg-slate-800 text-slate-500'
                        }`}
                      >
                        {stage.stageNumber}
                      </div>
                      <div className="truncate">
                        <div className="text-xs font-semibold truncate text-slate-200">
                          {stage.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {stage.points} PTS
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center gap-1">
                      {stage.isPasswordProtected && (
                        <Lock className="w-3.5 h-3.5 text-amber-400" />
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-600" />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </aside>

        {/* Center Editor / Viewer */}
        <main className="flex-1 flex flex-col bg-slate-950 overflow-hidden relative">
          {activeFile ? (
            <>
              {/* Active Tab Header */}
              <div className="h-9 px-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {activeFile.type === 'spreadsheet' ? (
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  ) : activeFile.type === 'markdown' ? (
                    <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <FileCode className="w-3.5 h-3.5 text-violet-400" />
                  )}
                  <span className="text-xs font-mono text-slate-200 font-semibold">
                    {activeFile.name}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    ({activeFile.type})
                  </span>
                </div>
              </div>

              {/* Viewer Body */}
              <div className="flex-1 overflow-auto">
                {activeFile.type === 'spreadsheet' && activeFile.sheets ? (
                  <SheetViewer
                    sheets={activeFile.sheets}
                    filename={activeFile.name}
                  />
                ) : activeFile.type === 'markdown' ? (
                  <div className="p-8 max-w-4xl mx-auto prose prose-invert prose-cyan prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-800">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {activeFile.content || ''}
                    </ReactMarkdown>
                  </div>
                ) : (
                  // Monospace Line-Numbered Code / Text Viewer
                  <div className="flex min-h-full font-mono text-xs leading-relaxed text-slate-200">
                    {/* Line numbers column */}
                    <div className="w-12 py-4 bg-slate-900/60 border-r border-slate-800 text-slate-600 select-none text-right pr-3 font-mono">
                      {(activeFile.content || '')
                        .split('\n')
                        .map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                    </div>
                    {/* Code content */}
                    <div className="flex-1 p-4 whitespace-pre overflow-x-auto">
                      {activeFile.content || ''}
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
              <FolderArchive className="w-14 h-14 mb-3 text-slate-700" />
              <h3 className="text-base font-semibold text-slate-300">No File Selected</h3>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Select a file from the stage sidebar to view it in-browser. All archives are decompressed in RAM with zero disk writes.
              </p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
