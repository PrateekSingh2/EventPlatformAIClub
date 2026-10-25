'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { readClientCache, writeClientCache } from '@/lib/client-cache';
import { Announcement } from '@/lib/types';

const ANNOUNCEMENTS_CACHE_KEY = 'arena_announcements';
const ANNOUNCEMENTS_CACHE_TTL_MS = 30_000;

type BroadcastListener = (ann: Announcement) => void;
const broadcastListeners = new Set<BroadcastListener>();
let sharedBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;
let activeBroadcastCount = 0;

function subscribeSharedBroadcastChannel() {
  if (sharedBroadcastChannel || !isSupabaseConfigured) return;

  sharedBroadcastChannel = supabase
    .channel('admin-broadcasts')
    .on('broadcast', { event: 'announcement' }, (payload: any) => {
      if (payload?.payload) {
        broadcastListeners.forEach((listener) => {
          try {
            listener(payload.payload as Announcement);
          } catch {
            // Ignore subscriber error
          }
        });
      }
    })
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'announcements' },
      (payload: any) => {
        if (payload?.new) {
          broadcastListeners.forEach((listener) => {
            try {
              listener(payload.new as Announcement);
            } catch {
              // Ignore subscriber error
            }
          });
        }
      }
    );

  sharedBroadcastChannel.subscribe();
}

function unsubscribeSharedBroadcastChannel() {
  if (activeBroadcastCount <= 0 && sharedBroadcastChannel) {
    try {
      supabase.removeChannel(sharedBroadcastChannel);
    } catch {
      // Ignore
    }
    sharedBroadcastChannel = null;
  }
}

export function useAdminBroadcasts() {
  const [activeAnnouncement, setActiveAnnouncement] = useState<Announcement | null>(null);
  const [history, setHistory] = useState<Announcement[]>([]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = sessionStorage.getItem('acknowledged_broadcast_ids');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const mountedRef = useRef(true);
  const acknowledgedIdsRef = useRef(acknowledgedIds);
  acknowledgedIdsRef.current = acknowledgedIds;

  const acknowledgeAnnouncement = useCallback((id?: string) => {
    const targetId = id || activeAnnouncement?.id;
    if (!targetId) {
      setActiveAnnouncement(null);
      return;
    }

    setAcknowledgedIds((prev) => {
      const next = new Set(prev);
      next.add(targetId);
      try {
        sessionStorage.setItem('acknowledged_broadcast_ids', JSON.stringify(Array.from(next)));
      } catch {}
      return next;
    });

    setActiveAnnouncement((current) => (current?.id === targetId ? null : current));
  }, [activeAnnouncement?.id]);

  const triggerAnnouncement = useCallback((ann: Announcement) => {
    if (!mountedRef.current) return;

    // Append to full persistent history
    setHistory((prev) => {
      const exists = prev.some((a) => a.id === ann.id);
      if (exists) {
        return prev.map((a) => (a.id === ann.id ? ann : a));
      }
      return [ann, ...prev].slice(0, 50);
    });

    // Only popup in middle of screen if participant hasn't acknowledged it yet
    if (!acknowledgedIdsRef.current.has(ann.id)) {
      setActiveAnnouncement(ann);
    }
  }, []);

  const fetchRecent = useCallback(async (preferNetwork = true) => {
    const cached = readClientCache<{ announcements: Announcement[] }>(
      ANNOUNCEMENTS_CACHE_KEY,
      ANNOUNCEMENTS_CACHE_TTL_MS
    );
    if (cached?.announcements?.length && mountedRef.current) {
      setHistory((prev) => {
        const map = new Map<string, Announcement>();
        cached.announcements.forEach((item) => map.set(item.id, item));
        prev.forEach((item) => map.set(item.id, item));
        return Array.from(map.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });
      if (!preferNetwork) return;
    }

    try {
      const res = await fetch('/api/announcements', { cache: 'default' });
      const data = await res.json();
      if (res.ok && data.announcements && mountedRef.current) {
        const list: Announcement[] = data.announcements;
        writeClientCache(ANNOUNCEMENTS_CACHE_KEY, { announcements: list });
        setHistory((prev) => {
          // Merge while preserving unique items
          const map = new Map<string, Announcement>();
          list.forEach((item) => map.set(item.id, item));
          prev.forEach((item) => map.set(item.id, item));
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });

        // If the newest announcement hasn't been acknowledged and is recent (within 5 minutes), pop it up
        if (list.length > 0) {
          const latest = list[0];
          const ageMs = Date.now() - new Date(latest.created_at).getTime();
          if (ageMs < 300000 && !acknowledgedIdsRef.current.has(latest.id)) {
            setActiveAnnouncement((curr) => curr || latest);
          }
        }
      }
    } catch {
      // Ignore network errors
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchRecent();

    const onBroadcast: BroadcastListener = (ann) => {
      if (mountedRef.current) {
        triggerAnnouncement(ann);
      }
    };

    broadcastListeners.add(onBroadcast);
    activeBroadcastCount++;

    subscribeSharedBroadcastChannel();

    // Fallback poll when realtime is offline (primary path is Supabase broadcast)
    const interval = setInterval(() => {
      fetchRecent(true);
    }, 25_000);

    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      broadcastListeners.delete(onBroadcast);
      activeBroadcastCount--;
      unsubscribeSharedBroadcastChannel();
    };
  }, [fetchRecent, triggerAnnouncement]);

  return {
    activeAnnouncement,
    announcementsHistory: history,
    acknowledgeAnnouncement,
    unreadCount: history.filter((a) => !acknowledgedIds.has(a.id)).length,
  };
}
