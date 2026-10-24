'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { signInWithGoogle } from '@/lib/firebase';
import {
  getContestantSession,
  setContestantSession,
  clearContestantSession,
  updateContestantSessionToken,
  updateContestantSessionTeam,
  ContestantSession,
} from '@/lib/session';
import {
  Sparkles,
  Cpu,
  ShieldCheck,
  Terminal,
  ArrowRight,
  Zap,
  Trophy,
  Loader2,
  KeyRound,
  X,
  BrainCircuit,
  AlertCircle,
  LogOut,
  UserCheck,
  CheckCircle2,
  Lock,
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

  // Active user session state
  const [currentUser, setCurrentUser] = useState<ContestantSession | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  // Authentication & token states
  const [googleLoading, setGoogleLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState(incomingToken);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Canvas ref for animated neural synapse network
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check if contestant already has an active session in persistent storage
  useEffect(() => {
    const existing = getContestantSession();
    if (existing) {
      setCurrentUser(existing);
      if (!incomingToken && existing.assignedToken) {
        setTokenInput(existing.assignedToken);
      }
    }
    if (incomingToken) {
      setTokenInput(incomingToken);
    }
    setSessionChecked(true);
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

  // STEP 1: Handle Google OAuth Sign-In via Firebase
  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setError(null);

    try {
      const firebaseUser = await signInWithGoogle();

      // Transmit to server to lookup existing participant record or register new contestant
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: firebaseUser.email,
          name: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
          uid: firebaseUser.uid,
          idToken: firebaseUser.idToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Google authentication failed. Please try again.');
        setGoogleLoading(false);
        return;
      }

      // Store contestant session in persistent storage
      const assignedToken =
        data.user?.access_token && !data.user.access_token.startsWith('PENDING')
          ? data.user.access_token
          : null;

      const newSession: ContestantSession = {
        email: (data.user?.email || firebaseUser.email).toLowerCase().trim(),
        name: data.user?.name || firebaseUser.displayName || firebaseUser.email.split('@')[0],
        uid: data.user?.id || firebaseUser.uid,
        photoURL: firebaseUser.photoURL || null,
        assignedToken,
        teamName: data.user?.team_name || null,
        teamSize: data.user?.team_size || null,
        lastLoginAt: Date.now(),
      };

      setContestantSession(newSession);
      setCurrentUser(newSession);

      // If user already has an assigned token and no custom incoming token, pre-fill it
      if (assignedToken && !tokenInput) {
        setTokenInput(assignedToken);
      }

      setGoogleLoading(false);
    } catch (err: any) {
      setError(err.message || 'Google Sign-In failed.');
      setGoogleLoading(false);
    }
  };

  // Handle Logout / Switch Account
  const handleSignOut = async () => {
    await clearContestantSession();
    setCurrentUser(null);
    setError(null);
  };

  // STEP 2: Handle Manual Team Code Verification & Arena Entry
  const handleTeamCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      setError('Please log in with your Google account first.');
      return;
    }

    const cleanToken = tokenInput.trim().toUpperCase();
    if (!cleanToken) {
      setError('Please enter your team room access code.');
      return;
    }

    setTokenLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: cleanToken,
          userEmail: currentUser.email,
          userName: currentUser.name,
          userId: currentUser.uid,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Access Denied: Invalid team code or account mismatch.');
        setTokenLoading(false);
        return;
      }

      // Update session with verified token and team metadata
      updateContestantSessionToken(cleanToken);
      if (data.user?.team_name) {
        updateContestantSessionTeam(data.user.team_name, data.user.team_size);
      }

      // Smooth redirect to the Arena dashboard with verified token
      router.push(`/arena?token=${encodeURIComponent(cleanToken)}`);
    } catch (err: any) {
      setError(err.message || 'Team code verification failed. Please try again.');
      setTokenLoading(false);
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
          TOP NAVIGATION BAR (NO ADMIN BUTTON)
         ========================================================================= */}
      <header className="h-15 sm:h-16 bg-app-surface/85 backdrop-blur-md border-b border-app-border px-4 sm:px-6 w-full flex items-center justify-between select-none relative z-20 shadow-xs">
        
        {/* Left: AI Club Emblem & Event Badge */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          <div className="w-8 h-8 rounded-xl bg-app-muted border border-app-border flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-xs">
            <BrainCircuit className="w-4.5 h-4.5" />
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

        {/* Right: Security & Platform Status Badge */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1.5 px-3 py-1 rounded-xl bg-app-bg border border-app-border text-[11px] text-app-subtext font-mono shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden xs:inline">Single-Account Lock</span>
            <span className="xs:hidden">Locked</span>
          </div>
        </div>
      </header>

      {/* =========================================================================
          MAIN HERO & DASHBOARD AREA
         ========================================================================= */}
      <main className="max-w-2xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex flex-col items-center text-center relative z-10 flex-1 justify-center">
        
        {/* Compact AI Club Event Pill Badge */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="inline-flex items-center space-x-2 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-semibold shadow-xs mb-3 select-none"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 animate-pulse" />
          <span>PRESENTED BY AI CLUB</span>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping inline-block" />
        </motion.div>

        {/* Event Headline */}
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
            LOGIN REQUIRED / ACCESS KEY NOTICE BANNER
           ========================================================================= */}
        {(!currentUser && (incomingToken || isLoginRequired)) && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3.5 w-full max-w-md p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start space-x-2.5 text-left shadow-xs"
          >
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-[11px] text-app-text leading-snug">
              <span className="font-bold text-amber-500">Sign-In Required:</span>{' '}
              {incomingToken ? (
                <>
                  Access key <span className="font-mono font-bold text-app-text">{incomingToken}</span> detected. Please sign in with your Google account first to verify ownership and enter your arena room.
                </>
              ) : (
                'Please sign in with your Google account to access your arena room.'
              )}
            </div>
          </motion.div>
        )}

        {/* =========================================================================
            MAIN AUTHENTICATION & ROOM ENTRY DASHBOARD CARD
           ========================================================================= */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.2 }}
          className="mt-4 sm:mt-5 w-full max-w-md p-5 sm:p-6 bg-app-surface/95 backdrop-blur-xl border border-app-border rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] relative overflow-hidden text-left"
        >
          {/* Subtle top edge accent glow */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-500 opacity-90" />

          {/* Error Message Box */}
          {error && (
            <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs shadow-xs space-y-2">
              <div className="flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                <span className="leading-snug">{error}</span>
              </div>
            </div>
          )}

          {/* =======================================================================
              STATE 1: USER NOT LOGGED IN -> STEP 1: GOOGLE SIGN-IN
             ======================================================================= */}
          {!currentUser ? (
            <div className="space-y-4">
              {/* Card Header */}
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shadow-xs shrink-0">
                  <Cpu className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm sm:text-base font-bold text-app-text tracking-tight">
                      Contestant Access
                    </h2>
                    <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                      STEP 1 OF 2
                    </span>
                  </div>
                  <p className="text-[11px] text-app-subtext mt-0.5">
                    Single-tap authentication links your team pass to your Google identity
                  </p>
                </div>
              </div>

              {/* Enhanced Google Single-Tap Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="relative w-full group overflow-hidden rounded-2xl bg-white hover:bg-slate-50 text-slate-900 font-bold text-xs sm:text-sm tracking-wide border border-slate-200/90 shadow-[0_4px_16px_rgba(66,133,244,0.18)] hover:shadow-[0_6px_24px_rgba(66,133,244,0.28)] hover:scale-[1.01] active:scale-[0.985] transition-all duration-200 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed select-none py-3.5 px-4 flex items-center justify-between"
              >
                {googleLoading ? (
                  <div className="w-full flex items-center justify-center space-x-2 py-0.5">
                    <Loader2 className="w-4 h-4 text-slate-800 animate-spin shrink-0" />
                    <span className="text-slate-800 font-semibold">Connecting with Google Account...</span>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-3 min-w-0">
                      {/* Official Google 4-Color SVG Icon */}
                      <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center shrink-0">
                        <svg className="w-5 h-5 shrink-0 transition-transform duration-200 group-hover:scale-110" viewBox="0 0 24 24">
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
                      </div>
                      <span className="font-bold text-slate-900 group-hover:text-black tracking-normal text-xs sm:text-sm truncate">
                        Single-Tap Sign in with Google
                      </span>
                    </div>

                    {/* 1-Tap Instant Badge */}
                    <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-800 text-[10px] font-mono font-bold border border-emerald-500/25 shrink-0">
                      <Zap className="w-2.5 h-2.5 fill-emerald-600 text-emerald-600" />
                      <span>Instant 1-Tap</span>
                    </span>
                  </>
                )}
              </button>

              {/* Informative Note */}
              <div className="p-2.5 rounded-xl bg-app-bg/60 border border-app-border text-[11px] text-app-subtext flex items-center space-x-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                <span>Secure authentication &bull; Room team code verification follows immediately.</span>
              </div>
            </div>
          ) : (
            /* =======================================================================
                STATE 2: USER IS LOGGED IN -> STEP 2: ENTER ROOM TEAM CODE
               ======================================================================= */
            <div className="space-y-4">
              {/* Refined Logged-In User Profile Strip */}
              <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="relative shrink-0">
                    {currentUser.photoURL ? (
                      <img
                        src={currentUser.photoURL}
                        alt={currentUser.name}
                        className="w-9 h-9 rounded-full border-2 border-emerald-500/40 object-cover"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-2xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs border border-emerald-500/30">
                        <UserCheck className="w-4 h-4" />
                      </div>
                    )}
                    <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-app-surface ring-1 ring-emerald-400" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-xs sm:text-sm text-app-text truncate">
                        {currentUser.name}
                      </span>
                      <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                        Verified
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-app-subtext truncate mt-0.5">
                      {currentUser.email}
                    </div>
                    {currentUser.teamName && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 font-bold">
                          Team: {currentUser.teamName}
                        </span>
                        {currentUser.teamSize && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400 border border-purple-500/30">
                            {currentUser.teamSize}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Switch Account Button */}
                <button
                  onClick={handleSignOut}
                  className="px-2.5 py-1.5 rounded-xl border border-app-border bg-app-surface hover:bg-rose-500/10 hover:border-rose-500/30 text-app-subtext hover:text-rose-500 text-[11px] font-medium transition-all cursor-pointer flex items-center space-x-1.5 shrink-0 shadow-xs active:scale-95"
                  title="Sign out or switch account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch</span>
                </button>
              </div>

              {/* Step 2 Header */}
              <div className="pt-1">
                <div className="flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
                    <KeyRound className="w-3.5 h-3.5" />
                  </div>
                  <h3 className="text-sm font-bold text-app-text tracking-tight">
                    Enter Room Team Code (Step 2 of 2)
                  </h3>
                </div>
                <p className="text-[11px] text-app-subtext mt-1.5 leading-relaxed">
                  Enter the access code generated for your team. The system verifies that this token is signed for <strong className="text-app-text font-semibold">{currentUser.email}</strong>.
                </p>
              </div>

              {/* Quick Code Autofill if Account already has an assigned token */}
              {currentUser.assignedToken && currentUser.assignedToken !== tokenInput && (
                <div className="p-3 rounded-2xl bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-cyan-500/10 border border-emerald-500/25 flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase text-emerald-500 font-semibold">Assigned Access Token:</div>
                    <div className="font-mono font-bold text-app-text text-xs tracking-wider">{currentUser.assignedToken}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTokenInput(currentUser.assignedToken!);
                      setError(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] cursor-pointer transition-all shadow-xs flex items-center space-x-1 active:scale-95"
                  >
                    <Zap className="w-3 h-3 fill-current" />
                    <span>1-Tap Autofill</span>
                  </button>
                </div>
              )}

              {/* Manual Team Code Input Form */}
              <form onSubmit={handleTeamCodeSubmit} className="space-y-3 pt-1">
                <div className="relative flex items-center">
                  <div className="absolute left-3.5 text-app-subtext pointer-events-none">
                    <KeyRound className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                  </div>
                  
                  <input
                    id="team-code-input"
                    name="teamCode"
                    type="text"
                    value={tokenInput}
                    onChange={(e) => {
                      setTokenInput(e.target.value.toUpperCase());
                      setError(null);
                    }}
                    placeholder="e.g. AX-7890-ABCD"
                    disabled={tokenLoading}
                    autoFocus
                    className="w-full pl-10 pr-9 py-2.5 text-xs sm:text-sm text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-app-accent focus:ring-1 focus:ring-app-accent/30 font-mono tracking-widest uppercase transition-all placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-app-subtext/40 shadow-inner"
                  />

                  {tokenInput && (
                    <button
                      type="button"
                      onClick={() => setTokenInput('')}
                      className="absolute right-2.5 text-app-subtext hover:text-app-text p-1 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={tokenLoading || !tokenInput.trim()}
                  className="w-full flex items-center justify-center space-x-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-bold text-xs sm:text-sm tracking-wide shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:shadow-[0_0_32px_rgba(16,185,129,0.45)] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  {tokenLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 text-slate-950 animate-spin mr-1" />
                      <span>Verifying Token Ownership...</span>
                    </>
                  ) : (
                    <>
                      <span>Enter Arena Room</span>
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Security & System Guarantees Footer */}
          <div className="mt-4 pt-3.5 border-t border-app-border flex items-center justify-between text-[10px] text-app-subtext">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 shrink-0" />
              <span>Single-Account Lock</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-500 dark:text-cyan-400 shrink-0" />
              <span>Zero-Disk RAM Sandbox</span>
            </div>
          </div>
        </motion.div>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.28 }}
          className="grid grid-cols-3 gap-2.5 mt-4 sm:mt-5 w-full max-w-md text-left"
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

      {/* Footer */}
      <footer className="py-2.5 border-t border-app-border bg-app-surface text-center text-[11px] text-app-subtext font-mono relative z-10 px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2">
          <span className="font-semibold text-app-text">Pixel and Anomaly</span>
          <span className="hidden sm:inline text-app-subtext/40">&bull;</span>
          <span>Presented by AI Club 2026</span>
          <span className="hidden sm:inline text-app-subtext/40">&bull;</span>
          <span className="text-emerald-500 dark:text-emerald-400 font-sans font-medium">Single-Account Security</span>
          <span className="hidden sm:inline text-app-subtext/40">&bull;</span>
          <a
            href="/admin"
            className="text-app-subtext/60 hover:text-emerald-400 transition-colors"
            title="Administrator Command Portal"
          >
            Admin Portal
          </a>
        </div>
      </footer>

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
