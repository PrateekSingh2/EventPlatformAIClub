'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StageBuilderTab } from '@/components/admin/StageBuilderTab';
import { ParticipantImportTab } from '@/components/admin/ParticipantImportTab';
import { TelemetryRadarTab } from '@/components/admin/TelemetryRadarTab';
import { ContestLifecycleBar } from '@/components/admin/ContestLifecycleBar';
import { ContestLifecycleTab } from '@/components/admin/ContestLifecycleTab';
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
  Sparkles,
  ArrowRight,
  ArrowLeft,
  Palette,
  ChevronDown,
  Check,
  BrainCircuit,
  Trophy,
} from 'lucide-react';

type AdminTab = 'lifecycle' | 'stages' | 'participants' | 'brevo' | 'telemetry';

export default function AdminPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [adminSecret, setAdminSecret] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('lifecycle');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'stages' | 'participants' | 'telemetry' | 'brevo'>('stages');
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);

  useEffect(() => {
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
  // ENHANCED ADMIN LOGIN PANEL (OPAQUE CARD, SLEEK NEOMORPHIC UI)
  // =========================================================================
  if (!adminSecret) {
    return (
      <div className="min-h-screen bg-app-bg text-app-text flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden transition-colors duration-200">
        {/* Ambient atmospheric backdrop glow */}
        <div className="fixed top-1/4 left-1/3 w-[500px] h-[500px] bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />
        <div className="fixed bottom-1/4 right-1/3 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />

        <div className="w-full max-w-md p-6 sm:p-8 bg-app-surface border border-app-border rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.35)] space-y-6 relative overflow-hidden text-left">
          {/* Subtle top edge accent glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 opacity-90" />

          {/* Header */}
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs shrink-0">
              <ShieldCheck className="w-6 h-6 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-base sm:text-lg font-bold text-app-text tracking-tight">
                  Admin Command Center
                </h1>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                  ROOT
                </span>
              </div>
              <p className="text-xs text-app-subtext mt-0.5">
                The AI Club &bull; Operations & Stage Control
              </p>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleManualLogin} className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="admin-secret-key-input" className="block text-[11px] font-mono text-app-subtext uppercase">
                  ADMIN_SECRET_KEY
                </label>
                <span className="text-[10px] font-mono text-app-subtext">
                  Master Password
                </span>
              </div>
              
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
                  placeholder="Enter administrator secret..."
                  autoFocus
                  disabled={authLoading}
                  className="w-full pl-9 pr-9 py-2.5 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-app-accent font-mono transition-colors placeholder:text-app-subtext/40 shadow-inner"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 text-app-subtext hover:text-app-text p-1 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {authError && (
              <div className="p-3 text-xs text-rose-500 dark:text-rose-400 bg-rose-500/10 border border-rose-500/25 rounded-xl font-medium shadow-xs">
                {authError}
              </div>
            )}

            <button
              type="submit"
              disabled={authLoading || !adminSecret.trim()}
              className="w-full flex items-center justify-center space-x-2 py-2.5 rounded-xl bg-app-accent text-app-bg font-bold text-xs tracking-wide hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {authLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-1" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>Authenticate & Enter Command Center</span>
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
              <span>Return to Contest Arena</span>
            </button>
            <span className="font-mono text-[10px] text-app-subtext/60">
              TLS Protected
            </span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // AUTHENTICATED ADMIN DASHBOARD
  // =========================================================================
  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col font-sans transition-colors duration-200">
      {/* Top Admin Navigation Bar */}
      <header className="h-16 px-4 sm:px-6 bg-app-surface border-b border-app-border flex items-center justify-between select-none gap-2 shadow-xs">
        <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-app-muted border border-app-border flex items-center justify-center font-bold text-emerald-500 dark:text-emerald-400 text-xs shrink-0 shadow-xs">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-sm sm:text-base font-bold tracking-tight text-app-text truncate">
                Admin Command Center
              </span>
              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hidden xs:inline-block">
                LIVE
              </span>
            </div>
            <p className="text-[10px] text-app-subtext font-mono hidden md:block">
              Neural Anomaly CTF &bull; Master Control Node
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {/* Theme Dropdown */}
          <div className="relative">
            <button
              onClick={() => setThemeMenuOpen((prev) => !prev)}
              className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-text text-xs shadow-xs transition-all cursor-pointer"
              title="Select Color Theme"
            >
              <Palette className="w-3.5 h-3.5 text-app-accent" />
              <span className="capitalize hidden sm:inline font-medium">{theme}</span>
              <ChevronDown className={`w-3 h-3 text-app-subtext transition-transform ${themeMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {themeMenuOpen && (
              <div
                onClick={() => setThemeMenuOpen(false)}
                className="absolute right-0 top-full mt-2 w-48 bg-app-surface border border-app-border rounded-2xl shadow-2xl py-2 z-50 text-xs animate-in fade-in zoom-in-95 duration-100"
              >
                <button
                  onClick={() => setTheme('graphite')}
                  className={`w-full text-left px-3.5 py-2 flex items-center justify-between hover:bg-app-hover transition-colors cursor-pointer ${
                    theme === 'graphite' ? 'text-app-accent font-semibold bg-app-accentBg' : 'text-app-text'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-slate-700 border border-slate-500" />
                    <span>Graphite (Dark)</span>
                  </div>
                  {theme === 'graphite' && <Check className="w-3.5 h-3.5 text-app-accent" />}
                </button>
                <button
                  onClick={() => setTheme('light')}
                  className={`w-full text-left px-3.5 py-2 flex items-center justify-between hover:bg-app-hover transition-colors cursor-pointer ${
                    theme === 'light' ? 'text-app-accent font-semibold bg-app-accentBg' : 'text-app-text'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 border border-blue-400" />
                    <span>Soft Light</span>
                  </div>
                  {theme === 'light' && <Check className="w-3.5 h-3.5 text-app-accent" />}
                </button>
              </div>
            )}
          </div>

          <div className="h-5 w-px bg-app-border hidden xs:block"></div>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1.5 text-xs text-app-subtext hover:text-app-text transition-colors px-2.5 py-1.5 rounded-xl hover:bg-app-hover border border-transparent hover:border-app-border"
          >
            <span>Public Arena</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1.5 px-3 py-1.5 text-xs text-rose-500 dark:text-rose-400 hover:text-rose-600 dark:hover:text-rose-300 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer shrink-0 font-medium"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Contest Lifecycle Bar */}
      <ContestLifecycleBar adminSecret={adminSecret} />

      {/* Admin Tab Switcher */}
      <nav className="px-4 sm:px-6 py-2.5 bg-app-surface border-b border-app-border flex items-center space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none text-xs sm:text-sm">
        <button
          onClick={() => setActiveTab('lifecycle')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'lifecycle'
              ? 'bg-amber-500/15 text-amber-300 border border-amber-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-400" />
          <span>Tournament Ops & Broadcasts</span>
        </button>

        <button
          onClick={() => setActiveTab('stages')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0 ${
            activeTab === 'stages'
              ? 'bg-app-accent text-app-bg font-bold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Stage & Rules Manager</span>
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0 ${
            activeTab === 'participants'
              ? 'bg-app-accent text-app-bg font-bold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>Participant Ingestion</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0 ${
            activeTab === 'telemetry'
              ? 'bg-app-accent text-app-bg font-bold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Radar className="w-4 h-4 shrink-0" />
          <span>Telemetry Radar & Anti-Cheat</span>
        </button>

        <button
          onClick={() => setActiveTab('brevo')}
          className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl transition-all cursor-pointer shrink-0 ${
            activeTab === 'brevo'
              ? 'bg-app-accent text-app-bg font-bold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span>Brevo Studio</span>
        </button>
      </nav>

      {/* Tab Panels Content */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full">
        {activeTab === 'lifecycle' && <ContestLifecycleTab adminSecret={adminSecret} />}
        {activeTab === 'stages' && <StageBuilderTab adminSecret={adminSecret} />}
        {activeTab === 'participants' && <ParticipantImportTab adminSecret={adminSecret} />}
        {activeTab === 'telemetry' && <TelemetryRadarTab adminSecret={adminSecret} />}
        {activeTab === 'brevo' && <BrevoStudioTab adminSecret={adminSecret} />}
      </main>
    </div>
  );
}
