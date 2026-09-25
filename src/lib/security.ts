import type { SupabaseClient } from "@supabase/supabase-js";

export const HOLD_HOURS = 48;

/**
 * When the post-recovery hold ends for this user, or null if there is none.
 * The database enforces the hold on its own (migration 20260925d); this is
 * for explaining it on screen.
 */
export async function holdUntil(supabase: SupabaseClient, userId: string): Promise<Date | null> {
  const { data } = await supabase.from("account_security").select("mfa_reset_at").eq("user_id", userId).maybeSingle();
  if (!data?.mfa_reset_at) return null;
  const until = new Date(new Date(data.mfa_reset_at).getTime() + HOLD_HOURS * 3600 * 1000);
  return until > new Date() ? until : null;
}

export const holdFmt = new Intl.DateTimeFormat("en-ZA", {
  weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
});
