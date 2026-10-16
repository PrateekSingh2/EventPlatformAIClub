'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function TokenRedirectHandler() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    // Read any token parameter variant (tokenid, token, id, t)
    const tokenId =
      searchParams.get('tokenid') ||
      searchParams.get('token') ||
      searchParams.get('id') ||
      searchParams.get('t') ||
      '';

    const cleanToken = tokenId.trim().toUpperCase();

    // Check if user is already authenticated in this session
    const isSessionActive = sessionStorage.getItem('contestant_session_active') === 'true';
    const activeStoredToken = localStorage.getItem('participant_token');

    if (isSessionActive && activeStoredToken && (!cleanToken || cleanToken === activeStoredToken)) {
      // User is already logged in, redirect straight to the Arena dashboard
      router.replace(`/arena?token=${encodeURIComponent(activeStoredToken)}`);
    } else {
      // User must log in first. Redirect to login landing page, preserving the token and intent
      const redirectUrl = cleanToken
        ? `/?token=${encodeURIComponent(cleanToken)}&loginRequired=true&redirect=/arena`
        : '/?loginRequired=true&redirect=/arena';
      router.replace(redirectUrl);
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-app-bg text-app-text flex flex-col items-center justify-center p-4 font-mono text-xs gap-3">
      <Loader2 className="w-6 h-6 animate-spin text-app-accent" />
      <span>Verifying contest access token...</span>
    </div>
  );
}

export default function TokenPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-app-bg text-app-text flex flex-col items-center justify-center p-4 font-mono text-xs gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-app-accent" />
          <span>Loading...</span>
        </div>
      }
    >
      <TokenRedirectHandler />
    </Suspense>
  );
}
