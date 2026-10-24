import { getSupabaseAdmin, isSupabaseConfigured, supabase } from './supabase';
import { ContestSettings, ContestStatus, Contest, Stage } from './types';
import { generateContestTokenBatch } from './tokens';
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

function getContestStorageDir(): string {
  const dir = path.join(process.cwd(), '.contest-cache');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // Ignore
    }
  }
  return dir;
}

function getCacheFilePath(): string {
  const storageDir = getContestStorageDir();
  const filePath = path.join(storageDir, 'contest-settings.json');
  // Backwards compatibility check
  if (!fs.existsSync(filePath)) {
    const legacyPath = path.join(process.cwd(), '.next', 'contest-settings.json');
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, filePath);
      } catch {}
    }
  }
  return filePath;
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

  if (isSupabaseConfigured) {
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
  if (isSupabaseConfigured) {
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

// ==============================================================================
// MULTI-CONTEST PERSISTENCE & MANAGEMENT
// ==============================================================================

function getContestsRegistryPath(): string {
  const storageDir = getContestStorageDir();
  const filePath = path.join(storageDir, 'contests-registry.json');
  // Backwards compatibility check
  if (!fs.existsSync(filePath)) {
    const legacyPath = path.join(process.cwd(), '.next', 'contests-registry.json');
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, filePath);
      } catch {}
    }
  }
  return filePath;
}

function readContestsRegistry(): Contest[] {
  try {
    const filePath = getContestsRegistryPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      const list = JSON.parse(data);
      if (Array.isArray(list)) {
        return list;
      }
    }
  } catch {
    // Ignore read errors
  }
  return [];
}

function writeContestsRegistry(contests: Contest[]): void {
  try {
    const filePath = getContestsRegistryPath();
    fs.writeFileSync(filePath, JSON.stringify(contests, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

/**
 * Returns all contests stored in the system.
 */
export async function listAllContests(): Promise<Contest[]> {
  const localList = readContestsRegistry();

  try {
    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from('contests')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data) && data.length > 0) {
      return data as Contest[];
    }
  } catch {
    // Supabase unavailable or table not created, fall back to local store
  }

  // If local list is empty, initialize with default contest
  if (localList.length === 0) {
    const initialContest: Contest = {
      id: 'default-contest-2026',
      title: 'Pixel and Anomaly CTF 2026',
      status: 'DRAFT',
      teams_count: 50,
      tokens: [
        'AX-DEMO-2026',
        'TG-CYBR-1049',
        'KP-NODE-8291',
        'BC-HACK-4920',
        'ZX-PIXL-7731',
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    writeContestsRegistry([initialContest]);
    return [initialContest];
  }

  return localList;
}

/**
 * Creates a brand new contest, generates unique tokens for all teams in AX-DEMO-2026 format,
 * and saves the contest and stages.
 */
export async function createNewContest(params: {
  title: string;
  teamsCount: number;
  stages?: Stage[];
}): Promise<{ contest: Contest; tokens: string[] }> {
  const { title, teamsCount, stages = [] } = params;
  const count = Math.max(1, teamsCount || 1);

  // Collect all existing tokens across all contests to guarantee zero duplicacy
  const allExisting = readContestsRegistry().flatMap((c) => c.tokens || []);
  const tokens = generateContestTokenBatch(count, allExisting);

  const newContest: Contest = {
    id: `contest-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    title: title.trim() || 'AI Club Contest',
    status: 'DRAFT',
    teams_count: count,
    tokens,
    stages,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // 1. Persist to local store
  const currentList = readContestsRegistry();
  const updatedList = [newContest, ...currentList];
  writeContestsRegistry(updatedList);

  // 2. Persist to Supabase if available
  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('contests')
      .insert({
        id: newContest.id,
        title: newContest.title,
        status: newContest.status,
        teams_count: newContest.teams_count,
        tokens: newContest.tokens,
        created_at: newContest.created_at,
        updated_at: newContest.updated_at,
      });

    // Auto-register all generated teams into Supabase users table so all teams share the unified leaderboard
    const teamRecords = tokens.map((t, idx) => ({
      name: 'Team ' + (idx + 1),
      email: 'team' + (idx + 1) + '_' + t.toLowerCase().replace(/[^a-z0-9]/g, '') + '@contest.team',
      role: 'participant' as const,
      access_token: t,
      total_score: 0,
      current_stage: 1,
      is_flagged: false,
    }));

    await supabaseAdmin
      .from('users')
      .upsert(teamRecords, { onConflict: 'access_token', ignoreDuplicates: true });
  } catch {
    // Ignore Supabase write failure
  }

  // Update default contest settings title
  try {
    await updateContestSettings('DRAFT', { title: newContest.title, force: true });
  } catch {
    // Ignore
  }

  return { contest: newContest, tokens };
}

/**
 * Updates an existing contest.
 * CRITICAL: Keeps previous tokens intact, DOES NOT regenerate tokens.
 */
export async function updateExistingContest(
  contestId: string,
  params: {
    title?: string;
    teamsCount?: number;
    stages?: Stage[];
    status?: ContestStatus;
  }
): Promise<Contest> {
  const currentList = readContestsRegistry();
  const idx = currentList.findIndex((c) => c.id === contestId);

  if (idx === -1) {
    throw new Error(`Contest with ID '${contestId}' not found.`);
  }

  const existing = currentList[idx];

  const updated: Contest = {
    ...existing,
    title: params.title !== undefined ? params.title.trim() : existing.title,
    stages: params.stages !== undefined ? params.stages : existing.stages,
    status: params.status !== undefined ? params.status : existing.status,
    // Preserve existing tokens completely!
    tokens: existing.tokens,
    teams_count: existing.tokens.length || existing.teams_count,
    updated_at: new Date().toISOString(),
  };

  currentList[idx] = updated;
  writeContestsRegistry(currentList);

  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('contests')
      .update({
        title: updated.title,
        status: updated.status,
        updated_at: updated.updated_at,
      })
      .eq('id', contestId);
  } catch {
    // Ignore Supabase write failure
  }

  return updated;
}

/**
 * Deletes a contest from the system.
 */
export async function deleteContest(contestId: string): Promise<void> {
  const currentList = readContestsRegistry();
  const filtered = currentList.filter((c) => c.id !== contestId);
  writeContestsRegistry(filtered);

  try {
    const supabaseAdmin = getSupabaseAdmin();
    await supabaseAdmin
      .from('contests')
      .delete()
      .eq('id', contestId);
  } catch {
    // Ignore Supabase error
  }
}

// ==============================================================================
// TOKEN - SINGLE ACCOUNT ACTIVATION RESTRICTION REGISTRY
// ==============================================================================

export interface TokenActivation {
  token: string;
  email: string;
  name: string;
  team_name?: string;
  allowedEmails?: string[];
  activatedAt: string;
  userId?: string;
}

function getTokenActivationsPath(): string {
  const storageDir = getContestStorageDir();
  const filePath = path.join(storageDir, 'token-activations.json');
  // Backwards compatibility check
  if (!fs.existsSync(filePath)) {
    const legacyPath = path.join(process.cwd(), '.next', 'token-activations.json');
    if (fs.existsSync(legacyPath)) {
      try {
        fs.copyFileSync(legacyPath, filePath);
      } catch {}
    }
  }
  return filePath;
}

export function readTokenActivations(): Record<string, TokenActivation> {
  try {
    const filePath = getTokenActivationsPath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(data) as Record<string, TokenActivation>;
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

export function writeTokenActivations(map: Record<string, TokenActivation>): void {
  try {
    const filePath = getTokenActivationsPath();
    fs.writeFileSync(filePath, JSON.stringify(map, null, 2), 'utf-8');
  } catch {
    // Ignore write errors
  }
}

/**
 * Validates whether a token can be used by the given account email.
 * If the token is already activated by another account, it is strictly rejected.
 * If not yet activated, it binds this token to the account.
 */
export async function validateAndActivateToken(params: {
  token: string;
  email: string;
  name?: string;
  userId?: string;
}): Promise<{
  success: boolean;
  isFirstActivation: boolean;
  activation?: TokenActivation;
  error?: string;
}> {
  const cleanToken = params.token.trim().toUpperCase();
  const cleanEmail = params.email.trim().toLowerCase();
  const cleanName = (params.name || cleanEmail.split('@')[0]).trim();

  // 1. Query Supabase users table for team token and participant authorization
  try {
    const supabaseAdmin = getSupabaseAdmin();

    // A. Check if THIS logged-in user already has a token assigned to their account
    const { data: userByEmail } = await supabaseAdmin
      .from('users')
      .select('id, email, name, access_token, team_name, role, is_disqualified')
      .eq('email', cleanEmail)
      .maybeSingle();

    if (
      userByEmail &&
      userByEmail.access_token &&
      !userByEmail.access_token.startsWith('PENDING') &&
      userByEmail.access_token !== cleanToken
    ) {
      return {
        success: false,
        isFirstActivation: false,
        error: `Access Denied: Your account is assigned token ${userByEmail.access_token}. The entered token (${cleanToken}) does not match your assigned account token.`,
      };
    }

    // B. Check all participants assigned to this token in the database
    const { data: teamMembers } = await supabaseAdmin
      .from('users')
      .select('id, email, name, access_token, team_name, team_size, role, is_disqualified')
      .eq('access_token', cleanToken);

    if (teamMembers && teamMembers.length > 0) {
      const isMember = teamMembers.some((m: any) => m.email?.toLowerCase().trim() === cleanEmail);
      const teamName = teamMembers[0]?.team_name || teamMembers[0]?.name || 'Assigned Team';

      // Fair-Play Team Lock: Check if ANY member of the team is disqualified
      const isAnyDisqualified = teamMembers.some(
        (m: any) => m.is_disqualified === true || m.role === 'disqualified'
      );
      if (isAnyDisqualified) {
        return {
          success: false,
          isFirstActivation: false,
          error: `Access Denied: Team "${teamName}" has been suspended for fair-play violations. All team members are locked out.`,
        };
      }

      if (isMember) {
        // User is a confirmed member of this team. If their record still has a pending token, update it!
        if (userByEmail && userByEmail.access_token !== cleanToken) {
          await supabaseAdmin
            .from('users')
            .update({
              access_token: cleanToken,
              team_name: teamName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userByEmail.id);
        }
        return {
          success: true,
          isFirstActivation: false,
        };
      }

      // Check if this token was generated as an unclaimed placeholder team (e.g. @contest.team or demo)
      const hasOnlyPlaceholders = teamMembers.every(
        (m: any) => !m.email || m.email.endsWith('@contest.team') || m.email.endsWith('@example.com')
      );

      if (hasOnlyPlaceholders) {
        // Claim this team slot for the real logged-in contestant
        const placeholderUser = teamMembers[0];
        if (userByEmail) {
          // Update user's existing profile to this token and remove the dummy placeholder row
          await supabaseAdmin
            .from('users')
            .update({
              access_token: cleanToken,
              team_name: teamName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', userByEmail.id);

          await supabaseAdmin
            .from('users')
            .delete()
            .eq('id', placeholderUser.id);
        } else {
          await supabaseAdmin
            .from('users')
            .update({
              email: cleanEmail,
              name: cleanName,
              updated_at: new Date().toISOString(),
            })
            .eq('id', placeholderUser.id);
        }

        return {
          success: true,
          isFirstActivation: true,
        };
      }

      return {
        success: false,
        isFirstActivation: false,
        error: `Access Denied: Token ${cleanToken} is assigned exclusively to team "${teamName}". Your account (${cleanEmail}) is not a registered member of this team.`,
      };
    }

    // C. Check if token belongs to an active contest generated in Supabase
    const { data: contestData } = await supabaseAdmin
      .from('contests')
      .select('id, title, tokens')
      .contains('tokens', [cleanToken])
      .maybeSingle();

    if (contestData) {
      const assignedTeamName = `Team ${cleanToken.slice(0, 7)}`;
      if (userByEmail) {
        await supabaseAdmin
          .from('users')
          .update({
            access_token: cleanToken,
            team_name: assignedTeamName,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userByEmail.id);
      } else {
        await supabaseAdmin
          .from('users')
          .insert({
            email: cleanEmail,
            name: cleanName,
            access_token: cleanToken,
            team_name: assignedTeamName,
            role: 'participant',
            total_score: 0,
            current_stage: 1,
            is_flagged: false,
          });
      }

      return {
        success: true,
        isFirstActivation: true,
      };
    }

    // D. Auto-provision demo token in Supabase
    if (cleanToken === 'AX-DEMO-2026' || cleanToken.startsWith('AX-DEMO') || cleanToken === 'DEMO') {
      if (userByEmail) {
        await supabaseAdmin
          .from('users')
          .update({
            access_token: cleanToken,
            team_name: 'Demo Team',
            updated_at: new Date().toISOString(),
          })
          .eq('id', userByEmail.id);
      } else {
        await supabaseAdmin
          .from('users')
          .insert({
            email: cleanEmail,
            name: cleanName,
            access_token: cleanToken,
            team_name: 'Demo Team',
            role: 'participant',
            total_score: 0,
            current_stage: 1,
            is_flagged: false,
          });
      }

      return {
        success: true,
        isFirstActivation: true,
      };
    }
  } catch (err) {
    console.warn('[validateAndActivateToken error]:', err);
  }

  // 2. Check local token activation registry
  const activations = readTokenActivations();
  const existingActivation = activations[cleanToken];

  if (existingActivation) {
    const isAllowed =
      existingActivation.email.toLowerCase() === cleanEmail ||
      (existingActivation.allowedEmails &&
        existingActivation.allowedEmails.map((e) => e.toLowerCase().trim()).includes(cleanEmail));

    if (!isAllowed) {
      return {
        success: false,
        isFirstActivation: false,
        activation: existingActivation,
        error: `Access Denied: Token ${cleanToken} is assigned to team "${existingActivation.team_name || 'Assigned Team'}". Your account (${cleanEmail}) is not a registered member.`,
      };
    }

    return {
      success: true,
      isFirstActivation: false,
      activation: existingActivation,
    };
  }

  // 3. Demo token auto-provisioning
  const isDemo = cleanToken === 'AX-DEMO-2026' || cleanToken.startsWith('AX-DEMO');
  if (isDemo) {
    const newActivation: TokenActivation = {
      token: cleanToken,
      email: cleanEmail,
      name: cleanName,
      activatedAt: new Date().toISOString(),
      userId: params.userId,
    };

    activations[cleanToken] = newActivation;
    writeTokenActivations(activations);

    return {
      success: true,
      isFirstActivation: true,
      activation: newActivation,
    };
  }

  // Token was not found in database or local activations registry
  return {
    success: false,
    isFirstActivation: false,
    error: 'Access Denied: Invalid team code. The entered code is not mapped to any registered participant in the tournament roster.',
  };
}
