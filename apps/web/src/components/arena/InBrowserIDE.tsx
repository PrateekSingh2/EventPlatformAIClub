'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  MoreVertical,
} from 'lucide-react';

interface InBrowserIDEProps {
  stages: StageManifest[];
  currentStageNumber: number;
  selectedStageNumber: number;
  files: ParsedFile[];
  activeFile: ParsedFile | null;
  openFiles?: ParsedFile[];
  onOpenFilesChange?: (files: ParsedFile[]) => void;
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
  openFiles: propOpenFiles,
  onOpenFilesChange,
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

  // Multi-tab open files state: controlled or internal fallback
  const [internalOpenFiles, setInternalOpenFiles] = useState<ParsedFile[]>(activeFile ? [activeFile] : []);
  const openFiles = propOpenFiles !== undefined ? propOpenFiles : internalOpenFiles;

  const setOpenFiles = useCallback(
    (updater: ParsedFile[] | ((prev: ParsedFile[]) => ParsedFile[])) => {
      if (onOpenFilesChange) {
        if (typeof updater === 'function') {
          onOpenFilesChange(updater(openFiles));
        } else {
          onOpenFilesChange(updater);
        }
      } else {
        setInternalOpenFiles(updater);
      }
    },
    [onOpenFilesChange, openFiles]
  );
  // Split Editor View state (side-by-side view)
  const [splitView, setSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<ParsedFile | null>(null);
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const terminalLogsContainerRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Toggle sidebar for both mobile drawer and desktop collapse
  const toggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      setSidebarVisible((prev) => !prev);
    }
  }, []);

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

  // Auto-scroll terminal to bottom when new logs are added
  useEffect(() => {
    if (terminalOpen && terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs.length, terminalOpen]);

  const addLog = useCallback((type: TerminalLog['type'], text: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs((prev) => [...prev.slice(-30), { id: Math.random().toString(), time, type, text }]);
  }, []);

  // When stage files change (e.g. stage switch or initial load)
  useEffect(() => {
    if (files.length > 0) {
      if (activeFile && files.some((f) => f.path === activeFile.path)) {
        setOpenFiles([activeFile]);
      } else {
        setOpenFiles([files[0]]);
        onSelectFile(files[0]);
      }
    } else {
      setOpenFiles([]);
    }
    setSplitView(false);
    setSplitFile(null);
  }, [files, selectedStageNumber]);

  // Keep openFiles in sync whenever activeFile is selected
  useEffect(() => {
    if (activeFile) {
      setOpenFiles((prev) => {
        if (!prev.some((f) => f.path === activeFile.path)) {
          return [...prev, activeFile];
        }
        return prev;
      });
      addLog('info', `Focused file: ${activeFile.name} (${activeFile.type})`);
    }
  }, [activeFile?.path, addLog]);

  // Auto-scroll active tab into view when active tab changes
  useEffect(() => {
    if (activeFile && tabsContainerRef.current) {
      const activeTabEl = tabsContainerRef.current.querySelector('[data-active="true"]');
      if (activeTabEl) {
        activeTabEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    }
  }, [activeFile?.path]);

  // Handle opening a file from the sidebar
  const handleOpenFile = (file: ParsedFile) => {
    setOpenFiles((prev) => {
      if (prev.some((f) => f.path === file.path)) {
        return prev;
      }
      return [...prev, file];
    });
    onSelectFile(file);
    setMobileMenuOpen(false);
  };

  // Handle closing a tab
  const handleCloseTab = (fileToClose: ParsedFile, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    const nextOpen = openFiles.filter((f) => f.path !== fileToClose.path);
    setOpenFiles(nextOpen);

    // If closing the split pane file:
    if (splitFile?.path === fileToClose.path) {
      const remainingForSplit = nextOpen.find((f) => f.path !== activeFile?.path);
      if (remainingForSplit) {
        setSplitFile(remainingForSplit);
      } else {
        setSplitView(false);
        setSplitFile(null);
      }
    }

    // If closing the active tab:
    if (activeFile?.path === fileToClose.path) {
      if (nextOpen.length > 0) {
        const closedIdx = openFiles.findIndex((f) => f.path === fileToClose.path);
        const newActiveIdx = Math.max(0, Math.min(closedIdx, nextOpen.length - 1));
        onSelectFile(nextOpen[newActiveIdx]);
      } else {
        onSelectFile(null);
        setSplitView(false);
      }
    }
  };

  const handleCloseAllTabs = () => {
    setOpenFiles([]);
    onSelectFile(null);
    setSplitView(false);
    setSplitFile(null);
    setTabsMenuOpen(false);
  };

  const handleCloseOtherTabs = (keepFile: ParsedFile) => {
    setOpenFiles([keepFile]);
    onSelectFile(keepFile);
    if (splitFile?.path !== keepFile.path) {
      setSplitView(false);
      setSplitFile(null);
    }
    setTabsMenuOpen(false);
  };

  // Toggle Split View
  const handleToggleSplitView = useCallback(() => {
    setSplitView((prev) => {
      if (prev) {
        addLog('info', 'Closed Split View');
        return false;
      }
      // Find a secondary file to show in split view
      const otherFile =
        openFiles.find((f) => f.path !== activeFile?.path) ||
        files.find((f) => f.path !== activeFile?.path) ||
        activeFile;

      if (otherFile) {
        if (!openFiles.some((f) => f.path === otherFile.path)) {
          setOpenFiles((p) => [...p, otherFile]);
        }
        setSplitFile(otherFile);
        addLog('info', `Opened Split View: [${activeFile?.name || 'File'}] | [${otherFile.name}]`);
        return true;
      }
      return false;
    });
  }, [splitView, openFiles, files, activeFile, addLog]);

  // Swap Left and Right Panes in Split View
  const handleSwapSplit = () => {
    if (activeFile && splitFile) {
      const currentActive = activeFile;
      onSelectFile(splitFile);
      setSplitFile(currentActive);
      addLog('info', `Swapped split panes: [${splitFile.name}] ⇄ [${currentActive.name}]`);
    }
  };

  // Keyboard Shortcuts:
  // - Ctrl+B / Cmd+B: Toggle Sidebar
  // - Ctrl+W / Cmd+W: Close active tab
  // - Ctrl+\ / Cmd+\: Toggle Split View
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        toggleSidebar();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'w' || e.key === 'W')) {
        if (activeFile && openFiles.length > 0) {
          e.preventDefault();
          handleCloseTab(activeFile);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === '\\') {
        e.preventDefault();
        handleToggleSplitView();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar, activeFile, openFiles, handleToggleSplitView]);

  // Close tabs dropdown when clicking outside
  useEffect(() => {
    if (!tabsMenuOpen) return;
    const handleClickOutside = () => setTabsMenuOpen(false);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, [tabsMenuOpen]);

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

  // Reusable File Content Viewer
  const renderFileViewer = (file: ParsedFile) => {
    if (file.type === 'spreadsheet' && file.sheets) {
      return <SheetViewer sheets={file.sheets} filename={file.name} />;
    }
    if (file.type === 'markdown') {
      return (
        <div className="flex-1 p-4 sm:p-6 overflow-y-auto">
          <div className="max-w-3xl mx-auto prose prose-invert prose-slate prose-headings:text-app-text prose-p:text-app-text prose-pre:bg-app-surface prose-pre:border prose-pre:border-app-border">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {file.content || ''}
            </ReactMarkdown>
          </div>
        </div>
      );
    }
    // Monospace Line-Numbered Code / Text Viewport
    const lines = (file.content || '').split('\n');
    return (
      <div className="flex-1 flex font-mono text-xs overflow-auto p-4 bg-app-bg leading-relaxed">
        {/* Line Numbers Column */}
        <div className="select-none text-app-subtext/40 pr-4 text-right border-r border-app-border/40 font-sans space-y-1 shrink-0 min-w-[2.5rem]">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Content Stream */}
        <div className="pl-4 flex-1 text-app-text overflow-x-auto space-y-1 whitespace-pre">
          {file.content || ''}
        </div>
      </div>
    );
  };

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
                  const isOpen = openFiles.some((f) => f.path === file.path);
                  const badge = getFileBadge(file);

                  return (
                    <div
                      key={file.path}
                      onClick={() => handleOpenFile(file)}
                      className={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-xs transition-colors ${
                        isActive
                          ? 'bg-app-accentBg border border-app-accentBorder text-app-text font-semibold'
                          : isOpen
                          ? 'bg-app-hover/50 text-app-text border border-transparent'
                          : 'text-app-subtext hover:bg-app-hover hover:text-app-text border border-transparent'
                      }`}
                      title={isOpen ? `${file.name} (Already open in tabs)` : `Open ${file.name}`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {getFileIcon(file)}
                        <span className="truncate">{file.name}</span>
                        {isOpen && !isActive && (
                          <span
                            className="w-1.5 h-1.5 rounded-full bg-app-accent/60 shrink-0"
                            title="Open in editor tab"
                          />
                        )}
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

          {openFiles.length > 0 && activeFile ? (
            <>
              {/* =========================================================================
                  MULTI-TAB HEADER & ACTIONS BAR
                 ========================================================================= */}
              <div className="h-9 border-b border-app-border bg-app-surface flex items-center justify-between px-1.5 sm:px-2 gap-2 select-none">
                
                {/* Scrollable Open File Tabs Container */}
                <div
                  ref={tabsContainerRef}
                  className="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
                >
                  {!sidebarVisible && (
                    <button
                      onClick={toggleSidebar}
                      className="hidden md:flex p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer shrink-0 mr-1"
                      title="Show Primary Side Bar (Ctrl+B)"
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Render Tabs for Each Open File */}
                  {openFiles.map((file) => {
                    const isActive = activeFile?.path === file.path;
                    const isFilePrompt =
                      allowedCopyFilename &&
                      file.name.toLowerCase() === allowedCopyFilename.toLowerCase();

                    return (
                      <div
                        key={file.path}
                        data-active={isActive ? 'true' : 'false'}
                        onClick={() => onSelectFile(file)}
                        onAuxClick={(e) => {
                          // Middle mouse click closes tab (like in browsers/VS Code)
                          if (e.button === 1) {
                            e.preventDefault();
                            handleCloseTab(file);
                          }
                        }}
                        className={`group flex items-center space-x-1.5 sm:space-x-2 px-2.5 sm:px-3 py-1.5 text-xs rounded-t border-t border-x cursor-pointer transition-all duration-150 shrink-0 select-none ${
                          isActive
                            ? 'bg-app-bg text-app-text font-semibold border-app-border border-b-transparent shadow-xs relative z-10 -mb-px'
                            : 'bg-app-surface/60 text-app-subtext hover:text-app-text hover:bg-app-hover/80 border-transparent hover:border-app-border/40'
                        }`}
                        title={`${file.name} - Middle-click to close`}
                      >
                        {getFileIcon(file)}
                        <span className="truncate max-w-[110px] sm:max-w-[160px]">{file.name}</span>

                        {isFilePrompt ? (
                          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1 py-0.2 rounded border border-emerald-500/20 font-bold shrink-0">
                            PROMPT
                          </span>
                        ) : (
                          <span className="text-[10px] text-app-subtext/80 bg-app-muted px-1 rounded shrink-0">
                            READONLY
                          </span>
                        )}

                        {/* Close Cross Button */}
                        <button
                          type="button"
                          onClick={(e) => handleCloseTab(file, e)}
                          className="p-0.5 ml-0.5 rounded hover:bg-app-hover text-app-subtext/70 hover:text-app-text transition-colors cursor-pointer shrink-0"
                          title="Close tab (Ctrl+W)"
                          aria-label={`Close ${file.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Right Tab Actions: Split View, Close Tabs Dropdown, Copy Prompt, Terminal Toggle */}
                <div className="flex items-center space-x-1 sm:space-x-1.5 shrink-0 pl-1">
                  
                  {/* Split View Toggle Button */}
                  <button
                    onClick={handleToggleSplitView}
                    className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                      splitView
                        ? 'bg-app-accentBg text-app-accent border border-app-accentBorder font-medium'
                        : 'border border-transparent hover:bg-app-hover text-app-subtext hover:text-app-text'
                    }`}
                    title={splitView ? 'Close Split View (Ctrl+\\)' : 'Split Editor Right (Ctrl+\\)'}
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <rect width="18" height="18" x="3" y="3" rx="2" />
                      <path d="M12 3v18" />
                    </svg>
                    <span className="hidden xl:inline text-[11px]">
                      {splitView ? 'Single View' : 'Split View'}
                    </span>
                  </button>

                  {/* Tabs Actions Menu (Close Others, Close All) */}
                  {openFiles.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTabsMenuOpen((prev) => !prev);
                        }}
                        className="p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                        title="Tab options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {tabsMenuOpen && (
                        <div className="absolute right-0 top-full mt-1 w-40 bg-app-surface border border-app-border rounded-md shadow-xl py-1 z-50 text-xs">
                          {activeFile && (
                            <button
                              onClick={() => handleCloseOtherTabs(activeFile)}
                              className="w-full text-left px-3 py-1.5 hover:bg-app-hover text-app-text transition-colors cursor-pointer"
                            >
                              Close Other Tabs
                            </button>
                          )}
                          <button
                            onClick={handleCloseAllTabs}
                            className="w-full text-left px-3 py-1.5 hover:bg-app-hover text-rose-400 transition-colors cursor-pointer"
                          >
                            Close All Tabs
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Copy Prompt File Action */}
                  {isCopyPermitted && (
                    <button
                      onClick={handleCopyPrompt}
                      className="flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1 rounded border border-app-border bg-app-bg hover:bg-app-hover text-app-text text-xs transition-colors cursor-pointer"
                      title="Copy authorized prompt directives"
                    >
                      {copied ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                          <span className="text-emerald-400 text-[11px] sm:text-xs">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5 text-app-subtext" />
                          <span className="hidden sm:inline">Copy Prompt</span>
                          <span className="sm:hidden text-[11px]">Copy</span>
                        </>
                      )}
                    </button>
                  )}

                  {/* Terminal Toggle Button */}
                  <button
                    onClick={() => setTerminalOpen(!terminalOpen)}
                    className={`p-1 rounded hover:bg-app-hover transition-colors cursor-pointer ${
                      terminalOpen ? 'text-app-accent' : 'text-app-subtext hover:text-app-text'
                    }`}
                    title="Toggle Sandbox Log"
                  >
                    <Terminal className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* =========================================================================
                  EDITOR TEXT SURFACE / SPLIT VIEW VIEWPORT
                 ========================================================================= */}
              <div className="flex-1 flex overflow-hidden relative">
                {splitView && splitFile ? (
                  // DUAL PANE SPLIT VIEW
                  <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-app-border">
                    
                    {/* Primary Pane (Left) */}
                    <div
                      className={`flex-1 flex flex-col min-w-0 overflow-hidden ${
                        activeFile?.path === activeFile.path ? 'bg-app-bg' : ''
                      }`}
                      onClick={() => onSelectFile(activeFile)}
                    >
                      <div className="h-7 bg-app-surface/90 border-b border-app-border/80 px-3 flex items-center justify-between text-[11px] text-app-subtext select-none">
                        <div className="flex items-center space-x-1.5 truncate">
                          {getFileIcon(activeFile)}
                          <span className="font-medium text-app-text truncate">{activeFile.name}</span>
                          <span className="text-[10px] opacity-60">(Pane 1)</span>
                        </div>
                      </div>
                      <div className="flex-1 flex overflow-auto relative">
                        {renderFileViewer(activeFile)}
                      </div>
                    </div>

                    {/* Secondary Pane (Right) */}
                    <div
                      className="flex-1 flex flex-col min-w-0 overflow-hidden bg-app-bg"
                      onClick={() => onSelectFile(splitFile)}
                    >
                      <div className="h-7 bg-app-surface/90 border-b border-app-border/80 px-2 sm:px-3 flex items-center justify-between text-[11px] text-app-subtext gap-2 select-none">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          {getFileIcon(splitFile)}
                          {/* File picker for pane 2 */}
                          <select
                            value={splitFile.path}
                            onChange={(e) => {
                              const chosen = files.find((f) => f.path === e.target.value);
                              if (chosen) {
                                setSplitFile(chosen);
                                handleOpenFile(chosen);
                              }
                            }}
                            className="bg-transparent text-app-text font-medium text-[11px] border-none outline-none cursor-pointer max-w-[130px] sm:max-w-[180px] truncate"
                            title="Switch file in Pane 2"
                          >
                            {files.map((f) => (
                              <option key={f.path} value={f.path} className="bg-app-surface text-app-text">
                                {f.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] opacity-60 hidden sm:inline">(Pane 2)</span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Swap Panes Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwapSplit();
                            }}
                            className="p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                            title="Swap Left and Right Panes"
                          >
                            <svg
                              className="w-3 h-3"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="m16 3 4 4-4 4" />
                              <path d="M20 7H4" />
                              <path d="m8 21-4-4 4-4" />
                              <path d="M4 17h16" />
                            </svg>
                          </button>

                          {/* Close Split View */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSplitView(false);
                            }}
                            className="p-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                            title="Close Split View"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="flex-1 flex overflow-auto relative">
                        {renderFileViewer(splitFile)}
                      </div>
                    </div>

                  </div>
                ) : (
                  // SINGLE MAIN PANE VIEW
                  renderFileViewer(activeFile)
                )}
              </div>
            </>
          ) : (
            /* Empty State when no files are open */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-app-subtext">
              <FolderArchive className="w-12 h-12 mb-3 text-app-subtext/40" />
              <h3 className="text-sm font-semibold text-app-text">No File Open</h3>
              <p className="text-xs text-app-subtext max-w-sm mt-1">
                Select any file from the Stage Files explorer on the left to open it in a tab. You can open multiple files at once.
              </p>
              {files.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2 justify-center max-w-md">
                  {files.slice(0, 4).map((f) => (
                    <button
                      key={f.path}
                      onClick={() => handleOpenFile(f)}
                      className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-md border border-app-border bg-app-surface hover:bg-app-hover text-app-text text-xs transition-colors cursor-pointer shadow-xs"
                    >
                      {getFileIcon(f)}
                      <span>{f.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* INTERACTIVE TERMINAL DRAWER (Fixed height showing 5 logs at a time) */}
          {terminalOpen && (
            <div className="shrink-0 border-t border-app-border bg-app-surface font-mono text-xs p-2.5 sm:p-3 select-text transition-all">
              <div className="flex items-center justify-between text-app-subtext pb-1.5 mb-1.5 border-b border-app-border/60">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-3.5 h-3.5 text-app-accent" />
                  <span className="font-semibold text-app-text text-[11px] uppercase tracking-wider">
                    Sandbox Execution Log
                  </span>
                  <span className="text-[10px] text-app-subtext/70 bg-app-muted px-1.5 py-0.2 rounded font-sans">
                    {logs.length} logs
                  </span>
                </div>
                <div className="flex items-center space-x-2.5 text-[10px]">
                  <span className="text-emerald-500">● Sandbox Ready</span>
                  <button
                    onClick={() => setTerminalOpen(false)}
                    className="p-1 -mr-1 rounded hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                    title="Close Terminal"
                    aria-label="Close Terminal"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              {/* Fixed 5-log height container that does not grow or shrink with log count */}
              <div
                ref={terminalLogsContainerRef}
                className="h-[116px] overflow-y-auto space-y-1 text-[11px] pr-1"
              >
                {logs.length === 0 ? (
                  <p className="text-app-subtext italic py-1">Terminal logs cleared.</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="leading-5 flex items-start space-x-1.5 font-mono">
                      <span className="text-app-subtext/70 shrink-0">[{log.time}]</span>{' '}
                      <div className="break-all">
                        {log.type === 'init' && <span className="text-emerald-500 font-semibold">INIT: </span>}
                        {log.type === 'info' && <span className="text-amber-500 font-semibold">INFO: </span>}
                        {log.type === 'directive' && <span className="text-app-text font-semibold">DIRECTIVE: </span>}
                        {log.type === 'success' && <span className="text-emerald-500 font-bold">SUCCESS: </span>}
                        {log.type === 'warn' && <span className="text-rose-400 font-semibold">WARN: </span>}
                        <span>{log.text}</span>
                      </div>
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
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
