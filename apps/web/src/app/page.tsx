'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
  ShieldCheck,
  Terminal,
  ArrowRight,
  Zap,
  Trophy,
  Loader2,
  KeyRound,
  X,
  AlertCircle,
  LogOut,
  UserCheck,
  Lock,
  Radio,
  Eye,
  EyeOff,
  Sparkles,
  ExternalLink,
  Mail,
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
  const [emailInput, setEmailInput] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [tokenInput, setTokenInput] = useState(incomingToken);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    try {
      const storedApiKey =
        localStorage.getItem('contest_gemini_api_key') ||
        sessionStorage.getItem('contest_gemini_api_key') ||
        '';
      if (storedApiKey) {
        setGeminiApiKey(storedApiKey);
      }
    } catch {}
    setSessionChecked(true);
  }, [incomingToken]);

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

  // STEP 1 (Alternative): Handle Direct Registered Email Sign-In
  const handleEmailSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@') || !cleanEmail.includes('.')) {
      setError('Please enter a valid registered email address.');
      return;
    }

    setEmailLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: cleanEmail.split('@')[0],
          uid: 'email-contestant-' + Math.random().toString(36).substring(2, 9),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.authenticated) {
        setError(data.error || 'Failed to authenticate email. Please verify your address.');
        setEmailLoading(false);
        return;
      }

      const assignedToken =
        data.user?.access_token && !data.user.access_token.startsWith('PENDING')
          ? data.user.access_token
          : null;

      const newSession: ContestantSession = {
        email: cleanEmail,
        name: data.user?.name || cleanEmail.split('@')[0],
        uid: data.user?.id || 'email-user-' + cleanEmail,
        photoURL: null,
        assignedToken,
        teamName: data.user?.team_name || null,
        teamSize: data.user?.team_size || null,
        lastLoginAt: Date.now(),
      };

      setContestantSession(newSession);
      setCurrentUser(newSession);

      if (assignedToken && !tokenInput) {
        setTokenInput(assignedToken);
      }

      setEmailLoading(false);
    } catch (err: any) {
      setError(err.message || 'Email authentication failed.');
      setEmailLoading(false);
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
      setError('Please sign in with your Google account first.');
      return;
    }

    const cleanToken = tokenInput.trim().toUpperCase();
    if (!cleanToken) {
      setError('Please enter your team room access code.');
      return;
    }

    const cleanApiKey = geminiApiKey.trim();
    if (!cleanApiKey) {
      setError('Please enter your Google Gemini API Key. You can get one for free at aistudio.google.com.');
      return;
    }

    if (cleanApiKey.length < 15) {
      setError('Invalid Gemini API Key format. Google AI Studio keys typically start with "AIzaSy..."');
      return;
    }

    // Persist Gemini API Key in browser storage for in-arena AI tutor
    try {
      localStorage.setItem('contest_gemini_api_key', cleanApiKey);
      sessionStorage.setItem('contest_gemini_api_key', cleanApiKey);
    } catch {}

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

      // Redirect to the Arena dashboard with verified token
      router.push(`/arena?token=${encodeURIComponent(cleanToken)}`);
    } catch (err: any) {
      setError(err.message || 'Team code verification failed. Please try again.');
      setTokenLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col justify-between font-sans selection:bg-zinc-800 selection:text-white transition-colors duration-150 relative">
      
      {/* Top Navigation Bar */}
      <header className="h-14 sm:h-16 bg-app-surface border-b border-app-border px-4 sm:px-6 w-full flex items-center justify-between select-none relative z-20">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-lg bg-app-surface-raised border border-app-border flex items-center justify-center text-app-text font-bold text-xs">
            CTF
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs sm:text-sm font-bold tracking-tight text-app-text">
              Pixel & Anomaly
            </span>
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-app-surface-raised text-app-subtext border border-app-border hidden sm:inline-block">
              AI Club 2026
            </span>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href="/admin"
            className="text-[11px] font-mono px-2.5 py-1 rounded-lg border border-app-border bg-app-surface-raised hover:bg-app-hover text-app-subtext hover:text-app-text transition-colors"
            title="Contest Organizer & Admin Login"
          >
            Admin Portal
          </a>
          <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-app-surface-raised border border-app-border text-[11px] text-app-subtext font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>Arena Online</span>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12 flex flex-col items-center text-center relative z-10 flex-1 justify-center">
        
        {/* Event Header */}
        <div className="space-y-2 mb-6">
          <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-app-surface-raised border border-app-border text-app-subtext text-xs font-medium">
            <span>AI Club Tournament</span>
            <span>&bull;</span>
            <span className="text-app-text font-semibold">Prompt & Challenge CTF</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-app-text">
            Pixel and Anomaly
          </h1>

          <p className="text-xs sm:text-sm text-app-subtext max-w-sm mx-auto leading-relaxed">
            Extract cryptographic flags, analyze nested puzzle archives, and compete on the live arena leaderboard.
          </p>
        </div>

        {/* Login Required Notice */}
        {(!currentUser && (incomingToken || isLoginRequired)) && (
          <div className="mb-4 w-full max-w-md p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start space-x-2.5 text-left">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-app-text leading-snug">
              <span className="font-semibold text-amber-500">Sign-In Required:</span>{' '}
              {incomingToken ? (
                <>
                  Passcode <span className="font-mono font-bold">{incomingToken}</span> detected. Sign in with Google first to verify team authorization.
                </>
              ) : (
                'Sign in with your Google account to access your arena workspace.'
              )}
            </div>
          </div>
        )}

        {/* Main Authentication & Room Entry Card */}
        <div className="w-full max-w-md p-5 sm:p-7 bg-app-surface border border-app-border rounded-2xl shadow-xl text-left space-y-5">
          
          {/* Error Message Box */}
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* STEP 1: USER NOT LOGGED IN -> GOOGLE SIGN-IN */}
          {!currentUser ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-app-text">
                    Contestant Sign-In
                  </h2>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-app-surface-raised text-app-subtext border border-app-border">
                    Step 1 of 2
                  </span>
                </div>
                <p className="text-xs text-app-subtext leading-relaxed">
                  Authenticate your registered identity before entering the competition room.
                </p>
              </div>

              {/* Clean Google Sign-In Button */}
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={googleLoading}
                className="w-full py-3 px-4 rounded-xl bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs sm:text-sm transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center space-x-3 shadow-xs min-h-[44px]"
              >
                {googleLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 text-zinc-900 animate-spin" />
                    <span>Connecting account...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
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
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>

              {/* Alternative Divider */}
              <div className="relative my-2.5 flex items-center justify-center">
                <div className="border-t border-app-border w-full"></div>
                <span className="bg-app-surface px-2.5 text-[10px] uppercase font-mono tracking-wider text-app-subtext shrink-0">
                  or sign in with registered email
                </span>
              </div>

              {/* Direct Registered Email Input Form */}
              <form onSubmit={handleEmailSignIn} className="space-y-2">
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => {
                      setEmailInput(e.target.value);
                      setError(null);
                    }}
                    placeholder="e.g. contestant@team.org"
                    disabled={emailLoading || googleLoading}
                    className="w-full pl-9 pr-3 py-2 text-xs text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 font-mono transition-colors min-h-[42px] placeholder:text-app-subtext/40 placeholder:font-sans"
                  />
                </div>
                <button
                  type="submit"
                  disabled={emailLoading || googleLoading || !emailInput.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-app-surface-raised hover:bg-app-hover border border-app-border text-app-text font-semibold text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-1.5 min-h-[40px]"
                >
                  {emailLoading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                      <span>Verifying email...</span>
                    </>
                  ) : (
                    <>
                      <span>Continue with Email</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </>
                  )}
                </button>
              </form>

              <div className="p-2.5 rounded-lg bg-app-surface-raised border border-app-border text-[11px] text-app-subtext flex items-center space-x-2">
                <ShieldCheck className="w-3.5 h-3.5 text-app-subtext shrink-0" />
                <span>Single-account session enforcement active.</span>
              </div>
            </div>
          ) : (
            /* STEP 2: USER IS LOGGED IN -> ENTER TEAM CODE */
            <div className="space-y-4">
              {/* Logged-In User Profile Strip */}
              <div className="p-3 rounded-xl bg-app-surface-raised border border-app-border flex items-center justify-between gap-3">
                <div className="flex items-center space-x-2.5 min-w-0">
                  {currentUser.photoURL ? (
                    <img
                      src={currentUser.photoURL}
                      alt={currentUser.name}
                      className="w-8 h-8 rounded-lg border border-app-border object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-app-muted text-app-text flex items-center justify-center font-bold text-xs shrink-0">
                      <UserCheck className="w-4 h-4" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="font-bold text-xs text-app-text truncate">
                        {currentUser.name}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Verified
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-app-subtext truncate mt-0.5">
                      {currentUser.email}
                    </div>
                    {currentUser.teamName && (
                      <div className="mt-1">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-app-muted text-app-text border border-app-border font-semibold">
                          Team: {currentUser.teamName}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <button
                  onClick={handleSignOut}
                  className="px-2.5 py-1.5 rounded-lg border border-app-border bg-app-surface hover:bg-app-hover text-app-subtext hover:text-app-text text-xs font-medium transition-colors cursor-pointer flex items-center space-x-1 shrink-0 min-h-[36px]"
                  title="Sign out or switch account"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Switch</span>
                </button>
              </div>

              {/* Step 2 Form */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-app-text uppercase tracking-wider">
                    Enter Team Access Code
                  </h3>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-app-surface-raised text-app-subtext border border-app-border">
                    Step 2 of 2
                  </span>
                </div>
                <p className="text-[11px] text-app-subtext leading-relaxed">
                  Enter your team token. The arena checks that this token is authorized for your account.
                </p>
              </div>

              {/* Quick Autofill if Account already has an assigned token */}
              {currentUser.assignedToken && currentUser.assignedToken !== tokenInput && (
                <div className="p-2.5 rounded-xl bg-app-surface-raised border border-app-border flex items-center justify-between text-xs gap-2">
                  <div className="min-w-0">
                    <div className="text-[10px] font-mono uppercase text-app-subtext">Assigned Token:</div>
                    <div className="font-mono font-bold text-app-text text-xs tracking-wider">{currentUser.assignedToken}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setTokenInput(currentUser.assignedToken!);
                      setError(null);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-app-text text-app-bg text-[11px] font-semibold cursor-pointer hover:opacity-90 transition-opacity"
                  >
                    Autofill
                  </button>
                </div>
              )}

              {/* Team Code & Gemini API Key Input Form */}
              <form onSubmit={handleTeamCodeSubmit} className="space-y-4">
                {/* 1. Team Access Code */}
                <div className="space-y-1.5">
                  <label htmlFor="team-code-input" className="block text-[11px] font-mono font-semibold text-app-subtext uppercase tracking-wider">
                    Team Access Token
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 text-app-subtext pointer-events-none">
                      <KeyRound className="w-4 h-4" />
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
                      className="w-full pl-9 pr-8 py-2.5 text-xs sm:text-sm text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-zinc-400 font-mono tracking-widest uppercase transition-colors placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-app-subtext/40 min-h-[44px]"
                    />

                    {tokenInput && (
                      <button
                        type="button"
                        onClick={() => setTokenInput('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-subtext hover:text-app-text p-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* 2. Free Google Gemini API Key */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="gemini-api-key-input" className="text-[11px] font-mono font-semibold text-app-subtext uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Google Gemini API Key</span>
                    </label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-indigo-400 hover:text-indigo-300 hover:underline flex items-center gap-1 cursor-pointer"
                      title="Open Google AI Studio to get your free key"
                    >
                      <span>Get Free Key</span>
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>

                  <div className="relative">
                    <input
                      id="gemini-api-key-input"
                      name="geminiApiKey"
                      type={showApiKey ? 'text' : 'password'}
                      value={geminiApiKey}
                      onChange={(e) => {
                        setGeminiApiKey(e.target.value);
                        setError(null);
                      }}
                      placeholder="AIzaSy..."
                      disabled={tokenLoading}
                      className="w-full pl-3 pr-10 py-2.5 text-xs sm:text-sm text-app-text bg-app-bg border border-app-border rounded-xl focus:outline-none focus:border-indigo-400 font-mono transition-colors placeholder:text-app-subtext/40 min-h-[44px]"
                    />

                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-app-subtext hover:text-app-text p-1 cursor-pointer"
                      title={showApiKey ? 'Hide API Key' : 'Show API Key'}
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-app-subtext leading-relaxed">
                    Obtain a free key from Google AI Studio. Required for the in-arena AI Tutor to assist your team.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={tokenLoading || !tokenInput.trim() || !geminiApiKey.trim()}
                  className="w-full py-2.5 px-4 rounded-xl bg-app-text text-app-bg hover:opacity-90 font-semibold text-xs sm:text-sm transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center space-x-2 min-h-[44px] mt-2"
                >
                  {tokenLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin mr-1" />
                      <span>Verifying Credentials...</span>
                    </>
                  ) : (
                    <>
                      <span>Enter Arena Workspace</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>
          )}

          {/* Security & System Guarantees Footer */}
          <div className="pt-3 border-t border-app-border flex items-center justify-between text-[11px] text-app-subtext">
            <div className="flex items-center space-x-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Token Bound</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5" />
              <span>RAM Decryption</span>
            </div>
          </div>
        </div>

        {/* Feature Badges */}
        <div className="grid grid-cols-3 gap-2.5 mt-5 w-full max-w-md text-left">
          <div className="p-3 rounded-xl bg-app-surface border border-app-border">
            <Terminal className="w-4 h-4 text-app-subtext mb-1" />
            <div className="text-[11px] font-bold text-app-text">Multi-Stage</div>
            <div className="text-[10px] text-app-subtext">Evidence Files</div>
          </div>

          <div className="p-3 rounded-xl bg-app-surface border border-app-border">
            <Zap className="w-4 h-4 text-app-subtext mb-1" />
            <div className="text-[11px] font-bold text-app-text">In-Memory</div>
            <div className="text-[10px] text-app-subtext">Zero-Disk Sandboxing</div>
          </div>

          <div className="p-3 rounded-xl bg-app-surface border border-app-border">
            <Trophy className="w-4 h-4 text-app-subtext mb-1" />
            <div className="text-[11px] font-bold text-app-text">Live Sync</div>
            <div className="text-[10px] text-app-subtext">Realtime Standings</div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="py-3 border-t border-app-border bg-app-surface text-center text-xs text-app-subtext">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 px-4">
          <span className="font-semibold text-app-text">Pixel & Anomaly CTF</span>
          <span className="hidden sm:inline">&bull;</span>
          <span>AI Club 2026</span>
          <span className="hidden sm:inline">&bull;</span>
          <a
            href="/admin"
            className="text-app-subtext hover:text-app-text transition-colors underline"
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
        <div className="min-h-screen bg-app-bg text-app-text flex items-center justify-center font-sans text-xs">
          <Loader2 className="w-5 h-5 animate-spin mr-2 text-app-text" />
          <span>Loading Pixel & Anomaly...</span>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
