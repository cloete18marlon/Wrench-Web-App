import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * How long after clicking the emailed link the reset page stays usable.
 * Matches Supabase's default one-hour lifetime for the link itself.
 */
export const RESET_WINDOW_MINUTES = 60;

export const PASSWORD_MIN = 8; // DL-013: project minimum, set in both environments
export const PASSWORD_MAX = 72; // bcrypt ignores bytes beyond 72; Supabase rejects them

/**
 * Sign-in methods that prove the person controls the account's email inbox.
 * A reset link is recorded by Supabase as "otp" (confirmed on staging,
 * 8 Oct 2026: a session from a reset link carried amr method "otp", not
 * "recovery"). "recovery" and "magiclink" are kept in case a future Supabase
 * version labels it differently. All of them prove the same thing as the
 * reset link: whoever is here just opened an email sent to this address.
 */
const INBOX_PROOF_METHODS = new Set(["otp", "recovery", "magiclink"]);

/**
 * True only when the current session was created from an emailed link
 * within the last hour.
 *
 * Why not just "is someone signed in"? A signed-in session alone must not be
 * enough to change a password without knowing the old one: a borrowed phone
 * or an unlocked laptop would otherwise be a full account takeover. The
 * reset link proves control of the email address, and Supabase records that
 * in the token's amr (authentication methods) claim with a timestamp. A
 * password login is recorded as "password" and never passes this check.
 *
 * getClaims() verifies the token's signature before we read it, so the claim
 * cannot be forged by editing a cookie.
 */
export async function hasFreshRecovery(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return false;

  const amr = (data.claims.amr ?? []) as Array<{ method?: string; timestamp?: number } | string>;
  const cutoff = Math.floor(Date.now() / 1000) - RESET_WINDOW_MINUTES * 60;

  return amr.some(
    (entry) =>
      typeof entry === "object" &&
      INBOX_PROOF_METHODS.has(entry.method ?? "") &&
      typeof entry.timestamp === "number" &&
      entry.timestamp >= cutoff
  );
}

/** Server-side password rules. Returns an error message, or null if acceptable. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters.`;
  if (new TextEncoder().encode(password).length > PASSWORD_MAX) {
    return `That's too long. Keep it under ${PASSWORD_MAX} characters.`;
  }
  if (password !== confirm) return "The two passwords don't match.";
  return null;
}
