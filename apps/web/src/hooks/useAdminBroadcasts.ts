'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Announcement } from '@/lib/types';

type BroadcastListener = (ann: Announcement) => void;
const broadcastListeners = new Set<BroadcastListener>();
let sharedBroadcastChannel: ReturnType<typeof supabase.channel> | null = null;
let activeBroadcastCount = 0;

function subscribeSharedBroadcastChannel() {
  if (sharedBroadcastChannel) return;

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
  const mountedRef = useRef(true);
  const activeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const triggerAnnouncement = useCallback((ann: Announcement) => {
    if (!mountedRef.current) return;
    setActiveAnnouncement(ann);
    setHistory((prev) => [ann, ...prev.filter((a) => a.id !== ann.id)].slice(0, 20));

    if (activeTimerRef.current) {
      clearTimeout(activeTimerRef.current);
    }

    // Keep announcement visible for at least 25 seconds before fading out,
    // ensuring participants have ample time to read without a close button.
    activeTimerRef.current = setTimeout(() => {
      if (mountedRef.current) {
        setActiveAnnouncement(null);
      }
    }, 25000);
  }, []);

  const fetchRecent = useCallback(async () => {
    try {
      const res = await fetch('/api/announcements', {
        headers: { 'Cache-Control': 'no-store' },
      });
      const data = await res.json();
      if (res.ok && data.announcements && mountedRef.current) {
        setHistory(data.announcements);
        // If there's an announcement from the last 2 minutes, display it on initial load
        if (data.announcements.length > 0) {
          const latest = data.announcements[0];
          const ageMs = Date.now() - new Date(latest.created_at).getTime();
          if (ageMs < 120000 && !activeAnnouncement) {
            triggerAnnouncement(latest);
          }
        }
      }
    } catch {
      // Ignore
    }
  }, [activeAnnouncement, triggerAnnouncement]);

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

    return () => {
      mountedRef.current = false;
      if (activeTimerRef.current) {
        clearTimeout(activeTimerRef.current);
      }
      broadcastListeners.delete(onBroadcast);
      activeBroadcastCount--;
      unsubscribeSharedBroadcastChannel();
    };
  }, [fetchRecent, triggerAnnouncement]);

  return {
    activeAnnouncement,
    announcementsHistory: history,
  };
}
