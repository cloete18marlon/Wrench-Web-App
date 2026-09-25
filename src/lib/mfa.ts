import type { SupabaseClient } from "@supabase/supabase-js";

/** Tries a code against each of the user's authenticators; true on the first match. */
export async function verifyAgainstAnyFactor(supabase: SupabaseClient, code: string): Promise<boolean | null> {
  const { data } = await supabase.auth.mfa.listFactors();
  const factors = (data?.totp ?? []).filter((f) => f.status === "verified");
  if (factors.length === 0) return null;
  for (const f of factors) {
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (!error) return true;
  }
  return false;
}

export function cleanCode(input: FormDataEntryValue | null): string {
  return String(input ?? "").replace(/\s/g, "");
}
