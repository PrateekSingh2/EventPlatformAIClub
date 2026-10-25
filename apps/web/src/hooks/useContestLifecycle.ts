'use client';

import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { readClientCache, writeClientCache } from '@/lib/client-cache';
import { ContestSettings } from '@/lib/types';

const CONTEST_CACHE_KEY = 'contest_lifecycle';
const CONTEST_CACHE_TTL_MS = 20_000;

type StateListener = (state: ContestSettings) => void;
type RefreshListener = () => void;

type LifecycleSnapshot = {
  contestState: ContestSettings | null;
  loading: boolean;
  error: string | null;
};

// Module-level listener registry to share a single Realtime subscription across all components
const stateListeners = new Set<StateListener>();
const refreshListeners = new Set<RefreshListener>();
let sharedChannel: ReturnType<typeof supabase.channel> | null = null;
let activeHookCount = 0;

let lifecycleSnapshot: LifecycleSnapshot = {
  contestState: null,
  loading: true,
  error: null,
};
const snapshotListeners = new Set<() => void>();
let fetchInFlight: Promise<void> | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

function emitSnapshot() {
  snapshotListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Ignore subscriber error
    }
  });
}

function applyContestState(next: ContestSettings) {
  writeClientCache(CONTEST_CACHE_KEY, { contest: next });
  lifecycleSnapshot = {
    contestState: next,
    loading: false,
    error: null,
  };
  emitSnapshot();
}

async function fetchContestStateShared(): Promise<void> {
  if (fetchInFlight) {
    return fetchInFlight;
  }

  fetchInFlight = (async () => {
    try {
      const cached = readClientCache<{ contest: ContestSettings }>(CONTEST_CACHE_KEY, CONTEST_CACHE_TTL_MS);
      if (cached?.contest && lifecycleSnapshot.loading) {
        applyContestState(cached.contest);
      }

      const res = await fetch('/api/contest', { cache: 'default' });

      let data: { success?: boolean; contest?: ContestSettings; error?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (res.ok && data.success && data.contest) {
        writeClientCache(CONTEST_CACHE_KEY, { contest: data.contest });
        applyContestState(data.contest);
        return;
      }

      lifecycleSnapshot = {
        ...lifecycleSnapshot,
        loading: false,
        error:
          data.error ||
          (res.ok ? 'Contest state unavailable' : `Failed to load contest state (HTTP ${res.status})`),
      };
      emitSnapshot();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to fetch contest state';
      lifecycleSnapshot = {
        ...lifecycleSnapshot,
        loading: false,
        error: message,
      };
      emitSnapshot();
    } finally {
      fetchInFlight = null;
    }
  })();

  return fetchInFlight;
}

function startSharedPolling() {
  if (pollInterval) return;
  pollInterval = setInterval(() => {
    fetchContestStateShared();
  }, 15_000);
}

function stopSharedPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

function subscribeSharedChannel() {
  if (sharedChannel || !isSupabaseConfigured) return;

  sharedChannel = supabase
    .channel('contest-lifecycle')
    .on('broadcast', { event: 'state-change' }, (payload: any) => {
      if (payload?.payload) {
        applyContestState(payload.payload);
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
        fetchContestStateShared();
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

function subscribeSnapshot(onStoreChange: () => void) {
  snapshotListeners.add(onStoreChange);
  return () => {
    snapshotListeners.delete(onStoreChange);
  };
}

function getSnapshot(): LifecycleSnapshot {
  return lifecycleSnapshot;
}

export function useContestLifecycle() {
  const snapshot = useSyncExternalStore(subscribeSnapshot, getSnapshot, getSnapshot);
  const mountedRef = useRef(true);

  const fetchState = useCallback(async () => {
    await fetchContestStateShared();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (lifecycleSnapshot.loading && !fetchInFlight) {
      fetchContestStateShared();
    }

    const onRefreshNeeded: RefreshListener = () => {
      fetchContestStateShared();
    };

    refreshListeners.add(onRefreshNeeded);
    activeHookCount++;

    subscribeSharedChannel();
    startSharedPolling();

    return () => {
      mountedRef.current = false;
      refreshListeners.delete(onRefreshNeeded);
      activeHookCount--;
      unsubscribeSharedChannel();
      if (activeHookCount <= 0) {
        stopSharedPolling();
      }
    };
  }, []);

  const contestState = snapshot.contestState;

  return {
    contestState,
    loading: snapshot.loading,
    error: snapshot.error,
    refresh: fetchState,
    status: contestState?.status || 'DRAFT',
    isDraft: contestState?.status === 'DRAFT',
    isLive: contestState?.status === 'LIVE',
    isFrozen: contestState?.status === 'FROZEN',
    isConcluded: contestState?.status === 'CONCLUDED',
  };
}
