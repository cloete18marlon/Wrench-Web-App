"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";

export type MfaState = { error?: string };

export async function verifyLoginCode(_prev: MfaState, formData: FormData): Promise<MfaState> {
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  const next = safeNext(formData.get("next"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createServerSupabase();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) redirect("/login");

  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect(next); // No second factor any more - nothing to check.

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) {
    return { error: "That code didn't match. Codes change every 30 seconds, so use the one showing now." };
  }
  redirect(next);
}
