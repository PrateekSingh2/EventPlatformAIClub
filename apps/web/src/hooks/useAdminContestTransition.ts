'use client';

import { useCallback, useState } from 'react';
import { ContestStatus } from '@/lib/types';

export function useAdminContestTransition(adminSecret: string, refresh: () => Promise<void>) {
  const [transitioning, setTransitioning] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const transitionTo = useCallback(
    async (targetStatus: ContestStatus) => {
      if (!adminSecret.trim()) {
        setActionError('Admin session expired. Sign in again to change tournament status.');
        return false;
      }

      setTransitioning(true);
      setActionError(null);

      try {
        const res = await fetch('/api/contest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: targetStatus,
            adminSecret: adminSecret.trim(),
          }),
        });

        let data: { success?: boolean; error?: string } = {};
        try {
          data = await res.json();
        } catch {
          throw new Error('Invalid response from server');
        }

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Failed to update contest status');
        }

        await refresh();
        return true;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Transition failed';
        setActionError(message);
        return false;
      } finally {
        setTransitioning(false);
      }
    },
    [adminSecret, refresh]
  );

  return { transitioning, actionError, setActionError, transitionTo };
}
