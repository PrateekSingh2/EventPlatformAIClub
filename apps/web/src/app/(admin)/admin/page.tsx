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
  const [activeTab, setActiveTab] = useState<'stages' | 'participants' | 'telemetry' | 'brevo'>('stages');

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

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: adminSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setAuthError(data.error || 'Invalid administrator secret key');
        return;
      }
      sessionStorage.setItem('admin_secret', adminSecret.trim());
      setAuthError(null);
    } catch {
      setAuthError('Authentication verification failed');
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_secret');
    setAdminSecret('');
    router.push('/');
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-app-bg text-app-subtext font-mono text-xs">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Verifying administrator session...
      </div>
    );
  }

  // If not authenticated, render Admin Secret login box
  if (!adminSecret) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-app-bg text-app-text font-sans">
        <div className="w-full max-w-sm p-6 bg-app-surface border border-app-border rounded-lg shadow-xl space-y-4">
          <div className="flex items-start space-x-3">
            <div className="w-8 h-8 rounded bg-app-muted border border-app-border flex items-center justify-center text-app-accent shrink-0">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-app-text">Admin Command Center</h1>
              <p className="text-[11px] text-app-subtext">Authentication required to manage platform</p>
            </div>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] font-mono text-app-subtext uppercase">
                Admin Secret Key
              </label>
              <input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="Enter master admin key..."
                autoFocus
                className="w-full px-3 py-1.5 text-xs text-app-text bg-app-bg border border-app-border rounded focus:outline-none focus:border-app-accent font-mono transition-colors"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 font-mono">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full py-2 text-xs font-medium rounded bg-app-accent text-app-bg hover:opacity-90 transition-opacity cursor-pointer shadow-xs"
            >
              Verify & Enter Command Center
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col font-sans transition-colors duration-150">
      {/* Top Admin Navigation Bar */}
      <header className="h-16 px-3 sm:px-6 bg-app-surface border-b border-app-border flex items-center justify-between select-none gap-2">
        <div className="flex items-center space-x-2 sm:space-x-3.5 min-w-0">
          <div className="w-8 h-8 rounded-md bg-app-muted border border-app-border flex items-center justify-center font-bold text-app-text text-xs shrink-0">
            CS
          </div>
          <span className="text-sm sm:text-base font-semibold tracking-tight text-app-text truncate">
            Admin Command Center
          </span>
          <span className="text-app-border hidden md:inline">/</span>
          <span className="text-app-subtext hidden md:inline text-xs font-normal">
            Serverless Sandbox Monorepo
          </span>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3.5 shrink-0">
          {/* Theme Switcher */}
          <div className="flex items-center space-x-0.5 sm:space-x-1 bg-app-bg border border-app-border p-0.5 sm:p-1 rounded-md">
            <button
              onClick={() => setTheme('graphite')}
              className={`px-2 sm:px-2.5 py-1 rounded text-xs transition-colors ${
                theme === 'graphite'
                  ? 'font-semibold bg-app-surface text-app-text border border-app-border shadow-xs'
                  : 'font-medium text-app-subtext hover:text-app-text'
              }`}
            >
              Graphite
            </button>
            <button
              onClick={() => setTheme('forest')}
              className={`px-2 sm:px-2.5 py-1 rounded text-xs transition-colors ${
                theme === 'forest'
                  ? 'font-semibold bg-app-surface text-app-text border border-app-border shadow-xs'
                  : 'font-medium text-app-subtext hover:text-app-text'
              }`}
            >
              Forest
            </button>
          </div>

          <div className="h-4 sm:h-5 w-px bg-app-border hidden xs:block"></div>

          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center space-x-1.5 text-xs sm:text-sm text-app-subtext hover:text-app-text transition-colors px-2 py-1"
          >
            <span>Public Arena</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 text-xs sm:text-sm text-rose-400 hover:text-rose-300 border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Logout</span>
          </button>
        </div>
      </header>

      {/* Contest Lifecycle Bar */}
      <ContestLifecycleBar adminSecret={adminSecret} />

      {/* Admin Tab Switcher */}
      <nav className="px-3 sm:px-6 py-2 bg-app-surface border-b border-app-border flex items-center space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none text-xs sm:text-sm">
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
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'stages'
              ? 'bg-app-accent text-app-bg font-semibold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Layers className="w-4 h-4 shrink-0" />
          <span>Stage & Rules Manager</span>
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'participants'
              ? 'bg-app-accent text-app-bg font-semibold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Users className="w-4 h-4 shrink-0" />
          <span>Participant Ingestion</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'telemetry'
              ? 'bg-app-accent text-app-bg font-semibold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Radar className="w-4 h-4 shrink-0" />
          <span>Telemetry Radar & Anti-Cheat</span>
        </button>

        <button
          onClick={() => setActiveTab('brevo')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md transition-colors cursor-pointer shrink-0 ${
            activeTab === 'brevo'
              ? 'bg-app-accent text-app-bg font-semibold shadow-xs'
              : 'text-app-subtext hover:text-app-text hover:bg-app-hover font-medium'
          }`}
        >
          <Mail className="w-4 h-4 shrink-0" />
          <span>Brevo Studio</span>
        </button>
      </nav>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'lifecycle' && <ContestLifecycleTab adminSecret={adminSecret} />}
        {activeTab === 'stages' && <StageBuilderTab adminSecret={adminSecret} />}
        {activeTab === 'participants' && <ParticipantImportTab adminSecret={adminSecret} />}
        {activeTab === 'telemetry' && <TelemetryRadarTab adminSecret={adminSecret} />}
        {activeTab === 'brevo' && <BrevoStudioTab adminSecret={adminSecret} />}
      </main>
    </div>
  );
}
