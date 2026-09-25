"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";
import { cleanCode, verifyAgainstAnyFactor } from "@/lib/mfa";
import {
  recordRecovery,
  recordRecoveryFailure,
  recoveryLockedOut,
  redeemRecoveryCode,
  removeAllAuthenticators,
} from "@/lib/recovery-codes";

export type MfaState = { error?: string };

export async function verifyLoginCode(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const code = cleanCode(formData.get("code"));
  const next = safeNext(formData.get("next"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const ok = await verifyAgainstAnyFactor(supabase, code);
  if (ok === null) redirect(next); // No authenticator any more - nothing to check.
  if (!ok) return { error: "That code didn't match. Codes change every 30 seconds, so use the one showing now." };
  redirect(next);
}

/**
 * Lost authenticator. Password already proved by the login step; the
 * recovery code proves the second factor. On success every authenticator is
 * removed, other devices are signed out, and the 48-hour hold on banking
 * changes and payouts begins.
 */
export async function submitRecoveryCode(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const code = String(formData.get("recoveryCode") ?? "");
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  if (await recoveryLockedOut(user.id)) {
    return { error: "Too many wrong codes. Wait 15 minutes, then try again." };
  }
  if (!(await redeemRecoveryCode(user.id, code))) {
    await recordRecoveryFailure(user.id);
    return { error: "That recovery code isn't valid or has already been used." };
  }

  await removeAllAuthenticators(user.id);
  await recordRecovery(user.id);
  // Pick up the account without its authenticators, then end every other session.
  await supabase.auth.refreshSession();
  await supabase.auth.signOut({ scope: "others" });

  redirect("/dashboard/profile?recovered=1");
}
