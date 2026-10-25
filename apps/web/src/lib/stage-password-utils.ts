/** Passwords that must never be shown to contestants (admin placeholders, misconfig). */
export function isUsableStagePassword(value: string | null | undefined): value is string {
  if (!value?.trim()) return false;
  const t = value.trim();
  const lower = t.toLowerCase();
  if (lower === 'password_not_configured') return false;
  if (lower.includes('placeholder')) return false;
  if (/^e\.g\./i.test(t)) return false;
  if (/^(tbd|n\/a|xxx+|your[- ]?password|changeme|test123)$/i.test(t)) return false;
  return true;
}
