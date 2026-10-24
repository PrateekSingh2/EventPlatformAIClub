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
import {
  Layers,
  Users,
  Radar,
  Mail,
  ShieldCheck,
  Lock,
  LogOut,
  ExternalLink,
  Loader2,
  KeyRound,
  Eye,
  EyeOff,
  ArrowRight,
  ArrowLeft,
  BrainCircuit,
  Trophy,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Sparkles,
  AlertCircle,
  ShieldAlert,
  Menu,
  X,
  ClipboardList,
} from 'lucide-react';

type AdminTab = 'lifecycle' | 'stages' | 'participants' | 'telemetry' | 'brevo' | 'formdata';

interface NavItem {
  id: AdminTab;
  title: string;
  subtitle: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}

const ADMIN_NAV_ITEMS: NavItem[] = [
  {
    id: 'lifecycle',
    title: 'Tournament Ops',
    subtitle: 'Lifecycle & Broadcasts',
    shortLabel: 'Ops',
    icon: Trophy,
  },
  {
    id: 'stages',
    title: 'Challenge Stages',
    subtitle: 'Stages, ZIPs & Rules',
    shortLabel: 'Stages',
    icon: Layers,
  },
  {
    id: 'participants',
    title: 'Participants',
    subtitle: 'Ingestion & Tokens',
    shortLabel: 'Users',
    icon: Users,
  },
  {
    id: 'telemetry',
    title: 'Telemetry Radar',
    subtitle: 'Anti-Cheat Monitor',
    shortLabel: 'Radar',
    icon: Radar,
  },
  {
    id: 'brevo',
    title: 'Brevo Studio',
    subtitle: 'Email Credentials Dispatch',
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
];

export default function AdminPage() {
  const router = useRouter();

  const [adminSecret, setAdminSecret] = useState<string>('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('lifecycle');
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
    router.push('/');
  };

  if (checkingAuth) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-app-bg text-app-subtext font-mono text-xs gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-app-accent" />
        <span>Verifying administrator authorization...</span>
      </div>
    );
  }

  // =========================================================================
  // RE-ENHANCED ADMIN LOGIN ROUTE (CYBER COMMAND CENTER UI)
  // =========================================================================
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-app-bg text-app-text flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden transition-colors duration-200 font-sans selection:bg-emerald-500/20 selection:text-app-accent">
        
        {/* Subtle atmospheric ambient glow halos */}
        <div className="fixed top-1/4 left-1/4 w-[450px] h-[450px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
        <div className="fixed bottom-1/4 right-1/4 w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />

        <div className="w-full max-w-md p-6 sm:p-8 bg-app-surface border border-app-border rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.45)] space-y-6 relative overflow-hidden text-left">
          {/* Top Edge Gradient Accent Rim */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 opacity-90" />

          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-xs shrink-0">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-base sm:text-lg font-bold text-app-text tracking-tight">
                    Admin Command Portal
                  </h1>
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                    ROOT
                  </span>
                </div>
                <p className="text-xs text-app-subtext mt-0.5">
                  Pixel and Anomaly &bull; Tournament Command
                </p>
              </div>
            </div>
          </div>

          {/* Security Notice Pill */}
          <div className="p-2.5 rounded-xl bg-app-bg/60 border border-app-border text-[11px] text-app-subtext flex items-center space-x-2">
            <Lock className="w-3.5 h-3.5 text-app-accent shrink-0" />
            <span>Master secret authorization required to access control node.</span>
          </div>

          {/* Form */}
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="admin-secret-key-input" className="block text-[11px] font-mono text-app-subtext uppercase tracking-wider">
                  ADMIN_SECRET_KEY
                </label>
                <span className="text-[10px] font-mono text-app-subtext">
                  Master Password
                </span>
              </div>
              
              <div className="relative flex items-center">
                <div className="absolute left-3.5 text-app-subtext pointer-events-none">
                  <KeyRound className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
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
                  placeholder="Enter administrator secret..."
                  autoFocus
                  disabled={authLoading}
                  className="w-full pl-10 pr-10 py-2.5 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent/30 font-mono transition-all placeholder:text-app-subtext/40 shadow-inner"
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
              <div className="p-3 text-xs text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl font-medium shadow-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-snug">{authError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !adminSecret.trim()}
              className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_4px_20px_rgba(16,185,129,0.25)] hover:shadow-[0_6px_28px_rgba(16,185,129,0.4)] group"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1 text-slate-950" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Authenticate & Enter Command Center</span>
                  <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
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
              <span>Return to Public Arena</span>
            </button>
            <span className="font-mono text-[10px] text-app-subtext/60">
              256-bit Encrypted
            </span>
          </div>
        </div>
      </div>
    );
  }

  const activeItem = ADMIN_NAV_ITEMS.find((item) => item.id === activeTab) || ADMIN_NAV_ITEMS[0];

  // =========================================================================
  // RE-ENHANCED ADMIN WORKSPACE WITH COLLAPSIBLE SIDEBAR & TOP NAVBAR
  // =========================================================================
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col font-sans transition-colors duration-200">
      
      {/* =====================================================================
          TOP ADMIN NAVBAR
         ===================================================================== */}
      <header className="h-16 px-4 sm:px-6 bg-app-surface/90 backdrop-blur-md border-b border-app-border flex items-center justify-between select-none z-30 sticky top-0 shadow-xs">
        
        {/* Left: Sidebar Toggle Button & Breadcrumbs */}
        <div className="flex items-center space-x-3 min-w-0">
          
          {/* Sidebar / App Drawer Toggle Button */}
          <button
            onClick={toggleSidebar}
            className="p-2 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text transition-all cursor-pointer shadow-xs shrink-0 flex items-center justify-center"
            title={
              isSidebarCollapsed
                ? 'Expand sidebar'
                : 'Collapse sidebar'
            }
            aria-label="Toggle Sidebar or App Drawer"
          >
            {/* Desktop View: Collapse/Expand */}
            <span className="hidden md:flex items-center justify-center">
              {isSidebarCollapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <PanelLeftClose className="w-4 h-4 text-app-subtext" />
              )}
            </span>
            {/* Mobile View: Open/Close Drawer */}
            <span className="flex md:hidden items-center justify-center">
              {isMobileDrawerOpen ? (
                <X className="w-4 h-4 text-emerald-500" />
              ) : (
                <Menu className="w-4 h-4 text-app-text" />
              )}
            </span>
          </button>

          {/* Brand Emblem */}
          <div className="w-8 h-8 rounded-xl bg-app-muted border border-app-border flex items-center justify-center font-bold text-emerald-500 dark:text-emerald-400 text-xs shrink-0 shadow-xs hidden xs:flex">
            <BrainCircuit className="w-4 h-4" />
          </div>

          {/* Breadcrumb Navigation */}
          <div className="min-w-0 flex items-center space-x-2">
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-app-text hidden sm:inline">
              Admin Center
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-app-subtext/60 hidden sm:inline" />
            <span className="text-xs sm:text-sm font-bold text-emerald-500 dark:text-emerald-400 truncate">
              {activeItem.title}
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hidden md:inline">
              ROOT
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1.5 text-xs text-app-subtext hover:text-app-text transition-colors px-2.5 py-1.5 rounded-xl hover:bg-app-hover border border-app-border/70 shadow-xs"
            title="Open Public Arena in new tab"
          >
            <ExternalLink className="w-3.5 h-3.5 text-app-accent" />
            <span className="hidden sm:inline font-medium">Public Arena</span>
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-rose-500 hover:text-rose-600 dark:hover:text-rose-400 border border-rose-500/25 bg-rose-500/10 hover:bg-rose-500/15 rounded-xl transition-all cursor-pointer font-medium shadow-xs"
            title="Sign out of Admin Session"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Mobile Drawer Dimmed Backdrop */}
      {isMobileDrawerOpen && (
        <div
          onClick={() => setIsMobileDrawerOpen(false)}
          className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 md:hidden transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* =====================================================================
          MAIN CONTAINER WITH EXPANDABLE/COLLAPSIBLE SIDEBAR + WORKSPACE
         ===================================================================== */}
      <div className="flex-1 flex flex-col md:flex-row min-w-0 relative">
        
        {/* Navigation Sidebar & Slide-in Mobile App Drawer */}
        <aside
          className={`bg-app-surface md:bg-app-surface/65 backdrop-blur-xl md:backdrop-blur-none border-r border-app-border flex flex-col justify-between select-none transition-all duration-300 ease-in-out shrink-0 fixed md:static inset-y-0 left-0 z-50 md:z-auto ${
            isMobileDrawerOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full md:translate-x-0'
          } ${
            isSidebarCollapsed ? 'md:w-20' : 'md:w-64 lg:w-72'
          } w-72 max-w-[85vw] md:max-w-none md:shadow-none`}
        >
          {/* Sidebar Top Header & Nav Items */}
          <div className="p-3 space-y-3">
            
            {/* Desktop header label & collapse toggle */}
            <div
              className={`items-center justify-between px-2 text-[10px] font-mono font-bold uppercase tracking-wider text-app-subtext hidden md:flex ${
                isSidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              {!isSidebarCollapsed && <span>Navigation Controls</span>}
              <button
                onClick={() => {
                  setIsSidebarCollapsed((prev) => {
                    const next = !prev;
                    try {
                      localStorage.setItem('admin_sidebar_collapsed', String(next));
                    } catch {}
                    return next;
                  });
                }}
                className="text-app-subtext hover:text-app-text p-1.5 rounded-lg hover:bg-app-hover transition-colors cursor-pointer"
                title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              >
                {isSidebarCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Mobile App Drawer Header with Close Button */}
            <div className="flex md:hidden items-center justify-between pb-3 border-b border-app-border px-1">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500">
                  <BrainCircuit className="w-4 h-4" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-app-text">Command Center</span>
                  <span className="text-[10px] font-mono text-emerald-500">ROOT SESSION</span>
                </div>
              </div>
              <button
                onClick={() => setIsMobileDrawerOpen(false)}
                className="p-1.5 rounded-xl border border-app-border text-app-subtext hover:text-app-text hover:bg-app-hover"
                aria-label="Close drawer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Navigation Buttons (Vertical on Desktop & Mobile Drawer) */}
            <nav className="flex flex-col gap-1.5">
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
                    className={`flex items-center rounded-xl text-xs font-semibold transition-all cursor-pointer relative group ${
                      isSidebarCollapsed
                        ? 'md:justify-center px-3.5 py-3 md:px-0 md:py-3'
                        : 'space-x-3 px-3.5 py-2.5 text-left'
                    } ${
                      isActive
                        ? 'bg-app-accent text-app-bg shadow-sm font-bold'
                        : 'text-app-subtext hover:text-app-text hover:bg-app-hover/80 font-medium'
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 shrink-0 transition-transform ${
                        isActive ? 'text-app-bg' : 'text-app-subtext group-hover:scale-110'
                      }`}
                    />
                    
                    {!isSidebarCollapsed && (
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs">{item.title}</div>
                        <div
                          className={`text-[10px] truncate hidden md:block font-normal ${
                            isActive ? 'text-app-bg/85' : 'text-app-subtext/70'
                          }`}
                        >
                          {item.subtitle}
                        </div>
                      </div>
                    )}

                    {/* Show label on mobile drawer */}
                    <div className="min-w-0 flex-1 md:hidden">
                      <div className="truncate text-xs">{item.title}</div>
                      <div className={`text-[10px] truncate font-normal ${isActive ? 'text-app-bg/85' : 'text-app-subtext/70'}`}>
                        {item.subtitle}
                      </div>
                    </div>

                    {/* Floating Tooltip when Collapsed on Desktop */}
                    {isSidebarCollapsed && (
                      <div className="hidden md:group-hover:flex absolute left-full ml-3 z-50 px-2.5 py-1.5 rounded-xl bg-app-panel text-app-text text-xs whitespace-nowrap shadow-xl border border-app-border pointer-events-none items-center space-x-1.5 font-medium">
                        <span>{item.title}</span>
                        <span className="text-[10px] text-app-subtext font-normal">
                          &bull; {item.shortLabel}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Bottom Status Strip */}
          <div className="p-3 border-t border-app-border/80 bg-app-bg/40">
            {isSidebarCollapsed ? (
              <div className="flex justify-center" title="Root Session Active &bull; Single-Account Guard">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse ring-4 ring-emerald-500/20" />
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex items-center space-x-2 text-[11px] text-app-subtext">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="font-mono font-bold text-app-text">Root Session Active</span>
                </div>
                <div className="text-[10px] font-mono text-app-subtext/80 truncate">
                  Single-Account Guard: Active
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Right Main Content Workspace */}
        <div className="flex-1 min-w-0 flex flex-col">
          
          {/* Mobile Horizontal Quick-Tab Switcher (Visible on mobile screens) */}
          <div className="md:hidden flex items-center gap-1.5 overflow-x-auto whitespace-nowrap px-4 py-2 border-b border-app-border bg-app-surface/50 scrollbar-none">
            {ADMIN_NAV_ITEMS.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shrink-0 transition-all ${
                    isActive
                      ? 'bg-app-accent text-app-bg shadow-xs font-bold'
                      : 'bg-app-surface text-app-subtext border border-app-border/80'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{item.shortLabel}</span>
                </button>
              );
            })}
          </div>

          {/* Tournament Lifecycle State Machine Bar */}
          <ContestLifecycleBar adminSecret={adminSecret} />

          {/* Active Tab Panel Content Area */}
          <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto animate-in fade-in duration-200">
            {activeTab === 'lifecycle' && <ContestLifecycleTab adminSecret={adminSecret} />}
            {activeTab === 'stages' && <StageBuilderTab adminSecret={adminSecret} />}
            {activeTab === 'participants' && <ParticipantImportTab adminSecret={adminSecret} />}
            {activeTab === 'telemetry' && <TelemetryRadarTab adminSecret={adminSecret} />}
            {activeTab === 'brevo' && <BrevoStudioTab adminSecret={adminSecret} />}
            {activeTab === 'formdata' && <FormDataTab adminSecret={adminSecret} />}
          </main>
        </div>

      </div>

    </div>
  );
}
