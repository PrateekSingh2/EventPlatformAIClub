'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { ContestSettings } from '@/lib/types';

type StateListener = (state: ContestSettings) => void;
type RefreshListener = () => void;

// Module-level listener registry to share a single Realtime subscription across all components
const stateListeners = new Set<StateListener>();
const refreshListeners = new Set<RefreshListener>();
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHookCount = 0;

function subscribeSharedChannel() {
  if (sharedChannel || !isSupabaseConfigured) return;

  sharedChannel = supabase
    .channel('contest-lifecycle')
    .on('broadcast', { event: 'state-change' }, (payload: any) => {
      if (payload?.payload) {
        stateListeners.forEach((listener) => {
          try {
            listener(payload.payload as ContestSettings);
          } catch {
            // Ignore subscriber error
          }
        });
      }
    })
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'contest_settings' },
      () => {
        refreshListeners.forEach((listener) => {
          try {
            listener();
          } catch {
            // Ignore subscriber error
          }
        });
      }
    );

  sharedChannel.subscribe();
}

function unsubscribeSharedChannel() {
  if (activeHookCount <= 0 && sharedChannel) {
    try {
      supabase.removeChannel(sharedChannel);
    } catch {
      // Ignore
    }
    sharedChannel = null;
  }
}

export function useContestLifecycle() {
  const [contestState, setContestState] = useState<ContestSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/contest', {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      const data = await res.json();
      if (res.ok && data.contest && mountedRef.current) {
        setContestState(data.contest);
        setError(null);
      }
    } catch (err: any) {
      if (mountedRef.current) {
        setError(err.message || 'Failed to fetch contest state');
      }
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchState();

    const onStateUpdate: StateListener = (newState) => {
      if (mountedRef.current) {
        setContestState(newState);
      }
    };

    const onRefreshNeeded: RefreshListener = () => {
      fetchState();
    };

    stateListeners.add(onStateUpdate);
    refreshListeners.add(onRefreshNeeded);
    activeHookCount++;

    subscribeSharedChannel();

    // Continuous background ping every 2 seconds for immediate tournament lifecycle shifts
    const interval = setInterval(() => {
      fetchState();
    }, 2000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      stateListeners.delete(onStateUpdate);
      refreshListeners.delete(onRefreshNeeded);
      activeHookCount--;
      unsubscribeSharedChannel();
    };
  }, [fetchState]);

  return {
    contestState,
    loading,
    error,
    refresh: fetchState,
    status: contestState?.status || 'DRAFT',
    isDraft: contestState?.status === 'DRAFT',
    isLive: contestState?.status === 'LIVE',
    isFrozen: contestState?.status === 'FROZEN',
    isConcluded: contestState?.status === 'CONCLUDED',
  };
}
