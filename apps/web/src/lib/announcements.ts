import { getSupabaseAdmin } from './supabase';
import { sendSupabaseBroadcast } from './realtime-broadcast';
import { Announcement, AnnouncementUrgency } from './types';
import fs from 'fs';
import os from 'os';
import path from 'path';

declare global {
  // eslint-disable-next-line no-var
  var __announcementsHistory: Announcement[] | undefined;
}

function getCacheFilePath(): string | null {
  const baseDir =
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME
      ? os.tmpdir()
      : path.join(process.cwd(), '.next');
  try {
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }
    return path.join(baseDir, 'announcements-cache.json');
  } catch {
    return null;
  }
}

function readCache(): Announcement[] {
  if (globalThis.__announcementsHistory) {
    return globalThis.__announcementsHistory;
  }
  try {
    const filePath = getCacheFilePath();
    if (filePath && fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data) as Announcement[];
      globalThis.__announcementsHistory = parsed;
      return parsed;
    }
  } catch {
    // Ignore
  }
  return [];
}

function writeCache(list: Announcement[]): void {
  globalThis.__announcementsHistory = list;
  try {
    const filePath = getCacheFilePath();
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(list, null, 2), 'utf-8');
    }
  } catch {
    // Ignore read-only filesystem on serverless
  }
}

export async function getRecentAnnouncements(limit: number = 10): Promise<Announcement[]> {
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (!error && Array.isArray(data)) {
      const formatted: Announcement[] = data.map((row: any) => ({
        id: row.id,
        message: row.message,
        urgency: row.urgency || 'info',
        created_by: row.created_by || 'admin',
        created_at: row.created_at,
      }));
      if (formatted.length > 0) {
        writeCache(formatted);
      }
      return formatted;
    }
  } catch {
    // Supabase offline, fall back to cache
  }

  return readCache().slice(0, limit);
}

export async function createAnnouncement(
  message: string,
  urgency: AnnouncementUrgency = 'info',
  createdBy: string = 'admin'
): Promise<Announcement> {
  const cleanMessage = message.trim();
  if (!cleanMessage) {
    throw new Error('Announcement message cannot be empty.');
  }
  if (cleanMessage.length > 500) {
    throw new Error('Announcement message exceeds maximum limit of 500 characters.');
  }

  const newRecord: Announcement = {
    id: `ann-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    message: cleanMessage,
    urgency,
    created_by: createdBy,
    created_at: new Date().toISOString(),
  };

  // 1. Try to insert into Supabase
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('announcements')
      .insert({
        message: newRecord.message,
        urgency: newRecord.urgency,
        created_by: newRecord.created_by,
      })
      .select()
      .single();

    if (!error && data) {
      newRecord.id = data.id;
      newRecord.created_at = data.created_at;
    }
  } catch (err: any) {
    console.warn('[createAnnouncement] Supabase insert warning:', err.message);
  }

  // 2. Update local cache
  const history = [newRecord, ...readCache().filter((a) => a.id !== newRecord.id)].slice(0, 50);
  writeCache(history);

  // 3. Broadcast to all connected clients via Supabase Realtime channel
  try {
    await sendSupabaseBroadcast('admin-broadcasts', 'announcement', newRecord);
  } catch {
    // Realtime is best-effort; INSERT replication + polling still reach clients
  }

  return newRecord;
}
