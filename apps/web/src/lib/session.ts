import { auth } from './firebase';

export interface ContestantSession {
  email: string;
  name: string;
  uid: string;
  photoURL?: string | null;
  assignedToken?: string | null;
  teamName?: string | null;
  teamSize?: string | null;
  lastLoginAt: number;
}

const SESSION_KEY = 'contestant_session_user';
const LEGACY_PROFILE_KEY = 'contestant_profile';
const TOKEN_KEY = 'participant_token';

/**
 * Retrieve the current logged-in contestant session from persistent local storage.
 * Returns null if the user is not authenticated.
 */
export function getContestantSession(): ContestantSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ContestantSession;
      if (parsed && parsed.email) {
        return parsed;
      }
    }

    // Legacy fallback check
    const legacyRaw = localStorage.getItem(LEGACY_PROFILE_KEY);
    if (legacyRaw) {
      const legacyUser = JSON.parse(legacyRaw);
      if (legacyUser && legacyUser.email) {
        const session: ContestantSession = {
          email: legacyUser.email.toLowerCase(),
          name: legacyUser.name || legacyUser.email.split('@')[0],
          uid: legacyUser.id || 'legacy-user',
          photoURL: legacyUser.photoURL || null,
          assignedToken: legacyUser.access_token || localStorage.getItem(TOKEN_KEY) || null,
          lastLoginAt: Date.now(),
        };
        // Normalize to new session key
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
      }
    }
  } catch (err) {
    console.warn('[getContestantSession] Error parsing session:', err);
  }

  return null;
}

/**
 * Store or update the authenticated contestant session.
 */
export function setContestantSession(session: ContestantSession): void {
  if (typeof window === 'undefined') return;

  try {
    const normalized: ContestantSession = {
      ...session,
      email: session.email.toLowerCase().trim(),
      lastLoginAt: session.lastLoginAt || Date.now(),
    };

    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    sessionStorage.setItem('contestant_session_active', 'true');

    if (normalized.assignedToken) {
      localStorage.setItem(TOKEN_KEY, normalized.assignedToken.trim().toUpperCase());
    }

    // Keep legacy profile key populated for any backwards-compatible consumers
    localStorage.setItem(
      LEGACY_PROFILE_KEY,
      JSON.stringify({
        email: normalized.email,
        name: normalized.name,
        id: normalized.uid,
        access_token: normalized.assignedToken,
      })
    );
  } catch (err) {
    console.warn('[setContestantSession] Error saving session:', err);
  }
}

/**
 * Updates the user's verified room access token in the active session.
 */
export function updateContestantSessionToken(token: string): void {
  if (typeof window === 'undefined') return;

  const cleanToken = token.trim().toUpperCase();
  localStorage.setItem(TOKEN_KEY, cleanToken);

  const current = getContestantSession();
  if (current) {
    current.assignedToken = cleanToken;
    setContestantSession(current);
  }
}

/**
 * Updates the team details in the active contestant session.
 */
export function updateContestantSessionTeam(teamName?: string | null, teamSize?: string | null): void {
  if (typeof window === 'undefined') return;

  const current = getContestantSession();
  if (current) {
    if (teamName !== undefined) current.teamName = teamName;
    if (teamSize !== undefined) current.teamSize = teamSize;
    setContestantSession(current);
  }
}

/**
 * Clears the contestant session, tokens, and signs out of Firebase.
 */
export async function clearContestantSession(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('contestant_session_active');
    sessionStorage.removeItem('unlocked_stage_passwords');

    if (auth && auth.signOut) {
      await auth.signOut().catch(() => {});
    }
  } catch (err) {
    console.warn('[clearContestantSession] Error clearing session:', err);
  }
}
