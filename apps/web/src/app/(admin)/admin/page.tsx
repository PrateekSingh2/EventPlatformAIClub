'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { StageBuilderTab } from '@/components/admin/StageBuilderTab';
import { ParticipantImportTab } from '@/components/admin/ParticipantImportTab';
import { BrevoStudioTab } from '@/components/admin/BrevoStudioTab';
import { TelemetryRadarTab } from '@/components/admin/TelemetryRadarTab';
import {
  ShieldCheck,
  Layers,
  Users,
  Mail,
  Radar,
  LogOut,
  Lock,
  Loader2,
  ExternalLink,
} from 'lucide-react';

type AdminTab = 'stages' | 'participants' | 'brevo' | 'telemetry';

export default function AdminPage() {
  const router = useRouter();
  const [adminSecret, setAdminSecret] = useState<string>('');
  const [activeTab, setActiveTab] = useState<AdminTab>('stages');
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Verify Admin Session on mount
  useEffect(() => {
    const savedSecret = sessionStorage.getItem('admin_secret');
    if (!savedSecret) {
      setCheckingAuth(false);
      return;
    }

    const verify = async () => {
      try {
        const res = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminSecret: savedSecret }),
        });
        const data = await res.json();
        if (res.ok && data.authenticated && data.role === 'admin') {
          setAdminSecret(savedSecret);
        } else {
          sessionStorage.removeItem('admin_secret');
        }
      } catch (err) {
        sessionStorage.removeItem('admin_secret');
      } finally {
        setCheckingAuth(false);
      }
    };

    verify();
  }, []);

  const handleManualLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) return;

    setCheckingAuth(true);
    setAuthError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: adminSecret.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.authenticated && data.role === 'admin') {
        sessionStorage.setItem('admin_secret', adminSecret.trim());
      } else {
        setAuthError(data.error || 'Invalid admin secret key');
      }
    } catch (err: any) {
      setAuthError(err.message || 'Verification failed');
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_secret');
    setAdminSecret('');
    router.push('/');
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-cyan-400 font-mono text-xs">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Verifying administrator session...
      </div>
    );
  }

  // If not authenticated, render Admin Secret login box
  if (!adminSecret) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-950 text-slate-100">
        <div className="w-full max-w-md p-8 glass-panel-highlight rounded-2xl border border-violet-500/40 shadow-2xl space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Lock className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-tight">Admin Command Center</h1>
              <p className="text-xs text-slate-400">Authentication required to manage contest platform</p>
            </div>
          </div>

          <form onSubmit={handleManualLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                Admin Secret Key
              </label>
              <input
                type="password"
                value={adminSecret}
                onChange={(e) => setAdminSecret(e.target.value)}
                placeholder="Enter master admin key..."
                autoFocus
                className="w-full px-4 py-2.5 text-xs text-white bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:border-violet-400 font-mono"
              />
            </div>

            {authError && (
              <p className="text-xs text-rose-400 font-medium">{authError}</p>
            )}

            <button
              type="submit"
              className="w-full py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl shadow-neon-violet transition-all cursor-pointer"
            >
              Verify & Enter Command Center
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Admin Navigation Bar */}
      <header className="h-16 px-6 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-wide uppercase bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              EventPlatform AI Club &bull; Admin Command Center
            </h1>
            <p className="text-[10px] text-slate-400 font-mono">
              Serverless Monorepo Architecture &bull; 150-200 Participants
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          >
            <span>Public Arena Portal</span>
            <ExternalLink className="w-3 h-3" />
          </a>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:text-rose-300 bg-rose-950/30 hover:bg-rose-950/50 border border-rose-800/40 rounded-xl transition-all cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Logout</span>
          </button>
        </div>
      </header>

      {/* Admin Tab Switcher */}
      <nav className="px-6 py-2 bg-slate-900/40 border-b border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('stages')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'stages'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Layers className="w-4 h-4" />
          <span>Stage & Rules Manager</span>
        </button>

        <button
          onClick={() => setActiveTab('participants')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'participants'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Participant Bulk Importer</span>
        </button>

        <button
          onClick={() => setActiveTab('brevo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'brevo'
              ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Brevo Mailer Studio</span>
        </button>

        <button
          onClick={() => setActiveTab('telemetry')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
            activeTab === 'telemetry'
              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/40 shadow-sm'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
          }`}
        >
          <Radar className="w-4 h-4 text-rose-400" />
          <span>Live Anti-Cheat & Telemetry Radar</span>
        </button>
      </nav>

      {/* Main Tab Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        {activeTab === 'stages' && <StageBuilderTab adminSecret={adminSecret} />}
        {activeTab === 'participants' && <ParticipantImportTab adminSecret={adminSecret} />}
        {activeTab === 'brevo' && <BrevoStudioTab adminSecret={adminSecret} />}
        {activeTab === 'telemetry' && <TelemetryRadarTab adminSecret={adminSecret} />}
      </main>
    </div>
  );
}
