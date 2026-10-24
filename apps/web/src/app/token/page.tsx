'use client';

import React, { useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { getContestantSession } from '@/lib/session';

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
    const session = getContestantSession();

    // If user is not logged in, direct to login page first, preserving the token
    if (!session || !session.email) {
      const redirectUrl = cleanToken
        ? `/?token=${encodeURIComponent(cleanToken)}&loginRequired=true&redirect=/arena`
        : '/?loginRequired=true&redirect=/arena';
      router.replace(redirectUrl);
    } else {
      // User is logged in, redirect straight to arena with token (arena will cross-check account ownership)
      const targetToken = cleanToken || session.assignedToken || '';
      if (targetToken) {
        router.replace(`/arena?token=${encodeURIComponent(targetToken)}`);
      } else {
        router.replace('/?redirect=/arena');
      }
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
