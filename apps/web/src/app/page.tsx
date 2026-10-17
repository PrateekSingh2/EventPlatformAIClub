'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { signInWithGoogle } from '@/lib/firebase';
import {
  Sparkles,
  Cpu,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Lock,
  Zap,
  Eye,
  EyeOff,
  Trophy,
  Check,
  Loader2,
  KeyRound,
  X,
  BrainCircuit,
  AlertCircle,
} from 'lucide-react';

function HomePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Incoming query params (for direct route redirections like /token?tokenid=... or /arena?token=...)
  const incomingToken = (
    searchParams.get('token') ||
    searchParams.get('tokenid') ||
    searchParams.get('id') ||
    searchParams.get('t') ||
    ''
  ).trim().toUpperCase();

  const isLoginRequired = searchParams.get('loginRequired') === 'true';

  // Authentication states
  const [googleLoading, setGoogleLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState(incomingToken);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existingToken, setExistingToken] = useState<string | null>(null);

  // Admin secret modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [showAdminSecretText, setShowAdminSecretText] = useState(false);

  // Canvas ref for animated neural synapse network
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check if contestant already has an active session in local storage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('participant_token');
      if (saved && saved.trim()) {
        setExistingToken(saved.trim());
      }
    } catch {}

    if (incomingToken) {
      setTokenInput(incomingToken);
    }
  }, [incomingToken]);

  // Neural Synapse Network Interactive Background Canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Neural Nodes
    const nodeCount = Math.min(Math.floor((width * height) / 22000), 45);
    const nodes: {
      x: number;
      y: number;
      vx: number;
      vy: number;
      radius: number;
      pulse: number;
      color: string;
      lineColor: string;
    }[] = [];

    const palette = [
      { node: 'rgba(52, 211, 153, 0.85)', line: '52, 211, 153' }, // Emerald
      { node: 'rgba(34, 211, 238, 0.85)', line: '34, 211, 238' }, // Cyan
      { node: 'rgba(168, 85, 247, 0.75)', line: '168, 85, 247' }, // Purple
      { node: 'rgba(251, 191, 36, 0.75)', line: '251, 191, 36' }, // Amber
    ];

    for (let i = 0; i < nodeCount; i++) {
      const c = palette[Math.floor(Math.random() * palette.length)];
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        radius: Math.random() * 1.8 + 1.2,
        pulse: Math.random() * Math.PI * 2,
        color: c.node,
        lineColor: c.line,
      });
    }

    let mouseX = width / 2;
    let mouseY = height / 2;
    const handleMouseMove = (e: MouseEvent) => {
      mouseX = e.clientX;
      mouseY = e.clientY;
    };
    window.addEventListener('mousemove', handleMouseMove);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.22;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(${nodes[i].lineColor}, ${alpha})`;
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }

        // Connection to mouse
        const mdx = nodes[i].x - mouseX;
        const mdy = nodes[i].y - mouseY;
        const mdist = Math.sqrt(mdx * mdx + mdy * mdy);
        if (mdist < 145) {
          const malpha = (1 - mdist / 145) * 0.32;
          ctx.beginPath();
          ctx.moveTo(nodes[i].x, nodes[i].y);
          ctx.lineTo(mouseX, mouseY);
          ctx.strokeStyle = `rgba(${nodes[i].lineColor}, ${malpha})`;
          ctx.lineWidth = 1.1;
          ctx.stroke();
        }

        // Update position
        const node = nodes[i];
        node.x += node.vx;
        node.y += node.vy;
        node.pulse += 0.025;

        if (node.x < 0 || node.x > width) node.vx *= -1;
        if (node.y < 0 || node.y > height) node.vy *= -1;

        const currentRadius = node.radius + Math.sin(node.pulse) * 0.6;

        ctx.beginPath();
        ctx.arc(node.x, node.y, Math.max(currentRadius, 0.6), 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Handle Google OAuth Sign-In via Firebase
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const firebaseUser = await signInWithGoogle();

      // Transmit to server with any incoming token attached
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          uid: firebaseUser.uid,
          idToken: firebaseUser.idToken,
          token: (incomingToken || tokenInput).trim().toUpperCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Google authentication failed. Please try again.');
        setGoogleLoading(false);
        return;
      }

      // Mark session as active and store credentials
      const finalToken = incomingToken || data.token;
      sessionStorage.setItem('contestant_session_active', 'true');
      localStorage.setItem('participant_token', finalToken);
      if (data.user) {
        localStorage.setItem('contestant_profile', JSON.stringify(data.user));
      }

      // Automatic smooth redirect to the Arena dashboard
      router.push(`/arena?token=${encodeURIComponent(finalToken)}`);
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
      setGoogleLoading(false);
    }
  };

  // Direct Contestant Access Fallback (guarantees entry if Google popup auto-closes or is blocked)
  const handleDirectContestantAccess = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'contestant@aiclub.org',
          name: 'AI Club Contestant',
          uid: 'direct-entry-' + Math.random().toString(36).substring(2, 9),
        }),
      });

      const data = await res.json();
      const finalToken = incomingToken || data.token || 'AX-CONTESTANT-TOKEN';
      sessionStorage.setItem('contestant_session_active', 'true');
      localStorage.setItem('participant_token', finalToken);
      if (data.user) {
        localStorage.setItem('contestant_profile', JSON.stringify(data.user));
      }
      router.push(`/arena?token=${encodeURIComponent(finalToken)}`);
    } catch (err: any) {
      setError(err.message || 'Direct contestant entry failed.');
      setGoogleLoading(false);
    }
  };

  // Handle Manual Access Token Verification & Entry
  const handleTokenSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanToken = tokenInput.trim().toUpperCase();
    if (!cleanToken) {
      setError('Please enter your participant access token');
      return;
    }

    setTokenLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: cleanToken }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Invalid or unverified contestant token.');
        setTokenLoading(false);
        return;
      }

      sessionStorage.setItem('contestant_session_active', 'true');
      localStorage.setItem('participant_token', cleanToken);
      if (data.user) {
        localStorage.setItem('contestant_profile', JSON.stringify(data.user));
      }

      // Automatic redirect to the Arena dashboard
      router.push(`/arena?token=${encodeURIComponent(cleanToken)}`);
    } catch (err: any) {
      setError(err.message || 'Token verification failed. Please try again.');
      setTokenLoading(false);
    }
  };

  // Handle Admin Login Modal
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
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col justify-between font-sans selection:bg-emerald-500/20 selection:text-app-accent transition-colors duration-200 relative overflow-x-hidden">
      
      {/* Interactive Neural Synapse Canvas */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 pointer-events-none z-0 opacity-65"
      />

      {/* Atmospheric Ambient Glow Halos */}
      <div className="fixed top-0 left-1/4 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[130px] pointer-events-none -z-10" />
      <div className="fixed bottom-0 right-1/4 w-[450px] h-[450px] bg-cyan-500/10 rounded-full blur-[140px] pointer-events-none -z-10" />

      {/* =========================================================================
          COMPACT TOP NAVIGATION BAR
         ========================================================================= */}
      <header className="h-14 sm:h-15 bg-app-surface border-b border-app-border px-4 sm:px-6 w-full flex items-center justify-between select-none relative z-20 shadow-xs">
        
        {/* Left: AI Club Emblem & Event Badge */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 rounded-xl bg-app-muted border border-app-border flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-xs">
            <BrainCircuit className="w-4 h-4" />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm font-extrabold tracking-tight text-app-text">
              PIXEL AND ANOMALY
            </span>
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
              AI CLUB
            </span>
          </div>
        </div>

        {/* Right: Admin Key Button */}
        <div className="flex items-center space-x-2">

          {/* Admin Command Portal Button */}
          <button
            onClick={() => setShowAdminModal(true)}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-xl border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text text-xs transition-all cursor-pointer flex items-center space-x-1 shadow-xs"
            title="Admin Portal"
          >
            <Lock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline font-medium">Admin</span>
          </button>
        </div>
      </header>

      {/* =========================================================================
          COMPACT MAIN HERO & AUTHENTICATION CARD
         ========================================================================= */}
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-7 flex flex-col items-center text-center relative z-10 flex-1 justify-center">
        
        {/* Compact AI Club Event Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold shadow-xs mb-3 select-none"
        >
          <Sparkles className="w-3 h-3 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          <span>PRESENTED BY AI CLUB</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
        </motion.div>

        {/* Compact Event Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.08 }}
          className="text-2xl sm:text-4xl md:text-5xl font-black tracking-tight text-app-text leading-tight"
        >
          Pixel and{' '}
          <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 dark:from-emerald-400 dark:via-teal-300 dark:to-cyan-400 bg-clip-text text-transparent">
            Anomaly
          </span>
        </motion.h1>

        {/* Short Subtitle */}
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.15 }}
          className="mt-1 text-xs sm:text-sm text-app-subtext max-w-md leading-relaxed"
        >
          The premier cybersecurity & prompt injection arena organized by <strong className="text-app-text font-semibold">AI Club</strong>.
        </motion.p>

        {/* =========================================================================
            ATTACHED TOKEN / LOGIN REQUIRED BANNER
           ========================================================================= */}
        {incomingToken && isLoginRequired && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 w-full max-w-md p-2.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center space-x-2 text-left shadow-xs"
          >
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" />
            <div className="text-[11px] text-app-text">
              <span className="font-bold text-amber-500">Access Key Detected:</span>{' '}
              <span className="font-mono font-semibold">{incomingToken}</span>. Please sign in with Google to enter your arena dashboard.
            </div>
          </motion.div>
        )}

        {/* =========================================================================
            MAIN COMPACT AUTHENTICATION CARD
           ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-4 sm:mt-5 w-full max-w-md p-5 sm:p-6 bg-app-surface border border-app-border rounded-3xl shadow-[0_16px_45px_rgba(0,0,0,0.25)] relative overflow-hidden text-left"
        >
          {/* Subtle top edge accent glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 opacity-90" />

          {/* Card Header */}
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs shrink-0">
              <Cpu className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-app-text tracking-tight">
                Contestant Single Sign-On
              </h2>
              <p className="text-[11px] text-app-subtext">
                One-tap Google authentication &bull; Powered by Firebase
              </p>
            </div>
          </div>

          {/* Active Session Quick-Resume Pill */}
          {existingToken && !incomingToken && (
            <div className="mb-4 p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-between gap-2 shadow-xs">
              <div className="min-w-0">
                <div className="text-[9px] font-mono uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-bold">
                  Active Session
                </div>
                <div className="font-mono text-xs font-semibold text-app-text truncate">
                  {existingToken}
                </div>
              </div>
              <button
                onClick={() => {
                  sessionStorage.setItem('contestant_session_active', 'true');
                  router.push(`/arena?token=${encodeURIComponent(existingToken)}`);
                }}
                className="px-2.5 py-1 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 flex items-center space-x-1 shadow-sm transition-all cursor-pointer"
              >
                <span>Resume</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Error Message with Direct Bypass */}
          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs shadow-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
              <button
                type="button"
                onClick={handleDirectContestantAccess}
                className="w-full py-1.5 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-700 dark:text-rose-200 font-bold text-xs flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
              >
                <span>Continue into Arena (Direct Contestant Entry)</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* METHOD 1: Continue with Google (Firebase OAuth) */}
          <div className="space-y-3">
            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading || tokenLoading}
              className="w-full flex items-center justify-center space-x-3 px-4 py-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm tracking-wide border border-slate-200/90 shadow-[0_3px_12px_rgba(0,0,0,0.1)] hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none group"
            >
              {googleLoading ? (
                <>
                  <Loader2 className="w-4 h-4 text-slate-900 animate-spin" />
                  <span>Signing in with Google...</span>
                </>
              ) : (
                <>
                  {/* Official Google 4-Color SVG Icon */}
                  <svg className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span className="font-semibold text-slate-900 group-hover:text-black">
                    Continue with Google
                  </span>
                </>
              )}
            </button>

            <div className="text-center pt-0.5">
              <button
                type="button"
                onClick={handleDirectContestantAccess}
                className="text-[11px] text-app-subtext hover:text-app-text transition-colors cursor-pointer underline decoration-dotted"
              >
                Having popup issues? Click here for Direct Contestant Entry
              </button>
            </div>

            {/* Clean Divider */}
            <div className="relative flex items-center justify-center my-2 select-none">
              <div className="border-t border-app-border w-full"></div>
              <span className="bg-app-surface px-2.5 text-[10px] font-mono uppercase tracking-wider text-app-subtext shrink-0 font-medium">
                or enter access token
              </span>
            </div>

            {/* METHOD 2: Compact Token Entry Form */}
            <form onSubmit={handleTokenSubmit} className="space-y-2.5">
              <div className="relative flex items-center">
                <div className="absolute left-3 text-app-subtext pointer-events-none">
                  <KeyRound className="w-3.5 h-3.5" />
                </div>
                
                <input
                  id="contestant-token-input"
                  name="contestantToken"
                  type="text"
                  value={tokenInput}
                  onChange={(e) => {
                    setTokenInput(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="e.g. AX-7890-ABCD"
                  disabled={googleLoading || tokenLoading}
                  className="w-full pl-8 pr-7 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-app-accent font-mono tracking-wider transition-colors placeholder:text-app-subtext/40 shadow-inner"
                />

                {tokenInput && (
                  <button
                    type="button"
                    onClick={() => setTokenInput('')}
                    className="absolute right-2 text-app-subtext hover:text-app-text p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={tokenLoading || googleLoading || !tokenInput.trim()}
                className="w-full flex items-center justify-center space-x-1.5 py-2 rounded-xl bg-app-accent text-app-bg font-bold text-xs tracking-wide hover:opacity-95 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {tokenLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <span>Enter Arena with Token</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Security & System Guarantees Footer */}
          <div className="mt-4 pt-3 border-t border-app-border flex items-center justify-between text-[10px] text-app-subtext">
            <div className="flex items-center space-x-1">
              <ShieldCheck className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span>Zero-Disk RAM Sandbox</span>
            </div>
            <div className="flex items-center space-x-1">
              <Zap className="w-3 h-3 text-cyan-500 dark:text-cyan-400 shrink-0" />
              <span>Auto-Provisioned Access</span>
            </div>
          </div>
        </motion.div>

        {/* =========================================================================
            COMPACT HORIZONTAL FEATURE BADGES STRIP (REPLACES TALL CARDS)
           ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28 }}
          className="grid grid-cols-3 gap-2 mt-4 sm:mt-5 w-full max-w-md text-left"
        >
          <div className="p-2.5 rounded-xl bg-app-surface border border-app-border shadow-xs flex items-center space-x-2">
            <Terminal className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-app-text truncate">Extraction</div>
              <div className="text-[9px] text-app-subtext truncate">Directives</div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-app-surface border border-app-border shadow-xs flex items-center space-x-2">
            <Zap className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-app-text truncate">RAM Sandbox</div>
              <div className="text-[9px] text-app-subtext truncate">@zip.js</div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-app-surface border border-app-border shadow-xs flex items-center space-x-2">
            <Trophy className="w-3.5 h-3.5 text-amber-500 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-[10px] font-bold text-app-text truncate">Hot-Sync</div>
              <div className="text-[9px] text-app-subtext truncate">Leaderboard</div>
            </div>
          </div>
        </motion.div>
      </main>

      {/* =========================================================================
          COMPACT FOOTER
         ========================================================================= */}
      <footer className="py-2.5 border-t border-app-border bg-app-surface text-center text-[11px] text-app-subtext font-mono relative z-10 px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
          <span className="font-semibold text-app-text">Pixel and Anomaly</span>
          <span className="hidden sm:inline text-app-subtext/40">&bull;</span>
          <span>Presented by AI Club 2026</span>
          <span className="hidden sm:inline text-app-subtext/40">&bull;</span>
          <span className="text-emerald-500 dark:text-emerald-400 font-sans font-medium">Zero-Footprint Anti-Cheat</span>
        </div>
      </footer>

      {/* =========================================================================
          ADMIN COMMAND PORTAL MODAL (OPAQUE CARD, BLURRY BACKDROP)
         ========================================================================= */}
      {showAdminModal && (
        <div
          onClick={() => setShowAdminModal(false)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xl select-none animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm p-5 sm:p-6 bg-app-surface border border-app-border rounded-3xl shadow-[0_24px_60px_rgba(0,0,0,0.65)] space-y-4"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-app-muted border border-app-border flex items-center justify-center text-app-accent shadow-xs">
                  <Lock className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-app-text tracking-tight">
                    Admin Command Portal
                  </h3>
                  <p className="text-[11px] text-app-subtext">
                    Enter master secret key
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAdminModal(false)}
                className="text-app-subtext hover:text-app-text cursor-pointer p-1 rounded-lg hover:bg-app-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="admin-secret-input" className="block text-[11px] font-mono text-app-subtext">
                  ADMIN_SECRET_KEY
                </label>
                <div className="relative">
                  <input
                    id="admin-secret-input"
                    name="adminSecretKey"
                    type={showAdminSecretText ? 'text' : 'password'}
                    value={adminSecret}
                    onChange={(e) => {
                      setAdminSecret(e.target.value);
                      setAdminError(null);
                    }}
                    placeholder="Enter admin secret..."
                    autoFocus
                    className="w-full px-3 pr-8 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-app-accent font-mono shadow-inner transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminSecretText(!showAdminSecretText)}
                    className="absolute right-2.5 top-2.5 text-app-subtext hover:text-app-text"
                  >
                    {showAdminSecretText ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {adminError && (
                <p className="text-xs text-rose-500 dark:text-rose-400 font-mono bg-rose-500/10 p-2 rounded-lg border border-rose-500/20">
                  {adminError}
                </p>
              )}

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-app-border">
                <button
                  type="button"
                  onClick={() => setShowAdminModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-app-subtext hover:text-app-text hover:bg-app-hover transition-colors cursor-pointer font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLoading || !adminSecret.trim()}
                  className="px-4 py-1.5 text-xs font-semibold rounded-xl bg-app-accent text-app-bg hover:opacity-95 active:scale-[0.98] shadow-sm transition-all cursor-pointer disabled:opacity-50"
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

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app-bg text-app-text flex items-center justify-center font-mono text-xs">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-app-accent" />
          <span>Loading Pixel and Anomaly...</span>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
