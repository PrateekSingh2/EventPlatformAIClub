'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ParsedFile, StageManifest, ContestStatus } from '@/lib/types';
import { SheetViewer } from './SheetViewer';
import { FileExtensionIcon } from './FileIcon';
import {
  FileText,
  FileSpreadsheet,
  FileCode,
  FolderArchive,
  FolderTree,
  Folder,
  FolderOpen,
  Trophy,
  Lock,
  Unlock,
  KeyRound,
  Terminal,
  CheckSquare,
  Square,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Table as TableIcon,
  Code as CodeIcon,
  HelpCircle,
  Menu,
  X,
  MoreVertical,
  FoldVertical,
  UnfoldVertical,
  LogOut,
  Sparkles,
  Maximize2,
  FileQuestion,
  Pause,
  Check,
  CheckCircle2,
  Megaphone,
  Search,
} from 'lucide-react';

interface InBrowserIDEProps {
  stages: StageManifest[];
  stageFilesMap?: Record<number, ParsedFile[]>;
  currentStageNumber: number;
  selectedStageNumber: number;
  files: ParsedFile[];
  activeFile: ParsedFile | null;
  openFiles?: ParsedFile[];
  onOpenFilesChange?: React.Dispatch<React.SetStateAction<ParsedFile[]>> | ((files: ParsedFile[] | ((prev: ParsedFile[]) => ParsedFile[])) => void);
  allowedCopyFilename: string;
  loading: boolean;
  participantName: string;
  totalScore: number;
  contestStatus?: ContestStatus;
  onSelectStage: (stageNum: number) => void;
  onSelectFile: (file: ParsedFile | null) => void;
  onOpenUnlockModal: () => void;
  onOpenLeaderboard: () => void;
  onLogout?: () => void;
  unreadBroadcastCount?: number;
  onOpenBroadcastDrawer?: () => void;
}

interface TerminalLog {
  id: string;
  time: string;
  type: 'init' | 'info' | 'directive' | 'success' | 'warn';
  text: string;
}

export function InBrowserIDE({
  stages,
  stageFilesMap,
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
  contestStatus = 'LIVE',
  onSelectStage,
  onSelectFile,
  onOpenUnlockModal,
  onOpenLeaderboard,
  onLogout,
  unreadBroadcastCount = 0,
  onOpenBroadcastDrawer,
}: InBrowserIDEProps) {
  const [terminalOpen, setTerminalOpen] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(true);

  // Navbar Dropdown States
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);

  // VS Code Explorer Stage Folders Expansion State
  const [expandedStages, setExpandedStages] = useState<Record<number, boolean>>(() => ({
    [selectedStageNumber]: true,
  }));

  // Editor Viewport States: Word wrap (ON by default), active line selection, markdown preview/source toggle
  const [wordWrap, setWordWrap] = useState(true);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [markdownMode, setMarkdownMode] = useState<'preview' | 'source'>('preview');

  // Multi-tab open files state: controlled or internal fallback
  const [internalOpenFiles, setInternalOpenFiles] = useState<ParsedFile[]>(activeFile ? [activeFile] : []);
  const openFiles = propOpenFiles !== undefined ? propOpenFiles : internalOpenFiles;

  const setOpenFiles = useCallback(
    (updater: ParsedFile[] | ((prev: ParsedFile[]) => ParsedFile[])) => {
      if (onOpenFilesChange) {
        onOpenFilesChange(updater as any);
      } else {
        setInternalOpenFiles(updater);
      }
    },
    [onOpenFilesChange]
  );

  // Split Editor View state (side-by-side view)
  const [splitView, setSplitView] = useState(false);
  const [splitFile, setSplitFile] = useState<ParsedFile | null>(null);
  const [activePane, setActivePane] = useState<'left' | 'right'>('left');
  const [tabsMenuOpen, setTabsMenuOpen] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const terminalLogsContainerRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Ensure selected stage folder is expanded when stage switches
  useEffect(() => {
    setExpandedStages((prev) => {
      if (prev[selectedStageNumber]) return prev;
      return { ...prev, [selectedStageNumber]: true };
    });
  }, [selectedStageNumber]);

  const toggleStage = (stageNum: number) => {
    setExpandedStages((prev) => ({
      ...prev,
      [stageNum]: !prev[stageNum],
    }));
  };

  // Single button logic: toggle expand/collapse all
  const areAllExpanded = stages.length > 0 && stages.every((s) => expandedStages[s.stageNumber]);

  const toggleExpandAll = () => {
    if (areAllExpanded) {
      setExpandedStages({});
    } else {
      const next: Record<number, boolean> = {};
      stages.forEach((s) => {
        next[s.stageNumber] = true;
      });
      setExpandedStages(next);
    }
  };

  // Toggle sidebar for both mobile drawer and desktop collapse
  const toggleSidebar = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setMobileMenuOpen((prev) => !prev);
    } else {
      setSidebarVisible((prev) => !prev);
    }
  }, []);

  const selectedStage = stages.find((s) => s.stageNumber === selectedStageNumber);
  const isFrozen = contestStatus === 'FROZEN';
  const isConcluded = contestStatus === 'CONCLUDED';

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
        if (!openFiles.some((f) => f.path === activeFile.path)) {
          setOpenFiles((prev) => [...prev, activeFile]);
        }
      } else if (!activeFile) {
        setOpenFiles([files[0]]);
        onSelectFile(files[0]);
      }
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
  }, [activeFile?.path, addLog, setOpenFiles]);

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
    if (splitView && activePane === 'right') {
      setSplitFile(file);
    } else {
      onSelectFile(file);
    }
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
        setActivePane('left');
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
        setActivePane('left');
      }
    }
  };

  const handleCloseAllTabs = () => {
    setOpenFiles([]);
    onSelectFile(null);
    setSplitView(false);
    setSplitFile(null);
    setActivePane('left');
    setTabsMenuOpen(false);
  };

  const handleCloseOtherTabs = (keepFile: ParsedFile) => {
    setOpenFiles([keepFile]);
    onSelectFile(keepFile);
    if (splitFile?.path !== keepFile.path) {
      setSplitView(false);
      setSplitFile(null);
      setActivePane('left');
    }
    setTabsMenuOpen(false);
  };

  // Toggle Split View
  const handleToggleSplitView = useCallback(() => {
    if (splitView) {
      setSplitView(false);
      setSplitFile(null);
      setActivePane('left');
      addLog('info', 'Closed Split View');
    } else {
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
        setSplitView(true);
        setActivePane('right');
        addLog('info', `Opened Split View: [${activeFile?.name || 'File'}] | [${otherFile.name}]`);
      }
    }
  }, [splitView, openFiles, files, activeFile, addLog, setOpenFiles]);

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

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setTabsMenuOpen(false);
      setProfileMenuOpen(false);
    };
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  const clearTerminal = () => {
    setLogs([]);
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => {
      setToastMsg(null);
    }, 2500);
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

  // Syntax highlighter for code and directives with high contrast and legible typography
  const renderHighlightedLine = (line: string, filename: string): React.ReactNode => {
    if (!line) return <span>&nbsp;</span>;

    const ext = filename.split('.').pop()?.toLowerCase();

    // Python code highlighting (High contrast OneDark / TokyoNight palette)
    if (ext === 'py') {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) {
        return <span className="text-slate-400 italic font-mono">{line}</span>;
      }

      const tokenRegex = /(#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:def|class|import|from|return|if|elif|else|while|for|in|try|except|finally|with|as|lambda|pass|break|continue|raise|yield|assert|async|await)\b)|(\b(?:True|False|None|self)\b)|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_][A-Za-z0-9_]*(?=\s*\())/g;
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          elements.push(line.slice(lastIndex, match.index));
        }
        const [full, comment, str, kw, builtin, num, fn] = match;
        if (comment) {
          elements.push(<span key={match.index} className="text-slate-400 italic font-mono">{comment}</span>);
        } else if (str) {
          elements.push(<span key={match.index} className="text-emerald-300 font-mono">{str}</span>);
        } else if (kw) {
          elements.push(<span key={match.index} className="text-purple-400 font-semibold font-mono">{kw}</span>);
        } else if (builtin) {
          elements.push(<span key={match.index} className="text-sky-300 font-medium font-mono">{builtin}</span>);
        } else if (num) {
          elements.push(<span key={match.index} className="text-amber-300 font-mono">{num}</span>);
        } else if (fn) {
          elements.push(<span key={match.index} className="text-yellow-300 font-medium font-mono">{fn}</span>);
        }
        lastIndex = tokenRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
      }
      return elements.length > 0 ? elements : line;
    }

    // JSON highlighting
    if (ext === 'json') {
      const tokenRegex = /("(?:\\.|[^"\\])*"(?=\s*:))|("(?:\\.|[^"\\])*")|(\b(?:true|false|null)\b)|(-?\b\d+(?:\.\d+)?\b)/g;
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          elements.push(line.slice(lastIndex, match.index));
        }
        const [full, key, str, boolNull, num] = match;
        if (key) {
          elements.push(<span key={match.index} className="text-sky-300 font-medium font-mono">{key}</span>);
        } else if (str) {
          elements.push(<span key={match.index} className="text-emerald-300 font-mono">{str}</span>);
        } else if (boolNull) {
          elements.push(<span key={match.index} className="text-amber-300 font-semibold font-mono">{boolNull}</span>);
        } else if (num) {
          elements.push(<span key={match.index} className="text-amber-300 font-mono">{num}</span>);
        }
        lastIndex = tokenRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
      }
      return elements.length > 0 ? elements : line;
    }

    // Prompt & Text Directives (e.g. ai_prompt.txt, .env, .txt, .md)
    if (ext === 'txt' || ext === 'prompt' || ext === 'env' || ext === 'sh' || ext === 'md') {
      const trimmed = line.trimStart();
      if (trimmed.startsWith('#')) {
        return <span className="text-slate-400 italic font-mono">{line}</span>;
      }

      // Syntax highlight headers, strings, URLs, and key labels WITHOUT ANY BOXES OR BORDERS
      const tokenRegex = /(^[A-Za-z0-9_\-\s]{2,35}:)|(#[^\n]*)|(https?:\/\/[^\s]+)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\b(?:PASSWORD|FLAG|SECRET|TOKEN|KEY)\b)/gi;
      const elements: React.ReactNode[] = [];
      let lastIndex = 0;
      let match;

      while ((match = tokenRegex.exec(line)) !== null) {
        if (match.index > lastIndex) {
          elements.push(line.slice(lastIndex, match.index));
        }
        const [full, header, comment, url, str, secKey] = match;
        if (header) {
          // Pure text styling - NO BOX, NO BORDER, NO BACKGROUND PILL
          elements.push(
            <span key={match.index} className="text-emerald-400 font-semibold font-mono">
              {header}
            </span>
          );
        } else if (comment) {
          elements.push(
            <span key={match.index} className="text-slate-400 italic font-mono">
              {comment}
            </span>
          );
        } else if (url) {
          elements.push(
            <span key={match.index} className="text-cyan-400 underline underline-offset-2 hover:text-cyan-300">
              {url}
            </span>
          );
        } else if (str) {
          elements.push(
            <span key={match.index} className="text-emerald-300 font-mono">
              {str}
            </span>
          );
        } else if (secKey) {
          elements.push(
            <span key={match.index} className="text-amber-400 font-bold font-mono">
              {secKey}
            </span>
          );
        } else {
          elements.push(full);
        }
        lastIndex = tokenRegex.lastIndex;
      }
      if (lastIndex < line.length) {
        elements.push(line.slice(lastIndex));
      }
      return elements.length > 0 ? elements : line;
    }

    return line;
  };

  // Reusable File Content Viewer with Zero Line-Number Mismatch
  const renderFileViewer = (file: ParsedFile) => {
    if (file.type === 'spreadsheet' && file.sheets) {
      return <SheetViewer sheets={file.sheets} filename={file.name} />;
    }

    const isPrompt = allowedCopyFilename && file.name.toLowerCase() === allowedCopyFilename.toLowerCase();
    const lines = (file.content || '').split('\n');

    // File type label for status bar
    const fileTypeLabel =
      file.type === 'markdown'
        ? 'Markdown'
        : file.name.endsWith('.py')
        ? 'Python 3'
        : file.name.endsWith('.json')
        ? 'JSON'
        : isPrompt
        ? 'AI Prompt Directive'
        : 'Plain Text';

    if (file.type === 'markdown' && markdownMode === 'preview') {
      return (
        <div className="flex-1 flex flex-col h-full bg-app-bg overflow-hidden select-text">
          {/* Markdown Breadcrumb & Mode Switcher */}
          <div className="h-9 bg-app-surface/90 backdrop-blur-md border-b border-white/[0.08] px-3 flex items-center justify-between text-xs select-none shrink-0 gap-2 font-sans">
            <div className="flex items-center space-x-1.5 min-w-0">
              <Folder className="w-3.5 h-3.5 text-app-subtext shrink-0" />
              <span className="text-app-subtext truncate">Stage {file.stageNumber || selectedStageNumber}</span>
              <span className="text-app-subtext/60">/</span>
              <FileExtensionIcon filename={file.name} className="w-3.5 h-3.5 shrink-0" />
              <span className="font-semibold text-slate-100 truncate">{file.name}</span>
              <span className="text-[10px] text-slate-400 hidden sm:inline">• Markdown Document</span>
            </div>
            <div className="flex items-center space-x-2 text-xs">
              {/* Preview vs Source Toggle */}
              <div className="flex items-center bg-app-bg/80 border border-white/10 rounded-lg p-0.5 text-[11px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]">
                <button
                  onClick={() => setMarkdownMode('preview')}
                  className="px-2 py-0.5 rounded-md bg-app-accentBg text-app-accent font-medium shadow-[0_1px_4px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors cursor-pointer"
                >
                  Preview
                </button>
                <button
                  onClick={() => setMarkdownMode('source')}
                  className="px-2 py-0.5 rounded-md text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                >
                  Source
                </button>
              </div>

              {isPrompt && (
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer bg-emerald-500 text-slate-950 hover:bg-emerald-400 shadow-[0_2px_8px_rgba(16,185,129,0.3)] active:scale-95"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-slate-950" /> : <Copy className="w-3.5 h-3.5 text-slate-950" />}
                  <span>{copied ? 'Copied!' : 'Copy Prompt'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Markdown Content Canvas */}
          <div className="flex-1 p-5 sm:p-7 overflow-y-auto">
            <div
              className="max-w-4xl mx-auto prose prose-invert prose-headings:text-white prose-h1:text-2xl prose-h1:font-bold prose-h1:border-b prose-h1:border-white/10 prose-h1:pb-2.5 prose-h1:mb-5 prose-h2:text-xl prose-h2:font-bold prose-h2:text-emerald-400 prose-h2:mt-7 prose-h2:mb-3 prose-h3:text-lg prose-h3:font-semibold prose-h3:text-cyan-300 prose-p:text-slate-100 prose-p:text-[14.5px] sm:prose-p:text-[15px] prose-p:leading-relaxed prose-strong:text-white prose-strong:font-bold prose-code:text-cyan-300 prose-code:bg-white/[0.08] prose-code:border prose-code:border-white/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-[13px] prose-code:before:content-none prose-code:after:content-none prose-pre:bg-[#16181d] prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl prose-pre:p-4 prose-pre:shadow-lg prose-pre:text-[13.5px] prose-blockquote:border-l-4 prose-blockquote:border-cyan-500 prose-blockquote:bg-cyan-950/20 prose-blockquote:px-4 prose-blockquote:py-2.5 prose-blockquote:rounded-r-lg prose-blockquote:text-slate-200 prose-blockquote:italic prose-table:border prose-table:border-white/10 prose-th:bg-white/[0.06] prose-th:text-slate-200 prose-th:p-3 prose-td:border-t prose-td:border-white/10 prose-td:p-3 prose-td:text-slate-300"
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {file.content || ''}
              </ReactMarkdown>
            </div>
          </div>

          {/* Editor Status Bar */}
          <div className="h-6 bg-app-surface/90 border-t border-white/[0.08] px-3 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 font-mono">
            <div className="flex items-center space-x-3">
              <span>Markdown Preview</span>
              <span className="hidden sm:inline text-slate-600">|</span>
              <span className="hidden sm:inline">{lines.length} lines</span>
              <span className="hidden md:inline text-slate-600">|</span>
              <span className="hidden md:inline">UTF-8</span>
            </div>
            <div className="flex items-center space-x-3">
              <span className="hidden sm:inline font-sans text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                {fileTypeLabel}
              </span>
              {isPrompt ? (
                <span className="flex items-center space-x-1 text-emerald-400 font-semibold font-sans text-[10px]">
                  <Check className="w-3 h-3" />
                  <span>Copy Allowed</span>
                </span>
              ) : (
                <span className="flex items-center space-x-1 text-slate-500 font-sans text-[10px]">
                  <Lock className="w-2.5 h-2.5" />
                  <span>Protected</span>
                </span>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Monospace Row-by-Row Code / Text Viewport (Perfect line number alignment)
    return (
      <div className="flex-1 flex flex-col h-full bg-app-bg overflow-hidden font-mono select-text">
        {/* Editor Toolbar & Breadcrumb */}
        <div className="h-9 bg-app-surface/90 backdrop-blur-md border-b border-white/[0.08] px-3 flex items-center justify-between text-xs select-none shrink-0 gap-2 font-sans">
          <div className="flex items-center space-x-1.5 min-w-0">
            <Folder className="w-3.5 h-3.5 text-app-subtext shrink-0" />
            <span className="text-app-subtext truncate">Stage {file.stageNumber || selectedStageNumber}</span>
            <span className="text-app-subtext/60">/</span>
            <FileExtensionIcon filename={file.name} className="w-3.5 h-3.5 shrink-0" />
            <span className="font-semibold text-slate-100 truncate">{file.name}</span>
            {isPrompt && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider shrink-0 ml-1 border bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
              >
                PROMPT DIRECTIVE
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px] shrink-0">
            {file.type === 'markdown' && (
              <div className="flex items-center bg-app-bg/80 border border-white/10 rounded-lg p-0.5 text-[10px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.3)]">
                <button
                  onClick={() => setMarkdownMode('preview')}
                  className="px-1.5 py-0.5 rounded-md text-app-subtext hover:text-app-text transition-colors cursor-pointer"
                >
                  Preview
                </button>
                <button
                  onClick={() => setMarkdownMode('source')}
                  className="px-1.5 py-0.5 rounded-md bg-app-accentBg text-app-accent font-medium shadow-[0_1px_4px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.1)] transition-colors cursor-pointer"
                >
                  Source
                </button>
              </div>
            )}

            <button
              onClick={() => setWordWrap(!wordWrap)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-medium border transition-all cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.15),_inset_0_1px_0_rgba(255,255,255,0.08)] ${
                wordWrap
                  ? 'bg-app-accentBg text-app-accent border-app-accentBorder'
                  : 'border-white/10 hover:bg-white/5 text-slate-400'
              }`}
              title={wordWrap ? 'Word Wrap: ON (Click to disable)' : 'Word Wrap: OFF (Click to enable)'}
            >
              {wordWrap ? 'Wrap: On' : 'Wrap: Off'}
            </button>

            <span className="text-slate-400 hidden sm:inline font-mono text-[11px]">
              {lines.length} lines
            </span>

            <span
              className="flex items-center space-x-1 px-1.5 py-0.5 text-slate-500 text-[10px]"
              title="Anti-cheat: Content copy disabled"
            >
              <Lock className="w-2.5 h-2.5" />
              <span className="hidden sm:inline">Copy Disabled</span>
            </span>
          </div>
        </div>

        {/* Code Rows Surface: Fixed alignment row-by-row */}
        <div className="flex-1 overflow-auto py-2 bg-app-bg">
          {lines.map((lineText, idx) => {
            const lineNum = idx + 1;
            const isSelected = selectedLine === lineNum;

            return (
              <div
                key={lineNum}
                onClick={() => setSelectedLine(lineNum)}
                className={`group flex items-start hover:bg-white/[0.03] transition-colors ${
                  isSelected ? 'bg-white/[0.05] border-l-2 border-cyan-400' : 'border-l-2 border-transparent'
                }`}
              >
                {/* Line Number Gutter */}
                <div
                  className={`w-12 sm:w-14 shrink-0 pr-3 text-right select-none border-r border-white/[0.08] font-mono text-[12px] leading-relaxed sm:leading-[1.75] tabular-nums cursor-pointer transition-colors ${
                    isSelected ? 'text-cyan-400 font-bold bg-white/[0.04]' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                  title={`Line ${lineNum}`}
                >
                  {lineNum}
                </div>

                {/* Line Content with Clean Unboxed Text */}
                <div
                  className={`pl-4 pr-6 flex-1 text-slate-100 font-mono text-[13.5px] sm:text-[14px] leading-relaxed sm:leading-[1.75] min-h-[26px] ${
                    wordWrap ? 'whitespace-pre-wrap break-words' : 'whitespace-pre overflow-x-visible'
                  }`}
                >
                  {renderHighlightedLine(lineText, file.name) || '\u00A0'}
                </div>
              </div>
            );
          })}
        </div>

        {/* Editor Bottom Status Bar */}
        <div className="h-6 bg-app-surface/90 border-t border-white/[0.08] px-3 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 font-mono">
          <div className="flex items-center space-x-3">
            <span>Ln {selectedLine || 1}, Col 1</span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="hidden sm:inline">{lines.length} lines</span>
            <span className="hidden md:inline text-slate-600">|</span>
            <span className="hidden md:inline">UTF-8</span>
          </div>
          <div className="flex items-center space-x-3">
            <span className="hidden sm:inline font-sans text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              {fileTypeLabel}
            </span>
            {isPrompt ? (
              <span className="flex items-center space-x-1 text-emerald-400 font-semibold font-sans text-[10px]">
                <Check className="w-3 h-3" />
                <span>Copy Allowed</span>
              </span>
            ) : (
              <span className="flex items-center space-x-1 text-slate-500 font-sans text-[10px]">
                <Lock className="w-2.5 h-2.5" />
                <span>Protected</span>
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-app-bg text-app-text overflow-hidden font-sans select-none transition-colors duration-150 relative">
      {/* Ambient background light gradients for authentic glassmorphism */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none -z-10" />
      
      {/* =========================================================================
          TOP HEADER / WORKSPACE BAR
         ========================================================================= */}
      <header className="h-14 sm:h-15 bg-app-surface/85 backdrop-blur-xl border-b border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between text-xs sm:text-sm select-none gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.2)] relative z-20">
        
        {/* Left: Hamburger (Mobile) + Branding */}
        <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
          <button
            onClick={toggleSidebar}
            className="p-1.5 -ml-1 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 text-app-subtext hover:text-app-text transition-all cursor-pointer"
            title="Toggle Primary Side Bar (Ctrl+B)"
            aria-label="Toggle Side Bar"
          >
            {mobileMenuOpen ? <X className="w-4 h-4 md:hidden" /> : null}
            <Menu className={`w-4 h-4 ${mobileMenuOpen ? 'hidden md:block' : 'block'}`} />
          </button>

          <div className="flex items-center space-x-2 shrink-0">
            <div className="w-7 h-7 rounded-xl bg-white/[0.04] border border-white/15 flex items-center justify-center font-bold text-app-accent text-xs shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.2),_0_2px_6px_rgba(0,0,0,0.35)]">
              CS
            </div>
            <span className="font-semibold tracking-tight text-app-text text-xs sm:text-sm md:text-base">
              Contest Sandbox
            </span>
          </div>
          {isFrozen && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 font-bold ml-2">
              <Pause className="w-3 h-3 fill-amber-400" />
              SUBMISSIONS FROZEN
            </span>
          )}

          {isConcluded && (
            <span className="flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 font-bold ml-2">
              <CheckCircle2 className="w-3 h-3 text-purple-400" />
              CONTEST CONCLUDED
            </span>
          )}
        </div>

        {/* Right: Unlock Button (leftmost) + Theme Dropdown + Leaderboard Logo Button + Profile Dropdown */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          
          {/* 1. Unlock Next Stage Button (Far Left of Right-Side Actions) */}
          {isFrozen ? (
            <button
              disabled
              title="Contest is currently frozen. Stage submissions are paused."
              className="flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-bold opacity-75 cursor-not-allowed whitespace-nowrap"
            >
              <Pause className="w-3.5 h-3.5 fill-amber-400" />
              <span>Submissions Paused</span>
            </button>
          ) : isConcluded ? (
            <button
              disabled
              title="Contest is concluded. Submissions are closed."
              className="flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-purple-950/60 border border-purple-500/40 text-purple-300 text-xs font-bold opacity-75 cursor-not-allowed whitespace-nowrap"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-purple-400" />
              <span>Contest Concluded</span>
            </button>
          ) : (
            <button
              onClick={onOpenUnlockModal}
              className="flex items-center space-x-1 sm:space-x-1.5 px-3 sm:px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-semibold text-xs hover:brightness-105 active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_14px_rgba(16,185,129,0.35),_inset_0_1px_0_rgba(255,255,255,0.4)] whitespace-nowrap"
              title={`Unlock Stage ${selectedStageNumber + 1}`}
            >
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Unlock Stage {selectedStageNumber + 1}</span>
              <span className="sm:hidden">Stage {selectedStageNumber + 1}</span>
              <span className="text-[10px] font-bold bg-black/20 px-1.5 py-0.5 rounded ml-0.5 sm:ml-1">
                +{selectedStage?.points || 100} PTS
              </span>
            </button>
          )}

          {/* 2. Broadcast Feed Side Panel Button */}
          <button
            onClick={onOpenBroadcastDrawer}
            className="relative p-2 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-text transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-xs"
            title="Tournament Broadcast Feed"
            aria-label="Open Broadcast Feed"
          >
            <Megaphone className="w-4 h-4 text-cyan-500 dark:text-cyan-400 shrink-0" />
            {unreadBroadcastCount && unreadBroadcastCount > 0 ? (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-rose-500 text-[9px] font-bold text-white shadow-xs">
                {unreadBroadcastCount > 9 ? '9+' : unreadBroadcastCount}
              </span>
            ) : null}
          </button>

          {/* 3. Leaderboard Simple Logo-like Button */}
          <button
            onClick={onOpenLeaderboard}
            className="relative p-2 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-text transition-all cursor-pointer flex items-center justify-center shrink-0 shadow-xs"
            title="Live Leaderboard"
            aria-label="Open Leaderboard"
          >
            <Trophy className="w-4 h-4 text-amber-500 dark:text-amber-400 shrink-0" />
            <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </button>

          {/* 4. Profile Dropdown Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setProfileMenuOpen((prev) => !prev);
              }}
              className="flex items-center space-x-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover transition-all cursor-pointer shadow-xs"
              title="User Account"
            >
              <div className="w-6 h-6 rounded-lg bg-app-muted border border-app-border text-app-accent font-bold flex items-center justify-center text-[10px] shrink-0 shadow-xs">
                {participantName ? participantName.slice(0, 2).toUpperCase() : 'AM'}
              </div>
              <span className="text-xs font-semibold text-app-text hidden sm:inline max-w-[120px] truncate">
                {participantName || 'Contestant'}
              </span>
              <ChevronDown className={`w-3 h-3 text-app-subtext transition-transform duration-150 ${profileMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {profileMenuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-full mt-2 w-56 bg-app-surface border border-app-border rounded-2xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                {/* User Info Header */}
                <div className="px-3.5 py-2 border-b border-app-border">
                  <div className="font-semibold text-app-text truncate text-xs">
                    {participantName || 'Contestant'}
                  </div>
                  <div className="flex items-center justify-between mt-1 text-[11px] text-app-subtext">
                    <span className="px-2 py-0.5 rounded-md bg-app-muted border border-app-border text-[10px] font-mono uppercase">
                      Participant
                    </span>
                    <span className="font-bold text-app-accent font-mono">
                      {totalScore} PTS
                    </span>
                  </div>
                </div>

                {/* Dropdown Items */}
                <div className="pt-1">
                  <button
                    onClick={() => {
                      setProfileMenuOpen(false);
                      if (onLogout) {
                        onLogout();
                      } else {
                        localStorage.removeItem('participant_token');
                        window.location.href = '/';
                      }
                    }}
                    className="w-full text-left px-3.5 py-2 flex items-center space-x-2 text-rose-500 dark:text-rose-400 hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer font-medium"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Log Out</span>
                  </button>
                </div>
              </div>
            )}
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
          className={`fixed md:static inset-y-0 left-0 z-40 md:z-auto w-72 md:w-64 border-r border-white/[0.08] bg-app-surface/80 backdrop-blur-xl flex flex-col flex-shrink-0 select-none shadow-xl md:shadow-none transition-all duration-200 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
          } ${!sidebarVisible ? 'md:hidden' : ''}`}
        >
          {/* Explorer Header (VS Code style) */}
          <div className="h-9 px-3 border-b border-white/[0.08] flex items-center justify-between text-xs text-app-subtext font-semibold uppercase tracking-wider bg-white/[0.02] select-none shrink-0">
            <div className="flex items-center space-x-2">
              <FolderTree className="w-3.5 h-3.5 text-app-accent" />
              <span className="text-[11px] font-bold text-app-text tracking-wider">EXPLORER</span>
            </div>
            <div className="flex items-center space-x-1">
              <button
                onClick={toggleExpandAll}
                className="p-1 rounded-lg hover:bg-white/5 border border-transparent hover:border-white/10 text-app-subtext hover:text-app-text transition-all cursor-pointer"
                title={areAllExpanded ? 'Collapse All Stages' : 'Expand All Stages'}
                aria-label={areAllExpanded ? 'Collapse All Stages' : 'Expand All Stages'}
              >
                {areAllExpanded ? (
                  <FoldVertical className="w-3.5 h-3.5 text-app-accent" />
                ) : (
                  <UnfoldVertical className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>

          {/* VS Code Stage Tree View */}
          <div className="py-1 flex-1 overflow-y-auto select-none font-sans">
            <div className="px-3 py-1 text-[10px] font-semibold tracking-wider text-app-subtext uppercase flex items-center justify-between">
              <span>SANDBOX DIRECTORY</span>
              <span className="text-[9px] bg-app-bg/80 px-1.5 py-0.5 rounded border border-white/10 font-mono">
                {stages.length} Stages
              </span>
            </div>

            {stages.map((stage) => {
              const isCurrent = stage.stageNumber === currentStageNumber;
              const isSelected = stage.stageNumber === selectedStageNumber;
              const isUnlocked = stage.stageNumber <= currentStageNumber;
              const isExpanded = Boolean(expandedStages[stage.stageNumber]);
              const stageFiles = stageFilesMap?.[stage.stageNumber] || (isSelected ? files : []);
              const isLoadingStage = loading && isSelected && stageFiles.length === 0;

              return (
                <div key={stage.stageNumber} className="select-none">
                  {/* Stage Folder Row as a clean VS Code Tree Link */}
                  <a
                    href={`#stage-${stage.stageNumber}`}
                    onClick={(e) => {
                      e.preventDefault();
                      toggleStage(stage.stageNumber);
                      if (isUnlocked && !isSelected) {
                        onSelectStage(stage.stageNumber);
                      }
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 cursor-pointer transition-colors text-xs select-none no-underline group ${
                      isSelected
                        ? 'bg-[#37373d]/90 text-white font-medium'
                        : 'text-slate-300 hover:bg-white/[0.04] hover:text-white'
                    }`}
                    title={`Stage ${stage.stageNumber}: ${stage.title} (Click to ${isExpanded ? 'collapse' : 'expand'})`}
                  >
                    <div className="flex items-center space-x-1.5 min-w-0 flex-1">
                      {/* Chevron Toggle Icon */}
                      <span className="p-0.5 text-slate-400 group-hover:text-slate-200 shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5" />
                        )}
                      </span>

                      {/* Folder / Lock Icon */}
                      {!isUnlocked ? (
                        <Lock className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                      ) : isExpanded ? (
                        <FolderOpen
                          className={`w-3.5 h-3.5 shrink-0 ${
                            isSelected ? 'text-amber-400' : 'text-app-accent'
                          }`}
                        />
                      ) : (
                        <Folder className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}

                      {/* Stage Name & Subtitle */}
                      <div className="truncate flex-1 min-w-0">
                        <span className="truncate">Stage {stage.stageNumber}</span>
                        {stage.title && (
                          <span className="text-[10px] text-slate-400 font-normal truncate block -mt-0.5 opacity-75">
                            {stage.title}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Stage Status / Points Indicator */}
                    <div className="flex items-center space-x-1 shrink-0 ml-1">
                      {isCurrent ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          ACTIVE
                        </span>
                      ) : !isUnlocked ? (
                        <span className="text-[9px] px-1.5 py-0.2 rounded font-mono font-medium text-rose-400 opacity-80">
                          LOCKED
                        </span>
                      ) : (
                        <span className="text-[9px] font-mono text-slate-400">
                          +{stage.points}
                        </span>
                      )}
                    </div>
                  </a>

                  {/* Expanded Stage Folder Contents */}
                  {isExpanded && (
                    <div className="py-0.5 space-y-0.5">
                      {!isUnlocked ? (
                        <div className="ml-6 mr-2 px-2.5 py-2 text-[11px] space-y-1.5 bg-white/[0.02] border-l-2 border-amber-500/50 my-1">
                          <div className="flex items-center space-x-1.5 text-amber-400 font-medium">
                            <Lock className="w-3 h-3 shrink-0" />
                            <span>Stage {stage.stageNumber} Locked</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            Complete previous stage directives and enter archive key to decrypt.
                          </p>
                          <a
                            href="#decrypt"
                            onClick={(e) => {
                              e.preventDefault();
                              onOpenUnlockModal();
                            }}
                            className="text-amber-400 hover:text-amber-300 hover:underline inline-flex items-center gap-1.5 text-[11px] font-medium py-0.5 transition-colors cursor-pointer"
                          >
                            <KeyRound className="w-3 h-3 shrink-0" />
                            <span>Enter Decryption Key &rarr;</span>
                          </a>
                        </div>
                      ) : isLoadingStage ? (
                        <div className="flex items-center space-x-2 pl-7 pr-2 py-1.5 text-xs text-slate-400">
                          <div className="w-3 h-3 border-2 border-app-accent border-t-transparent rounded-full animate-spin shrink-0" />
                          <span className="text-[11px]">Loading stage files...</span>
                        </div>
                      ) : stageFiles.length === 0 ? (
                        <div className="pl-7 pr-2.5 py-1 text-[11px] text-slate-400 flex items-center justify-between">
                          <span className="italic">No files loaded yet</span>
                          <a
                            href="#load-archive"
                            onClick={(e) => {
                              e.preventDefault();
                              onSelectStage(stage.stageNumber);
                            }}
                            className="text-[10px] text-app-accent hover:underline cursor-pointer"
                          >
                            Load Archive
                          </a>
                        </div>
                      ) : (
                        stageFiles.map((file) => {
                          const isFileActive = activeFile?.path === file.path;
                          const isFileOpen = openFiles.some((f) => f.path === file.path);
                          const badge = getFileBadge(file);

                          return (
                            <a
                              key={file.path}
                              href={`#${file.path}`}
                              onClick={(e) => {
                                e.preventDefault();
                                if (selectedStageNumber !== stage.stageNumber) {
                                  onSelectStage(stage.stageNumber);
                                }
                                handleOpenFile(file);
                              }}
                              className={`w-full flex items-center justify-between pl-6 pr-2.5 py-1 text-xs select-none transition-colors duration-75 cursor-pointer no-underline group ${
                                isFileActive
                                  ? 'bg-[#37373d] text-white font-medium border-l-2 border-app-accent pl-[22px]'
                                  : isFileOpen
                                  ? 'text-white hover:bg-white/[0.05]'
                                  : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-200'
                              }`}
                              title={isFileOpen ? `${file.name} (Open in tabs)` : `Open ${file.name}`}
                            >
                              <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
                                <FileExtensionIcon filename={file.name} className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate text-xs">{file.name}</span>
                                {isFileOpen && !isFileActive && (
                                  <span
                                    className="w-1.5 h-1.5 rounded-full bg-app-accent/70 shrink-0"
                                    title="Open in tab"
                                  />
                                )}
                              </div>
                              <span
                                className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium tracking-wider shrink-0 ml-1 opacity-70 group-hover:opacity-100 ${badge.color}`}
                              >
                                {badge.label}
                              </span>
                            </a>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Stage Objectives Checklist Footer */}
          <div className="p-3 border-t border-white/10 bg-white/[0.02] text-xs space-y-2">
            <div className="flex items-center justify-between text-app-subtext text-[11px]">
              <span>Stage Objectives</span>
              <span className="font-semibold text-app-text bg-white/5 px-2 py-0.5 rounded-md border border-white/5 font-mono text-[10px]">
                {currentStageNumber > selectedStageNumber ? '2/2 Complete' : '1/2 Complete'}
              </span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              <div className="flex items-center space-x-2 text-emerald-400 font-medium">
                <CheckSquare className="w-3.5 h-3.5" />
                <span>Extract Parameter Directive</span>
              </div>
              <div
                className={`flex items-center space-x-2 ${
                  currentStageNumber > selectedStageNumber ? 'text-emerald-400 font-medium' : 'text-app-subtext'
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
              <div className="h-10 border-b border-white/[0.08] bg-app-surface/75 backdrop-blur-xl flex items-center justify-between px-2 gap-2 select-none">
                
                {/* Scrollable Open File Tabs Container */}
                <div
                  ref={tabsContainerRef}
                  className="flex items-center space-x-1.5 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1"
                >
                  {!sidebarVisible && (
                    <button
                      onClick={toggleSidebar}
                      className="hidden md:flex p-1.5 rounded-xl border border-white/10 bg-app-surface/80 hover:bg-white/10 text-app-subtext hover:text-app-text transition-all cursor-pointer shrink-0 mr-1 shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.08)]"
                      title="Show Primary Side Bar (Ctrl+B)"
                    >
                      <FolderTree className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {/* Render Tabs for Each Open File */}
                  {openFiles.map((file) => {
                    const isLeftActive = activeFile?.path === file.path;
                    const isRightActive = splitView && splitFile?.path === file.path;
                    const isFocusedTab =
                      (activePane === 'left' && isLeftActive) ||
                      (activePane === 'right' && isRightActive) ||
                      (!splitView && isLeftActive);
                    const isFilePrompt =
                      allowedCopyFilename &&
                      file.name.toLowerCase() === allowedCopyFilename.toLowerCase();

                    return (
                      <div
                        key={file.path}
                        data-active={isFocusedTab ? 'true' : 'false'}
                        onClick={() => {
                          if (splitView && activePane === 'right') {
                            setSplitFile(file);
                          } else {
                            onSelectFile(file);
                          }
                        }}
                        onAuxClick={(e) => {
                          // Middle mouse click closes tab (like in browsers/VS Code)
                          if (e.button === 1) {
                            e.preventDefault();
                            handleCloseTab(file);
                          }
                        }}
                        className={`group flex items-center space-x-2 px-3 py-1.5 text-xs rounded-t-xl cursor-pointer transition-all duration-150 shrink-0 select-none ${
                          isFocusedTab
                            ? 'bg-app-bg/95 backdrop-blur-md text-app-text font-semibold border-t border-x border-white/15 shadow-[0_2px_8px_rgba(0,0,0,0.3),_inset_0_1px_0_rgba(255,255,255,0.2)] relative z-10 -mb-px'
                            : isLeftActive || isRightActive
                            ? 'bg-white/[0.04] text-app-text/90 font-medium border-t border-x border-white/10'
                            : 'bg-white/[0.02] hover:bg-white/[0.05] text-app-subtext hover:text-app-text border-t border-x border-transparent hover:border-white/[0.06]'
                        }`}
                        title={`${file.name} - Middle-click to close`}
                      >
                        {getFileIcon(file)}
                        <span className="truncate max-w-[110px] sm:max-w-[160px]">{file.name}</span>

                        {isFilePrompt ? (
                          <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.2 rounded-md border border-emerald-500/20 font-bold shadow-[inset_0_1px_0_rgba(16,185,129,0.15)] shrink-0">
                            PROMPT
                          </span>
                        ) : (
                          <span className="text-[10px] text-app-subtext/80 bg-white/5 border border-white/5 px-1 rounded shrink-0">
                            READONLY
                          </span>
                        )}

                        {/* Close Cross Button */}
                        <button
                          type="button"
                          onClick={(e) => handleCloseTab(file, e)}
                          className="p-0.5 ml-0.5 rounded hover:bg-white/10 text-app-subtext/70 hover:text-app-text transition-colors cursor-pointer shrink-0"
                          title="Close tab (Ctrl+W)"
                          aria-label={`Close ${file.name}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* Right Tab Actions: Split View, Terminal Toggle, and Three-Dots Menu (Very Rightmost) */}
                <div className="flex items-center space-x-1.5 shrink-0 pl-1">
                  
                  {/* Split View Toggle Button */}
                  <button
                    onClick={handleToggleSplitView}
                    className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-xl text-xs transition-all cursor-pointer shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.08)] ${
                      splitView
                        ? 'bg-app-accentBg text-app-accent border border-app-accentBorder font-medium'
                        : 'border border-white/10 bg-app-surface/80 hover:bg-white/10 text-app-subtext hover:text-app-text'
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

                  {/* Terminal Toggle Button */}
                  <button
                    onClick={() => setTerminalOpen(!terminalOpen)}
                    className={`p-1.5 rounded-xl border border-white/10 bg-app-surface/80 hover:bg-white/10 shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.08)] transition-all cursor-pointer ${
                      terminalOpen ? 'text-app-accent' : 'text-app-subtext hover:text-app-text'
                    }`}
                    title="Toggle Sandbox Log"
                  >
                    <Terminal className="w-3.5 h-3.5" />
                  </button>

                  {/* Three Dots Tabs Actions Menu (Positioned at Far Right as per UI Standards) */}
                  {openFiles.length > 1 && (
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTabsMenuOpen((prev) => !prev);
                        }}
                        className="p-1.5 rounded-xl border border-white/10 bg-app-surface/80 hover:bg-white/10 text-app-subtext hover:text-app-text shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.08)] transition-all cursor-pointer"
                        title="Tab options"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>

                      {tabsMenuOpen && (
                        <div className="absolute right-0 top-full mt-2 w-44 bg-app-surface border border-app-border rounded-2xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100">
                          {activeFile && (
                            <button
                              onClick={() => handleCloseOtherTabs(activeFile)}
                              className="w-full text-left px-3.5 py-1.5 hover:bg-app-hover text-app-text transition-colors cursor-pointer"
                            >
                              Close Other Tabs
                            </button>
                          )}
                          <button
                            onClick={handleCloseAllTabs}
                            className="w-full text-left px-3.5 py-1.5 hover:bg-rose-500/10 text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 transition-colors cursor-pointer font-medium"
                          >
                            Close All Tabs
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* =========================================================================
                  EDITOR TEXT SURFACE / SPLIT VIEW VIEWPORT
                 ========================================================================= */}
              <div className="flex-1 flex overflow-hidden relative">
                {splitView && splitFile ? (
                  // DUAL PANE SPLIT VIEW
                  <div className="flex-1 flex flex-col md:flex-row overflow-hidden divide-y md:divide-y-0 md:divide-x divide-white/[0.08]">
                    
                    {/* Primary Pane (Left) */}
                    <div
                      className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-app-bg transition-shadow ${
                        activePane === 'left' ? 'ring-1 ring-inset ring-app-accent/40 shadow-[0_0_20px_rgba(0,0,0,0.25)]' : 'opacity-95'
                      }`}
                      onClick={() => setActivePane('left')}
                    >
                      <div className="h-7 bg-app-surface/85 backdrop-blur-md border-b border-white/[0.08] px-3 flex items-center justify-between text-[11px] text-app-subtext select-none cursor-pointer">
                        <div className="flex items-center space-x-1.5 truncate">
                          {getFileIcon(activeFile)}
                          <span className={`font-medium truncate ${activePane === 'left' ? 'text-app-text font-semibold' : 'text-app-subtext'}`}>
                            {activeFile.name}
                          </span>
                          <span className="text-[10px] text-app-subtext/70">
                            (Pane 1{activePane === 'left' ? ' • Focused' : ''})
                          </span>
                        </div>
                      </div>
                      <div className="flex-1 flex overflow-auto relative">
                        {renderFileViewer(activeFile)}
                      </div>
                    </div>

                    {/* Secondary Pane (Right) */}
                    <div
                      className={`flex-1 flex flex-col min-w-0 overflow-hidden bg-app-bg transition-shadow ${
                        activePane === 'right' ? 'ring-1 ring-inset ring-app-accent/40 shadow-[0_0_20px_rgba(0,0,0,0.25)]' : 'opacity-95'
                      }`}
                      onClick={() => setActivePane('right')}
                    >
                      <div className="h-7 bg-app-surface/85 backdrop-blur-md border-b border-white/[0.08] px-2 sm:px-3 flex items-center justify-between text-[11px] text-app-subtext gap-2 select-none cursor-pointer">
                        <div className="flex items-center space-x-1.5 min-w-0">
                          {getFileIcon(splitFile)}
                          {/* File picker for pane 2 */}
                          <select
                            value={splitFile.path}
                            onClick={(e) => e.stopPropagation()}
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
                          <span className="text-[10px] text-app-subtext/70 hidden sm:inline">
                            (Pane 2{activePane === 'right' ? ' • Focused' : ''})
                          </span>
                        </div>

                        <div className="flex items-center space-x-1 shrink-0">
                          {/* Swap Panes Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSwapSplit();
                            }}
                            className="p-1 rounded-lg hover:bg-white/10 text-app-subtext hover:text-app-text transition-colors cursor-pointer"
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
                              setSplitFile(null);
                              setActivePane('left');
                            }}
                            className="p-1 rounded-lg hover:bg-white/10 text-app-subtext hover:text-app-text transition-colors cursor-pointer"
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
                      className="flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border border-white/10 bg-app-surface/80 hover:bg-white/10 text-app-text text-xs shadow-[0_2px_6px_rgba(0,0,0,0.2),_inset_0_1px_0_rgba(255,255,255,0.08)] transition-all cursor-pointer"
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
            <div className="shrink-0 border-t border-white/[0.08] bg-app-surface/85 backdrop-blur-xl font-mono text-xs p-2.5 sm:p-3 select-text transition-all shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
              <div className="flex items-center justify-between text-app-subtext pb-1.5 mb-1.5 border-b border-white/[0.08]">
                <div className="flex items-center space-x-2">
                  <Terminal className="w-3.5 h-3.5 text-app-accent" />
                  <span className="font-semibold text-app-text text-[11px] uppercase tracking-wider">
                    Sandbox Execution Log
                  </span>
                  <span className="text-[10px] text-app-subtext/80 bg-white/5 border border-white/5 px-2 py-0.5 rounded-md font-sans">
                    {logs.length} logs
                  </span>
                </div>
                <div className="flex items-center space-x-2.5 text-[10px]">
                  <span className="text-emerald-400 font-medium">● Sandbox Ready</span>
                  <button
                    onClick={() => setTerminalOpen(false)}
                    className="p-1 -mr-1 rounded-lg hover:bg-white/10 text-app-subtext hover:text-app-text transition-colors cursor-pointer"
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
                className="h-[116px] overflow-y-auto space-y-1 text-[11px] p-2 bg-app-bg/85 rounded-xl border border-white/[0.06] shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)]"
              >
                {logs.length === 0 ? (
                  <p className="text-app-subtext italic py-1">Terminal logs cleared.</p>
                ) : (
                  logs.map((log) => (
                    <div key={log.id} className="leading-5 flex items-start space-x-1.5 font-mono">
                      <span className="text-app-subtext/70 shrink-0">[{log.time}]</span>{' '}
                      <div className="break-all">
                        {log.type === 'init' && <span className="text-emerald-400 font-semibold">INIT: </span>}
                        {log.type === 'info' && <span className="text-amber-400 font-semibold">INFO: </span>}
                        {log.type === 'directive' && <span className="text-app-text font-semibold">DIRECTIVE: </span>}
                        {log.type === 'success' && <span className="text-emerald-400 font-bold">SUCCESS: </span>}
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
        <div className="fixed bottom-4 right-4 bg-app-surface/90 backdrop-blur-2xl border border-white/15 text-app-text px-4 py-2.5 rounded-xl shadow-[0_12px_32px_rgba(0,0,0,0.45),_inset_0_1px_0_rgba(255,255,255,0.15)] flex items-center space-x-2.5 text-xs z-50 animate-in fade-in slide-in-from-bottom-2 duration-150">
          <Check className="w-3.5 h-3.5 text-app-accent" />
          <span className="font-medium">{toastMsg}</span>
        </div>
      )}

    </div>
  );
}
