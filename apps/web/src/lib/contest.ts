import { getSupabaseAdmin, supabase } from './supabase';
import { ContestSettings, ContestStatus } from './types';
import fs from 'fs';
import path from 'path';

// Allowed state transitions for standard tournament operations
export const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  DRAFT: ['LIVE'],
  LIVE: ['FROZEN', 'CONCLUDED'],
  FROZEN: ['LIVE', 'CONCLUDED'],
  CONCLUDED: ['DRAFT'], // Allow admin reset if explicitly requested
};

export function isTransitionAllowed(current: ContestStatus, next: ContestStatus): boolean {
  if (current === next) return true;
  return ALLOWED_TRANSITIONS[current]?.includes(next) ?? false;
}

const DEFAULT_SETTINGS: ContestSettings = {
  id: 'default',
  status: 'DRAFT',
  title: 'AI Club Hackathon & Capture The Flag',
  start_time: null,
  end_time: null,
  freeze_time: null,
  updated_by: 'system',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// Global in-memory cache shared across route executions
declare global {
  // eslint-disable-next-line no-var
  var __contestSettings: ContestSettings | undefined;
}

function getCacheFilePath(): string {
  const tmpDir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(tmpDir)) {
    try {
      fs.mkdirSync(tmpDir, { recursive: true });
    } catch {
      // Ignore
    }
  }
  return path.join(tmpDir, 'contest-settings.json');
}

function readLocalCache(): ContestSettings | null {
  if (globalThis.__contestSettings) {
    return globalThis.__contestSettings;
  }
  try {
    const filePath = getCacheFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(data) as ContestSettings;
      globalThis.__contestSettings = parsed;
      return parsed;
    }
  } catch {
    // Ignore cache read errors
  }
  return null;
}

function writeLocalCache(settings: ContestSettings): void {
  globalThis.__contestSettings = settings;
  try {
    const filePath = getCacheFilePath();
    fs.writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8');
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch the current authoritative contest settings.
 * Checks Supabase contest_settings table, falling back to local persistent cache if offline.
 */
export async function getContestSettings(): Promise<ContestSettings> {
  const cached = readLocalCache();

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('contest_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (!error && data) {
      const state: ContestSettings = {
        id: data.id || 'default',
        status: (data.status as ContestStatus) || 'DRAFT',
        title: data.title || 'AI Club Contest',
        start_time: data.start_time || null,
        end_time: data.end_time || null,
        freeze_time: data.freeze_time || null,
        updated_by: data.updated_by || 'admin',
        created_at: data.created_at || new Date().toISOString(),
        updated_at: data.updated_at || new Date().toISOString(),
      };
      writeLocalCache(state);
      return state;
    }
  } catch {
    // Supabase unavailable or table not yet migrated, fall back to cache
  }

  if (cached) {
    return cached;
  }

  const initial = { ...DEFAULT_SETTINGS };
  writeLocalCache(initial);
  return initial;
}

/**
 * Updates contest settings with state-transition validation.
 * Persists to Supabase and broadcasts change via Supabase Realtime.
 */
export async function updateContestSettings(
  newStatus: ContestStatus,
  options?: {
    adminIdentifier?: string;
    title?: string;
    startTime?: string | null;
    endTime?: string | null;
    freezeTime?: string | null;
    force?: boolean;
  }
): Promise<ContestSettings> {
  const current = await getContestSettings();

  // Validate state transition
  if (!options?.force && !isTransitionAllowed(current.status, newStatus)) {
    throw new Error(
      `Invalid contest lifecycle transition: Cannot transition from ${current.status} to ${newStatus}.`
    );
  }

  const updated: ContestSettings = {
    ...current,
    status: newStatus,
    title: options?.title !== undefined ? options.title : current.title,
    start_time: options?.startTime !== undefined ? options.startTime : current.start_time,
    end_time: options?.endTime !== undefined ? options.endTime : current.end_time,
    freeze_time:
      newStatus === 'FROZEN'
        ? new Date().toISOString()
        : newStatus === 'LIVE' && current.status === 'FROZEN'
        ? null
        : options?.freezeTime !== undefined
        ? options.freezeTime
        : current.freeze_time,
    updated_by: options?.adminIdentifier || 'admin',
    updated_at: new Date().toISOString(),
  };

  // 1. Try to persist to Supabase
  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from('contest_settings')
      .upsert({
        id: 'default',
        status: updated.status,
        title: updated.title,
        start_time: updated.start_time,
        end_time: updated.end_time,
        freeze_time: updated.freeze_time,
        updated_by: updated.updated_by,
        updated_at: updated.updated_at,
      });

    if (error) {
      console.warn('[updateContestSettings] Supabase upsert error, falling back to local cache:', error.message);
    }
  } catch (err: any) {
    console.warn('[updateContestSettings] Supabase unavailable, cached locally:', err.message);
  }

  // 2. Persist to local cache
  writeLocalCache(updated);

  // 3. Broadcast update to connected clients via Supabase Realtime channel
  try {
    const isSupabaseConfigured =
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !process.env.NEXT_PUBLIC_SUPABASE_URL.includes('your-project-id');
    if (isSupabaseConfigured) {
      const channel = supabase.channel('contest-lifecycle');
      Promise.race([
        channel.send({
          type: 'broadcast',
          event: 'state-change',
          payload: updated,
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Realtime timeout')), 1000)),
      ]).catch(() => {});
    }
  } catch {
    // Ignore realtime broadcast delivery warnings if offline
  }

  return updated;
}
