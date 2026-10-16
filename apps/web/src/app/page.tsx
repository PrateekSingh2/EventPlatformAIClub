'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
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
    <div className="relative min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between overflow-hidden">
      {/* Bio-luminescent Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-2/3 right-1/4 w-[450px] h-[300px] bg-violet-600/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="relative z-10 px-6 py-6 max-w-7xl mx-auto w-full flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <ShieldCheck className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <span className="font-extrabold text-sm tracking-wider uppercase bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-transparent">
              EventPlatform AI Club
            </span>
            <span className="block text-[11px] text-slate-400 font-mono">
              Serverless Anti-Cheat Contest Arena
            </span>
          </div>
        </div>

        <button
          onClick={() => setShowAdminModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800 rounded-xl transition-all cursor-pointer"
        >
          <Lock className="w-3.5 h-3.5 text-slate-400" />
          Admin Portal
        </button>
      </header>

      {/* Hero & Participant Token Entry */}
      <main className="relative z-10 max-w-3xl mx-auto w-full px-6 py-12 flex flex-col items-center text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-mono mb-6">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          High-Concurrency Sandbox &bull; 150-200 Participants
        </div>

        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white max-w-2xl leading-tight">
          Stage-Locked Archive Sandbox & Anti-Cheat Arena
        </h1>
        <p className="mt-4 text-sm sm:text-base text-slate-400 max-w-xl leading-relaxed">
          In-memory zero-download archive decompression, browser fullscreen sandbox lock, selective AI prompt extraction, and real-time leaderboard broadcast.
        </p>

        {/* Token Entry Box */}
        <div className="mt-10 w-full max-w-md p-6 glass-panel-highlight rounded-2xl border border-cyan-500/30 shadow-2xl">
          <form onSubmit={handleParticipantLogin} className="space-y-4 text-left">
            <div>
              <label className="block text-xs font-semibold tracking-wider text-slate-300 uppercase mb-2">
                Participant Access Token
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="AX-XXXX-XXXX"
                  className="w-full px-4 py-3 pl-10 text-sm font-mono tracking-wider text-white bg-slate-950/90 border border-slate-700/80 rounded-xl focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 uppercase transition-colors"
                />
                <KeyRound className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>

            {error && (
              <p className="text-xs text-rose-400 font-medium">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all shadow-neon-cyan disabled:opacity-50 cursor-pointer"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Authenticating...
                </>
              ) : (
                <>
                  Enter Contest Arena
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px]">
            <span className="text-slate-500">Testing preview:</span>
            <button
              type="button"
              onClick={() => {
                setToken('AX-DEMO-2026');
                setError(null);
              }}
              className="text-cyan-400 hover:text-cyan-300 font-mono font-semibold cursor-pointer underline underline-offset-2"
            >
              Use Demo Token (AX-DEMO-2026)
            </button>
          </div>
        </div>

        {/* Architecture Feature Badges */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 w-full max-w-2xl text-left">
          <div className="p-4 rounded-xl glass-panel border border-slate-800/80">
            <Terminal className="w-5 h-5 text-cyan-400 mb-2" />
            <h2 className="text-xs font-bold text-white">In-Memory RAM Decompression</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              ZIP binaries are extracted strictly in browser RAM via @zip.js. Zero OS disk footprint.
            </p>
          </div>

          <div className="p-4 rounded-xl glass-panel border border-slate-800/80">
            <Eye className="w-5 h-5 text-violet-400 mb-2" />
            <h2 className="text-xs font-bold text-white">Selective Copy AI Lock</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              DevTools and clipboard blocked. Copying is unlocked exclusively on the designated prompt file.
            </p>
          </div>

          <div className="p-4 rounded-xl glass-panel border border-slate-800/80">
            <Trophy className="w-5 h-5 text-emerald-400 mb-2" />
            <h2 className="text-xs font-bold text-white">Realtime Broadcast</h2>
            <p className="text-[11px] text-slate-400 mt-1">
              200 participants synchronized live via Supabase Realtime without server polling.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 py-6 border-t border-slate-800/60 text-center text-xs text-slate-600 font-mono">
        EventPlatform AI Club &bull; Serverless Anti-Cheat Architecture
      </footer>

      {/* Admin Secret Login Modal */}
      {showAdminModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="w-full max-w-md p-6 glass-panel-highlight rounded-2xl border border-violet-500/40 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Lock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-white">Admin Command Center</h2>
                <p className="text-xs text-slate-400">Enter master administrator secret key</p>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                  Admin Secret Key
                </label>
                <input
                  type="password"
                  value={adminSecret}
                  onChange={(e) => setAdminSecret(e.target.value)}
                  placeholder="Master Secret..."
                  autoFocus
                  className="w-full px-4 py-2.5 text-sm text-white bg-slate-900 border border-slate-700 rounded-xl focus:outline-none focus:border-violet-400 font-mono"
                />
              </div>

              {adminError && (
                <p className="text-xs text-rose-400 font-medium">{adminError}</p>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLoading}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-all shadow-neon-violet cursor-pointer disabled:opacity-50"
                >
                  {adminLoading ? 'Verifying...' : 'Access Admin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
