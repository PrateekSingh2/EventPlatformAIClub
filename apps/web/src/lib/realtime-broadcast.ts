import { supabase } from './supabase';

/**
 * Sends a Supabase Realtime broadcast on a named channel (must match client subscribers).
 * Subscribes briefly so delivery works from serverless API routes.
 */
export async function sendSupabaseBroadcast(
  channelName: string,
  event: string,
  payload: unknown
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || url.includes('placeholder') || url.includes('your-project-id')) {
    return;
  }

  const channel = supabase.channel(channelName);

  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        channel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            channel
              .send({ type: 'broadcast', event, payload })
              .then(() => resolve())
              .catch(reject);
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            reject(new Error(`Realtime channel ${status}`));
          }
        });
      }),
      new Promise<void>((_, reject) =>
        setTimeout(() => reject(new Error('Realtime broadcast timeout')), 3500)
      ),
    ]);
  } finally {
    try {
      await supabase.removeChannel(channel);
    } catch {
      // Ignore teardown errors
    }
  }
}
