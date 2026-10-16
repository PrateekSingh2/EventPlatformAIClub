'use client';

import React, { useState, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedFile, StageManifest } from '@/lib/types';
import { SheetViewer } from './SheetViewer';
import { useTheme } from '@/lib/theme';
import { FileExtensionIcon } from './FileIcon';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  FolderArchive,
  FolderTree,
  Trophy,
  Lock,
  Unlock,
  KeyRound,
  Terminal,
  Copy,
  Check,
  CheckSquare,
  Square,
  ChevronRight,
  BookOpen,
  Table as TableIcon,
  Code as CodeIcon,
  HelpCircle,
  Menu,
  X,
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
  onSelectStage: (stageNum: number) => void;
  onSelectFile: (file: ParsedFile | null) => void;
  onOpenUnlockModal: () => void;
  onOpenLeaderboard: () => void;
}

interface TerminalLog {
  id: string;
  time: string;
  type: 'init' | 'info' | 'directive' | 'success' | 'warn';
  text: string;
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
  onSelectStage,
  onSelectFile,
  onOpenUnlockModal,
  onOpenLeaderboard,
}: InBrowserIDEProps) {
  const { theme, setTheme } = useTheme();
  const [sidebarTab, setSidebarTab] = useState<'files' | 'stages'>('files');
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Toggle sidebar for both mobile drawer and desktop collapse
  const toggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      setSidebarVisible((prev) => !prev);
    }
  }, []);

  // Global Ctrl+B / Cmd+B keyboard shortcut to toggle sidebar like VS Code
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const selectedStage = stages.find((s) => s.stageNumber === selectedStageNumber);

  // Terminal Logs State
  const [logs, setLogs] = useState<TerminalLog[]>([
    {
      id: '1',
      time: '10:31:02',
      type: 'init',
      text: `CTF Sandbox Session Loaded for contestant '${participantName || 'Anonymous'}'`,
    },
    {
      id: '2',
      time: '10:31:04',
      type: 'info',
      text: `Mounted Stage ${selectedStageNumber} dataset in RAM (@zip.js zero-disk sandbox)`,
    },
    {
      id: '3',
      time: '10:31:05',
      type: 'directive',
      text: `Review ${allowedCopyFilename || 'ai_prompt.txt'} for directives and target passwords.`,
    },
  ]);

  // Log on stage or file change
  useEffect(() => {
    if (activeFile) {
      addLog('info', `Opened file: ${activeFile.name} (${activeFile.type})`);
    }
  }, [activeFile?.path]);

  const addLog = (type: TerminalLog['type'], text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev.slice(-30), { id: Math.random().toString(), time, type, text }]);
  };

  const clearTerminal = () => {
    setLogs([]);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2500);
  };

  const handleCopyPrompt = async () => {
    if (!activeFile?.content) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      showToast(`Copied ${activeFile.name} to clipboard`);
      addLog('success', `Copied authorized prompt content from '${activeFile.name}'`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Clipboard copy failed');
    }
  };

  // Determine Badge Type
  const getFileBadge = (file: ParsedFile) => {
    if (file.isCopyAllowed) return { label: 'PROMPT', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' };
    if (file.type === 'spreadsheet') return { label: 'DATA', color: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' };
    if (file.type === 'markdown') return { label: 'DOC', color: 'bg-sky-500/15 text-sky-400 border border-sky-500/30' };
    if (file.name.endsWith('.py')) return { label: 'PYTHON', color: 'bg-blue-500/15 text-blue-400 border border-blue-500/30' };
    return { label: 'CODE', color: 'bg-app-muted text-app-subtext' };
  };

  const getFileIcon = (file: ParsedFile) => {
    return <FileExtensionIcon filename={file.name} className="w-3.5 h-3.5 shrink-0" />;
  };

  const isCopyPermitted =
    activeFile &&
    allowedCopyFilename &&
    activeFile.name.toLowerCase() === allowedCopyFilename.toLowerCase();

  return (
    <div className="flex flex-col h-full bg-app-bg text-app-text overflow-hidden font-sans select-none transition-colors duration-150">
      
      {/* =========================================================================
          TOP HEADER / WORKSPACE BAR
         ========================================================================= */}
      <header className="h-14 sm:h-15 bg-app-surface border-b border-app-border px-3 sm:px-4 py-2 flex items-center justify-between text-xs sm:text-sm select-none gap-2">
        
        {/* Left: Hamburger (Mobile) + Branding & Stage Info */}
        <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
          <button
            onClick={toggleSidebar}
            className="p-1.5 -ml-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
            title="Toggle Primary Side Bar (Ctrl+B)"
            aria-label="Toggle Side Bar"
          >
            {mobileMenuOpen ? <X className="w-4 h-4 md:hidden" /> : null}
            <Menu className={`w-4 h-4 ${mobileMenuOpen ? 'hidden md:block' : 'block'}`} />
          </button>

          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 rounded bg-app-muted border border-app-border flex items-center justify-center font-bold text-app-text text-xs shrink-0">
              CS
            </div>
            <span className="font-semibold tracking-tight text-app-text text-xs sm:text-sm md:text-base hidden xs:inline sm:inline">
              Contest Sandbox
            </span>
          </div>

          <span className="text-app-border hidden sm:inline">/</span>

          {/* Stage Title Pill */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 bg-app-bg border border-app-border px-2 sm:px-3 py-1 rounded-md text-[11px] sm:text-xs min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"></span>
            <span className="font-semibold text-app-text whitespace-nowrap">Stage {selectedStageNumber}</span>
            <span className="text-app-subtext hidden xl:inline truncate max-w-[220px]">
              • {selectedStage?.title || 'Neural Anomaly Extraction & Recon'}
            </span>
          </div>
        </div>

        {/* Right: Theme Switcher + Unlock + Leaderboard + Profile */}
        <div className="flex items-center space-x-1.5 sm:space-x-3 shrink-0">
          
          {/* Theme Switcher Selector */}
          <div className="flex items-center space-x-0.5 sm:space-x-1 bg-app-bg border border-app-border p-0.5 sm:p-1 rounded-md">
            <button
              onClick={() => {
                setTheme('graphite');
                addLog('info', 'Switched theme to [GRAPHITE]');
              }}
              title="Graphite Theme"
              className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs transition-colors ${
                theme === 'graphite'
                  ? 'font-semibold bg-app-surface text-app-text border border-app-border shadow-xs'
                  : 'font-medium text-app-subtext hover:text-app-text'
              }`}
            >
              Graphite
            </button>
            <button
              onClick={() => {
                setTheme('forest');
                addLog('info', 'Switched theme to [FOREST]');
              }}
              title="Forest Theme"
              className={`px-2 sm:px-2.5 py-0.5 sm:py-1 rounded text-[10px] sm:text-xs transition-colors ${
                theme === 'forest'
                  ? 'font-semibold bg-app-surface text-app-text border border-app-border shadow-xs'
                  : 'font-medium text-app-subtext hover:text-app-text'
              }`}
            >
              Forest
            </button>
          </div>

          <div className="h-4 sm:h-5 w-px bg-app-border hidden xs:block"></div>

          {/* Stage Unlock Button */}
          <button
            onClick={onOpenUnlockModal}
            className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-md bg-app-accent text-app-bg font-medium text-[11px] sm:text-xs hover:opacity-90 transition-opacity cursor-pointer shadow-xs whitespace-nowrap"
          >
            <Lock className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Unlock Stage {selectedStageNumber + 1}</span>
            <span className="sm:hidden">Stage {selectedStageNumber + 1}</span>
            <span className="text-[10px] sm:text-[11px] font-semibold opacity-90 pl-0.5 sm:pl-1">
              +{selectedStage?.points || 100} PTS
            </span>
          </button>

          {/* Leaderboard Toggle */}
          <button
            onClick={onOpenLeaderboard}
            className="flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md border border-app-border bg-app-surface hover:bg-app-hover text-app-text text-[11px] sm:text-xs transition-colors cursor-pointer shrink-0"
            title="Open Leaderboard"
          >
            <Trophy className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span className="hidden md:inline">Leaderboard</span>
          </button>

          {/* User Badge */}
          <div className="flex items-center space-x-2 pl-0.5 sm:pl-1 shrink-0">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded bg-app-muted border border-app-border text-app-text font-semibold flex items-center justify-center text-[10px] sm:text-xs shrink-0">
              {participantName ? participantName.slice(0, 2).toUpperCase() : 'AM'}
            </div>
            <div className="hidden lg:block text-left leading-none">
              <div className="text-xs font-semibold text-app-text">
                {participantName || 'Contestant'}
              </div>
              <div className="text-[11px] font-medium text-app-subtext mt-0.5">
                {totalScore} PTS
              </div>
            </div>
          </div>

        </div>
      </header>

      {/* =========================================================================
          MAIN WORKSPACE (Left Sidebar + Center Editor)
         ========================================================================= */}
      <div className="flex-1 flex overflow-hidden relative">

        {/* Mobile Backdrop Overlay */}
        {mobileMenuOpen && (
          <div
            onClick={() => setMobileMenuOpen(false)}
            className="fixed inset-0 bg-black/60 z-30 md:hidden backdrop-blur-xs transition-opacity"
          />
        )}
        
        {/* LEFT SIDEBAR: FILE EXPLORER */}
        <aside
          className={`fixed md:static inset-y-0 left-0 z-40 md:z-auto w-72 md:w-60 border-r border-app-border bg-app-surface flex flex-col flex-shrink-0 select-none shadow-xl md:shadow-none transition-all duration-200 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          } ${!sidebarVisible ? 'md:hidden' : ''}`}
        >
          
          {/* Sidebar Tab Header */}
          <div className="px-3 py-2 border-b border-app-border flex items-center justify-between text-xs text-app-subtext font-medium bg-app-surface">
            <div className="flex items-center space-x-1.5">
              <FolderTree className="w-3.5 h-3.5" />
              <div className="flex space-x-2">
                <button
                  onClick={() => setSidebarTab('files')}
                  className={`uppercase tracking-wider text-[10px] font-semibold transition-colors ${
                    sidebarTab === 'files' ? 'text-app-text underline underline-offset-4' : 'text-app-subtext hover:text-app-text'
                  }`}
                >
                  Stage Files
                </button>
                <span>/</span>
                <button
                  onClick={() => setSidebarTab('stages')}
                  className={`uppercase tracking-wider text-[10px] font-semibold transition-colors ${
                    sidebarTab === 'stages' ? 'text-app-text underline underline-offset-4' : 'text-app-subtext hover:text-app-text'
                  }`}
                >
                  Stages
                </button>
              </div>
            </div>
            <span className="text-[10px] bg-app-bg px-1.5 py-0.5 rounded border border-app-border font-medium">
              {sidebarTab === 'files' ? `${files.length} Files` : `${stages.length} Stages`}
            </span>
          </div>

          {/* File Navigation List */}
          <div className="p-1.5 space-y-0.5 flex-1 overflow-y-auto">
            {sidebarTab === 'files' ? (
              loading ? (
                <div className="p-8 text-center text-app-subtext text-xs space-y-2">
                  <div className="w-5 h-5 border-2 border-app-accent border-t-transparent rounded-full animate-spin mx-auto" />
                  <p>Decompressing RAM archive...</p>
                </div>
              ) : files.length === 0 ? (
                <div className="p-6 text-center text-app-subtext text-xs">
                  No files extracted yet
                </div>
              ) : (
                files.map((file) => {
                  const isActive = activeFile?.path === file.path;
                  const badge = getFileBadge(file);

                  return (
                    <div
                      key={file.path}
                      onClick={() => {
                        onSelectFile(file);
                        setMobileMenuOpen(false);
                      }}
                      className={`flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                        isActive
                          ? 'bg-app-accentBg border border-app-accentBorder text-app-text font-semibold'
                          : 'text-app-subtext hover:bg-app-hover hover:text-app-text border border-transparent'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {getFileIcon(file)}
                        <span className="truncate">{file.name}</span>
                      </div>
                      <span
                        className={`text-[9px] px-1 py-0.2 rounded font-sans font-semibold tracking-wider ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })
              )
            ) : (
              // All Stages List
              stages.map((stage) => {
                const isCurrent = stage.stageNumber === currentStageNumber;
                const isSelected = stage.stageNumber === selectedStageNumber;
                const isUnlocked = stage.stageNumber <= currentStageNumber;

                return (
                  <div
                    key={stage.stageNumber}
                    onClick={() => {
                      onSelectStage(stage.stageNumber);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex items-center justify-between px-2.5 py-2 rounded cursor-pointer text-xs transition-colors ${
                      isSelected
                        ? 'bg-app-accentBg border border-app-accentBorder text-app-text font-semibold'
                        : 'text-app-subtext hover:bg-app-hover hover:text-app-text border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <div
                        className={`w-5 h-5 rounded flex items-center justify-center font-bold text-[10px] ${
                          isCurrent
                            ? 'bg-emerald-500 text-black'
                            : isUnlocked
                            ? 'bg-app-muted text-app-text border border-app-border'
                            : 'bg-app-bg text-app-subtext border border-app-border'
                        }`}
                      >
                        {stage.stageNumber}
                      </div>
                      <div className="truncate">
                        <div className="truncate text-xs">{stage.title}</div>
                        <div className="text-[10px] text-app-subtext font-medium">+{stage.points} PTS</div>
                      </div>
                    </div>
                    {stage.isPasswordProtected && <Lock className="w-3.5 h-3.5 text-app-subtext shrink-0" />}
                  </div>
                );
              })
            )}
          </div>

          {/* Stage Objectives Checklist Footer */}
          <div className="p-3 border-t border-app-border bg-app-bg text-xs space-y-2">
            <div className="flex items-center justify-between text-app-subtext text-[11px]">
              <span>Stage Objectives</span>
              <span className="font-medium text-app-text">
                {currentStageNumber > selectedStageNumber ? '2/2 Complete' : '1/2 Complete'}
              </span>
            </div>
            <div className="space-y-1 text-[11px]">
              <div className="flex items-center space-x-2 text-emerald-500">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Extract Parameter Directive</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentStageNumber > selectedStageNumber ? 'text-emerald-500' : 'text-app-subtext'
                }`}
              >
                {currentStageNumber > selectedStageNumber ? (
                  <CheckSquare className="w-3.5 h-3.5" />
                ) : (
                  <Square className="w-3.5 h-3.5" />
                )}
                <span>Submit Stage Key</span>
              </div>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL: MAIN CODE EDITOR & TERMINAL */}
        <main className="flex-1 flex flex-col bg-app-bg min-w-0">

          {activeFile ? (
            <>
              {/* Editor Tab Header & Actions */}
              <div className="h-9 border-b border-app-border bg-app-surface flex items-center justify-between px-2 sm:px-3 gap-2 overflow-x-auto select-none">
                <div className="flex items-center space-x-1.5 shrink-0">
                  {!sidebarVisible && (
                    <button
                      onClick={toggleSidebar}
                      className="hidden md:flex p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer mr-0.5"
                      title="Show Primary Side Bar (Ctrl+B)"
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Tab Pill */}
                  <div className="group flex items-center space-x-2 bg-app-bg border-t border-x border-app-border px-2.5 sm:px-3 py-1 text-xs text-app-text rounded-t border-b-0 -mb-px shrink-0 shadow-xs">
                  {getFileIcon(activeFile)}
                  <span className="font-medium truncate max-w-[120px] sm:max-w-xs">{activeFile.name}</span>
                  {isCopyPermitted ? (
                    <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-1 rounded border border-emerald-500/20 font-bold">
                      PROMPT
                    </span>
                  ) : (
                    <span className="text-[10px] text-app-subtext/80 bg-app-muted px-1 rounded">
                      READONLY
                    </span>
                  )}
                  {/* Close Cross Button like VS Code */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFile(null);
                    }}
                    className="p-0.5 ml-0.5 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                    title="Close tab (Ctrl+W)"
                    aria-label="Close tab"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

                {/* Action Tools */}
                <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
                  {isCopyPermitted && (
                    <button
                      onClick={handleCopyPrompt}
                      className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 rounded border border-app-border bg-app-bg hover:bg-app-hover text-app-text text-xs transition-colors cursor-pointer"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px] sm:text-xs">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-app-subtext" />
                          <span className="hidden sm:inline">Copy Prompt File</span>
                          <span className="sm:hidden text-[11px]">Copy</span>
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setTerminalOpen(!terminalOpen)}
                    className="p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                    title="Toggle Console Log"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Editor Text Surface / Sheet / Markdown Viewport */}
              <div className="flex-1 flex overflow-auto relative">
                {activeFile.type === 'spreadsheet' && activeFile.sheets ? (
                  <SheetViewer sheets={activeFile.sheets} filename={activeFile.name} />
                ) : activeFile.type === 'markdown' ? (
                  <div className="flex-1 p-6 overflow-y-auto">
                    <div className="max-w-3xl mx-auto prose prose-invert prose-slate prose-headings:text-app-text prose-p:text-app-text prose-pre:bg-app-surface prose-pre:border prose-pre:border-app-border">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeFile.content || ''}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  // Monospace Line-Numbered Code / Text Viewport
                  <div className="flex-1 flex font-mono text-xs overflow-auto p-4 bg-app-bg leading-relaxed">
                    {/* Line Numbers Column */}
                    <div className="select-none text-app-subtext/40 pr-4 text-right border-r border-app-border/40 font-sans space-y-1">
                      {(activeFile.content || '')
                        .split('\n')
                        .map((_, i) => (
                          <div key={i}>{i + 1}</div>
                        ))}
                    </div>

                    {/* Content Stream */}
                    <div className="pl-4 flex-1 text-app-text overflow-x-auto space-y-1 whitespace-pre">
                      {activeFile.content || ''}
                    </div>
                  </div>
                )}
              </div>

              {/* INTERACTIVE TERMINAL DRAWER */}
              {terminalOpen && (
                <div className="border-t border-app-border bg-app-surface font-mono text-xs p-3 select-text transition-all">
                  <div className="flex items-center justify-between text-app-subtext pb-2 mb-2 border-b border-app-border/60">
                    <div className="flex items-center space-x-2">
                      <Terminal className="w-3.5 h-3.5 text-app-accent" />
                      <span className="font-semibold text-app-text text-[11px] uppercase tracking-wider">
                        Sandbox Execution Log
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 text-[10px]">
                      <span className="text-emerald-500">● Sandbox Ready</span>
                      <button
                        onClick={clearTerminal}
                        className="hover:text-app-text cursor-pointer underline underline-offset-2"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px] max-h-36 overflow-y-auto">
                    {logs.length === 0 ? (
                      <p className="text-app-subtext italic">Terminal logs cleared.</p>
                    ) : (
                      logs.map((log) => (
                        <p key={log.id}>
                          <span className="text-app-subtext">[{log.time}]</span>{' '}
                          {log.type === 'init' && <span className="text-emerald-500 font-semibold">INIT: </span>}
                          {log.type === 'info' && <span className="text-amber-500 font-semibold">INFO: </span>}
                          {log.type === 'directive' && <span className="text-app-text font-semibold">DIRECTIVE: </span>}
                          {log.type === 'success' && <span className="text-emerald-500 font-bold">SUCCESS: </span>}
                          {log.type === 'warn' && <span className="text-rose-400 font-semibold">WARN: </span>}
                          <span>{log.text}</span>
                        </p>
                      ))
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Empty State */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-app-subtext">
              <FolderArchive className="w-12 h-12 mb-3 text-app-subtext/40" />
              <h3 className="text-sm font-semibold text-app-text">No File Selected</h3>
              <p className="text-xs text-app-subtext max-w-sm mt-1">
                Select a file from the stage sidebar to view it in-browser. All archives are decompressed in RAM with zero disk writes.
              </p>
            </div>
          )}
        </main>
      </div>

      {/* TOAST ALERT NOTIFICATION */}
      {toastMsg && (
        <div className="fixed bottom-4 right-4 bg-app-surface border border-app-border text-app-text px-3.5 py-2 rounded shadow-lg flex items-center space-x-2 text-xs z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-3.5 h-3.5 text-app-accent" />
          <span>{toastMsg}</span>
        </div>
      )}

    </div>
  );
}
