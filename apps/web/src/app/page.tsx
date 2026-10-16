'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/lib/theme';
import {
  ShieldCheck,
  Terminal,
  ArrowRight,
  Lock,
  Zap,
  Eye,
  KeyRound,
  Loader2,
  Trophy,
  X,
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Admin secret modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);

  const handleParticipantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = token.trim().toUpperCase();
    if (!cleanToken) {
      setError('Please enter your participant access token');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Invalid or expired access token');
        setLoading(false);
        return;
      }

      localStorage.setItem('participant_token', cleanToken);
      router.push(`/arena?token=${encodeURIComponent(cleanToken)}`);
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
      setLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminSecret.trim()) {
      setAdminError('Please enter admin secret key');
      return;
    }

    setAdminLoading(true);
    setAdminError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: adminSecret.trim() }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setAdminError(data.error || 'Invalid admin secret key');
        setAdminLoading(false);
        return;
      }

      sessionStorage.setItem('admin_secret', adminSecret.trim());
      router.push('/admin');
    } catch (err: any) {
      setAdminError(err.message || 'Admin authentication failed');
      setAdminLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-app-bg text-app-text flex flex-col justify-between font-sans transition-colors duration-150">
      
      {/* Header */}
      <header className="h-16 bg-app-surface border-b border-app-border px-3 sm:px-6 w-full flex items-center justify-between select-none">
        <div className="flex items-center space-x-2 sm:space-x-3.5">
          <div className="w-8 h-8 rounded-md bg-app-muted border border-app-border flex items-center justify-center font-bold text-app-text text-xs shrink-0">
            CS
          </div>
          <span className="text-sm sm:text-base font-semibold tracking-tight text-app-text">
            Contest Sandbox
          </span>
          <span className="text-app-border hidden md:inline">/</span>
          <span className="text-app-subtext hidden md:inline text-xs font-normal">
            Developer Workspace & Anti-Cheat Arena
          </span>
        </div>

        <div className="flex items-center space-x-2 sm:space-x-3.5">
          {/* Theme Switcher Selector */}
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

          <button
            onClick={() => setShowAdminModal(true)}
            className="flex items-center space-x-1.5 px-2.5 sm:px-3.5 py-1.5 rounded-md border border-app-border bg-app-surface hover:bg-app-hover text-app-text text-xs sm:text-sm font-medium transition-colors cursor-pointer shrink-0"
          >
            <Lock className="w-3.5 h-3.5 text-app-subtext shrink-0" />
            <span className="hidden xs:inline">Admin Portal</span>
            <span className="xs:hidden">Admin</span>
          </button>
        </div>
      </header>

      {/* Hero & Participant Token Entry */}
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-14 flex flex-col items-center text-center">
        <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-app-text max-w-xl leading-tight">
          Contest Sandbox & Developer Workspace
        </h1>
        <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-app-subtext max-w-lg leading-relaxed">
          In-memory encrypted ZIP decompression, browser fullscreen lock, selective prompt extraction, and real-time leaderboard broadcast.
        </p>

        {/* Token Entry Box */}
        <div className="mt-6 sm:mt-8 w-full max-w-md p-4 sm:p-6 bg-app-surface border border-app-border rounded-lg shadow-xl text-left">
          <form onSubmit={handleParticipantLogin} className="space-y-4">
            <div>
              <label htmlFor="participant-token-input" className="block text-[11px] font-medium text-app-subtext uppercase tracking-wider mb-1.5">
                Participant Access Token
              </label>
              <div className="relative">
                <input
                  id="participant-token-input"
                  name="participantToken"
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="e.g. AX-DEMO-2026"
                  className="w-full px-3 py-2 pl-9 text-xs font-mono tracking-wider text-app-text bg-app-bg border border-app-border rounded focus:outline-none focus:border-app-accent uppercase transition-colors"
                />
                <KeyRound className="w-3.5 h-3.5 text-app-subtext absolute left-3 top-2.5" />
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-mono">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 text-xs font-medium rounded bg-app-accent text-app-bg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Authenticating...</span>
                </>
              ) : (
                <>
                  <span>Enter Contest Sandbox</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-app-border flex flex-col xs:flex-row items-start xs:items-center justify-between gap-1 text-[11px]">
            <span className="text-app-subtext">Quick preview:</span>
            <button
              type="button"
              onClick={() => {
                setToken('AX-DEMO-2026');
                setError(null);
              }}
              className="text-app-accent hover:underline font-mono text-[11px] cursor-pointer text-left"
            >
              Use Demo Token (AX-DEMO-2026)
            </button>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-8 sm:mt-10 w-full text-left">
          <div className="p-3.5 rounded bg-app-surface border border-app-border space-y-1">
            <div className="flex items-center space-x-1.5 text-app-text text-xs font-medium">
              <Terminal className="w-4 h-4 text-emerald-500" />
              <span>In-Memory RAM Engine</span>
            </div>
            <p className="text-[11px] text-app-subtext leading-relaxed">
              ZIP archives are parsed strictly in browser memory via @zip.js. Zero OS disk footprint.
            </p>
          </div>

          <div className="p-3.5 rounded bg-app-surface border border-app-border space-y-1">
            <div className="flex items-center space-x-1.5 text-app-text text-xs font-medium">
              <Eye className="w-4 h-4 text-amber-500" />
              <span>Selective Copy Lock</span>
            </div>
            <p className="text-[11px] text-app-subtext leading-relaxed">
              Clipboard locked across sensitive code. Unlocked exclusively on the whitelisted prompt file.
            </p>
          </div>

          <div className="p-3.5 rounded bg-app-surface border border-app-border space-y-1">
            <div className="flex items-center space-x-1.5 text-app-text text-xs font-medium">
              <Trophy className="w-4 h-4 text-purple-400" />
              <span>Realtime Broadcast</span>
            </div>
            <p className="text-[11px] text-app-subtext leading-relaxed">
              All 150-200 participants synchronized live via Supabase PostgreSQL streaming.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-4 border-t border-app-border text-center text-xs text-app-subtext font-mono">
        Contest Sandbox Platform &bull; Serverless Anti-Cheat Architecture
      </footer>

      {/* Admin Secret Login Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 select-none animate-in fade-in duration-150">
          <div className="w-full max-w-sm p-5 bg-app-surface border border-app-border rounded-lg shadow-xl space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded bg-app-muted border border-app-border flex items-center justify-center text-app-accent">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-app-text">
                    Admin Command Portal
                  </h3>
                  <p className="text-[11px] text-app-subtext">
                    Enter master secret key
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-app-subtext hover:text-app-text cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="admin-secret-input" className="block text-[11px] font-mono text-app-subtext">
                  ADMIN_SECRET_KEY
                </label>
                <input
                  id="admin-secret-input"
                  name="adminSecretKey"
                  type="password"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  placeholder="Enter admin secret..."
                  autoFocus
                  className="w-full px-3 py-1.5 text-xs text-app-text bg-app-bg border border-app-border rounded focus:outline-none focus:border-app-accent font-mono transition-colors"
                />
              </div>

              {adminError && (
                <p className="text-xs text-rose-400 font-mono">{adminError}</p>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="px-3 py-1.5 rounded text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLoading}
                  className="px-3.5 py-1.5 text-xs font-medium rounded bg-app-accent text-app-bg hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50"
                >
                  {adminLoading ? 'Authenticating...' : 'Access Portal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
