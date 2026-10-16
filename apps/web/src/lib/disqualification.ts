// Global cache for disqualified users during offline / local testing
declare global {
  // eslint-disable-next-line no-var
  var __disqualifiedUsers: Set<string> | undefined;
}

if (!globalThis.__disqualifiedUsers) {
  globalThis.__disqualifiedUsers = new Set<string>();
}

export function isUserDisqualifiedLocally(userId: string): boolean {
  return globalThis.__disqualifiedUsers?.has(userId) ?? false;
}

export function recordLocalDisqualification(userId: string): void {
  globalThis.__disqualifiedUsers?.add(userId);
}

export function removeLocalDisqualification(userId: string): void {
  globalThis.__disqualifiedUsers?.delete(userId);
}

export function clearAllLocalDisqualifications(): void {
  globalThis.__disqualifiedUsers?.clear();
}
