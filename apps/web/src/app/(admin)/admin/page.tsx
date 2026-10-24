'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StageBuilderTab } from '@/components/admin/StageBuilderTab';
import { ParticipantImportTab } from '@/components/admin/ParticipantImportTab';
import { TelemetryRadarTab } from '@/components/admin/TelemetryRadarTab';
import { ContestLifecycleBar } from '@/components/admin/ContestLifecycleBar';
import { ContestLifecycleTab } from '@/components/admin/ContestLifecycleTab';
import { BrevoStudioTab } from '@/components/admin/BrevoStudioTab';
import { FormDataTab } from '@/components/admin/FormDataTab';
import { TeamMergerTab } from '@/components/admin/TeamMergerTab';
import { Round1RubricTab } from '@/components/admin/Round1RubricTab';
import {
  Layers,
  Users,
  Activity,
  Mail,
  Lock,
  LogOut,
  ExternalLink,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  Trophy,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  AlertCircle,
  Menu,
  X,
  ClipboardList,
  Award,
  GitMerge,
} from 'lucide-react';

type AdminTab =
  | 'lifecycle'
  | 'stages'
  | 'participants'
  | 'telemetry'
  | 'brevo'
  | 'round1'
  | 'formdata'
  | 'teammerger';

interface NavItem {
  id: AdminTab;
  title: string;
  subtitle: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'round1',
    title: 'Round 1 Rubric',
    subtitle: 'Evaluation & Standings',
    shortLabel: 'Rubric',
    icon: Award,
  },
  {
    id: 'lifecycle',
    title: 'Tournament Operations',
    subtitle: 'State & Announcements',
    shortLabel: 'Operations',
    icon: Trophy,
  },
  {
    id: 'stages',
    title: 'Challenge Stages',
    subtitle: 'Challenges, ZIPs & Answers',
    shortLabel: 'Stages',
    icon: Layers,
  },
  {
    id: 'participants',
    title: 'Participants',
    subtitle: 'Roster & Access Tokens',
    shortLabel: 'Roster',
    icon: Users,
  },
  {
    id: 'telemetry',
    title: 'Integrity Monitor',
    subtitle: 'Activity & Flags',
    shortLabel: 'Monitor',
    icon: Activity,
  },
  {
    id: 'brevo',
    title: 'Email Studio',
    subtitle: 'Credential Dispatch',
    shortLabel: 'Emails',
    icon: Mail,
  },
  {
    id: 'formdata',
    title: 'Form Data',
    subtitle: 'Team merge submissions',
    shortLabel: 'Form',
    icon: ClipboardList,
  },
  {
    id: 'teammerger',
    title: 'Team Merger',
    subtitle: 'Detect & merge duplicate teams',
    shortLabel: 'Merger',
    icon: GitMerge,
  },
];

export default function AdminPage() {
  const router = useRouter();

  const [adminSecret, setAdminSecret] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('round1');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Restore session and sidebar preference
  useEffect(() => {
    try {
      const storedCollapsed = localStorage.getItem('admin_sidebar_collapsed');
      if (storedCollapsed !== null) {
        setIsSidebarCollapsed(storedCollapsed === 'true');
      }
    } catch {}

    const storedSecret = sessionStorage.getItem('admin_secret');
    if (!storedSecret) {
      setCheckingAuth(false);
      return;
    }

    const verifyStoredSecret = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminSecret: storedSecret }),
        });
        const data = await res.json();
        if (res.ok && data.authenticated) {
          setAdminSecret(storedSecret);
          setIsAuthenticated(true);
        } else {
          sessionStorage.removeItem('admin_secret');
        }
      } catch {
        sessionStorage.removeItem('admin_secret');
      } finally {
        setCheckingAuth(false);
      }
    };

    verifyStoredSecret();
  }, []);

  const toggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsMobileDrawerOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => {
        const next = !prev;
        try {
          localStorage.setItem('admin_sidebar_collapsed', String(next));
        } catch {}
        return next;
      });
    }
  };

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) return;

    setAuthLoading(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: adminSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setAuthError(data.error || 'Invalid administrator secret key');
        setAuthLoading(false);
        return;
      }
      sessionStorage.setItem('admin_secret', adminSecret.trim());
      setAdminSecret(adminSecret.trim());
      setIsAuthenticated(true);
      setAuthError(null);
    } catch {
      setAuthError('Authentication verification failed');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_secret');
    setAdminSecret('');
    setIsAuthenticated(false);
    router.push('/form');
  };

  if (checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-app-bg text-app-subtext text-xs gap-3 font-sans">
        <Loader2 className="w-5 h-5 animate-spin text-app-text" />
        <span className="font-medium">Loading admin workspace...</span>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATION SCREEN: CLEAN & TIMELESS DESIGN
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-app-bg text-app-text flex flex-col items-center justify-center p-4 sm:p-6 transition-colors duration-150 font-sans">
        <div className="w-full max-w-sm sm:max-w-md p-6 sm:p-8 bg-app-surface border border-app-border rounded-2xl shadow-xl space-y-6 text-left">
          {/* Header */}
          <div className="space-y-2">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-app-hover border border-app-border flex items-center justify-center text-app-text shrink-0">
                <Lock className="w-4 h-4 text-app-text" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-app-text tracking-tight">
                  Admin Sign In
                </h1>
                <p className="text-xs text-app-subtext">Event Platform Administration</p>
              </div>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="admin-secret-key-input"
                className="block text-xs font-medium text-app-subtext"
              >
                Admin Secret Key
              </label>

              <div className="relative flex items-center">
                <div className="absolute left-3 text-app-subtext pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </div>

                <input
                  id="admin-secret-key-input"
                  name="adminSecretKey"
                  type={showPassword ? 'text' : 'password'}
                  value={adminSecret}
                  onChange={(e) => {
                    setAdminSecret(e.target.value);
                    setAuthError(null);
                  }}
                  placeholder="Enter administrator key..."
                  autoFocus
                  disabled={authLoading}
                  className="w-full pl-9 pr-10 py-2.5 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-500 font-mono transition-all placeholder:text-app-subtext/40 shadow-xs"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 text-app-subtext hover:text-app-text p-1 cursor-pointer transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl font-medium flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !adminSecret.trim()}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs tracking-wide active:scale-[0.99] transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer Back Link */}
          <div className="pt-4 border-t border-app-border flex items-center justify-between text-xs text-app-subtext">
            <button
              onClick={() => router.push('/')}
              className="flex items-center space-x-1.5 text-app-subtext hover:text-app-text transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Public Arena</span>
            </button>
            <span className="text-[11px] text-app-subtext/60">Authorized personnel only</span>
          </div>
        </div>
      </div>
    );
  }

  const activeItem = ADMIN_NAV_ITEMS.find((item) => item.id === activeTab) || ADMIN_NAV_ITEMS[0];

  // =========================================================================
  // ADMIN DASHBOARD WORKSPACE (CLEAN, MINIMAL & FULLY MOBILE-RESPONSIVE)
  // =========================================================================
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col font-sans transition-colors duration-150">
      {/* =====================================================================
          TOP ADMIN NAVBAR
         ===================================================================== */}
      <header className="h-15 sm:h-16 px-3.5 sm:px-6 bg-app-surface border-b border-app-border flex items-center justify-between select-none z-30 sticky top-0 shadow-xs">
        {/* Left: Sidebar Toggle & Breadcrumbs */}
        <div className="flex items-center space-x-2.5 sm:space-x-3 min-w-0">
          {/* Sidebar / Mobile Drawer Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center min-w-[38px] min-h-[38px]"
            title={isSidebarCollapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-label="Toggle navigation drawer"
          >
            {/* Desktop Collapse/Expand */}
            <span className="hidden md:flex items-center justify-center">
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-app-text" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-app-subtext" />
              )}
            </span>
            {/* Mobile Drawer Open/Close */}
            <span className="flex md:hidden items-center justify-center">
              {isMobileDrawerOpen ? (
                <X className="w-4 h-4 text-app-text" />
              ) : (
                <Menu className="w-4 h-4 text-app-text" />
              )}
            </span>
          </button>

          {/* Platform Title */}
          <div className="flex items-center space-x-2 min-w-0">
            <span className="text-xs sm:text-sm font-bold tracking-tight text-app-text hidden sm:inline">
              Event Platform
            </span>
            <span className="text-xs text-app-subtext hidden sm:inline">/</span>
            <span className="text-xs sm:text-sm font-semibold text-app-text truncate">
              {activeItem.title}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 text-xs text-app-subtext hover:text-app-text transition-colors px-2.5 py-1.5 rounded-xl hover:bg-app-hover border border-app-border shadow-xs"
            title="Open Public Arena in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Public Arena</span>
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs text-app-subtext hover:text-rose-400 border border-app-border hover:border-rose-500/30 rounded-xl transition-all cursor-pointer font-medium"
            title="Sign out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Dimmed Backdrop */}
      {isMobileDrawerOpen && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-150"
          aria-hidden="true"
        />
      )}

      {/* =====================================================================
          MAIN CONTAINER WITH SIDEBAR + WORKSPACE
         ===================================================================== */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0 relative">
        {/* Navigation Sidebar & Slide-in Mobile Drawer */}
        <aside
          className={`bg-app-surface border-r border-app-border flex flex-col justify-between select-none transition-all duration-200 ease-in-out shrink-0 fixed md:static inset-y-0 left-0 z-50 md:z-auto ${
            isMobileDrawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
          } ${
            isSidebarCollapsed ? 'md:w-18' : 'md:w-60 lg:w-64'
          } w-72 max-w-[85vw] md:max-w-none`}
        >
          {/* Sidebar Navigation */}
          <div className="p-3 space-y-2">
            {/* Mobile Drawer Header */}
            <div className="flex md:hidden items-center justify-between pb-3 mb-2 border-b border-app-border px-1">
              <span className="text-xs font-bold text-app-text">Navigation</span>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-lg border border-app-border text-app-subtext hover:text-app-text"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Nav Items */}
            <nav className="flex flex-col gap-1">
              {ADMIN_NAV_ITEMS.map((item) => {
                const isActive = activeTab === item.id;
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveTab(item.id);
                      setIsMobileDrawerOpen(false);
                    }}
                    title={`${item.title} — ${item.subtitle}`}
                    className={`flex items-center rounded-xl text-xs font-medium transition-all cursor-pointer min-h-[42px] ${
                      isSidebarCollapsed
                        ? 'md:justify-center px-3 py-2.5 md:px-0'
                        : 'space-x-3 px-3 py-2.5 text-left'
                    } ${
                      isActive
                        ? 'bg-app-hover text-app-text font-semibold border border-app-border shadow-xs'
                        : 'text-app-subtext hover:text-app-text hover:bg-app-hover/50'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-app-text' : 'text-app-subtext'
                      }`}
                    />

                    {!isSidebarCollapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{item.title}</div>
                        <div className="text-[10px] text-app-subtext/70 truncate hidden md:block">
                          {item.subtitle}
                        </div>
                      </div>
                    )}

                    {/* Mobile Label */}
                    <div className="min-w-0 flex-1 md:hidden">
                      <div className="truncate text-xs">{item.title}</div>
                      <div className="text-[10px] text-app-subtext/70 truncate">
                        {item.subtitle}
                      </div>
                    </div>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer */}
          <div className="p-3 border-t border-app-border text-xs text-app-subtext">
            {!isSidebarCollapsed ? (
              <div className="flex items-center space-x-2 text-[11px]">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="truncate">Admin Session Active</span>
              </div>
            ) : (
              <div className="flex justify-center" title="Admin Session Active">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Content Workspace */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Mobile Horizontal Pill Tab Scroller (Smooth Thumb-Friendly Gestures) */}
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-3.5 py-2.5 border-b border-app-border bg-app-surface/90 backdrop-blur-sm scrollbar-none snap-x">
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl text-xs font-medium shrink-0 transition-all snap-start min-h-[38px] ${
                    isActive
                      ? 'bg-app-text text-app-bg font-semibold shadow-xs'
                      : 'bg-app-surface text-app-subtext border border-app-border'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Tournament Lifecycle State Machine Bar */}
          <ContestLifecycleBar adminSecret={adminSecret} />

          {/* Active Tab Panel Content Area */}
          <main className="flex-1 p-3.5 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-150">
            {activeTab === 'round1' && <Round1RubricTab adminSecret={adminSecret} />}
            {activeTab === 'lifecycle' && <ContestLifecycleTab adminSecret={adminSecret} />}
            {activeTab === 'stages' && <StageBuilderTab adminSecret={adminSecret} />}
            {activeTab === 'participants' && <ParticipantImportTab adminSecret={adminSecret} />}
            {activeTab === 'telemetry' && <TelemetryRadarTab adminSecret={adminSecret} />}
            {activeTab === 'brevo' && <BrevoStudioTab adminSecret={adminSecret} />}
            {activeTab === 'formdata' && <FormDataTab adminSecret={adminSecret} />}
            {activeTab === 'teammerger' && <TeamMergerTab adminSecret={adminSecret} />}
          </main>
        </div>
      </div>
    </div>
  );
}
