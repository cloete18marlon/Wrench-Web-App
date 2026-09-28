"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { hasFreshRecovery, passwordProblem } from "@/lib/password-reset";

export type ResetState = { error?: string; done?: boolean };

/**
 * Saves the new password. Supabase Auth stores it as a bcrypt hash in
 * auth.users.encrypted_password — no Wrenchy table ever holds a password.
 */
export async function resetPassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password, confirm);
  if (problem) return { error: problem };

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasFreshRecovery(supabase))) {
    redirect("/forgot-password?error=" + encodeURIComponent("Your reset link has expired. Request a new one."));
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    switch (error.code) {
      case "same_password":
        return { error: "That's your current password. Choose a different one." };
      case "weak_password":
        return { error: "That password is too easy to guess or has appeared in a data breach. Choose another." };
      case "insufficient_aal":
        // Two-step verification is on; the proxy normally catches this first.
        redirect("/login/mfa?next=/reset-password");
      default:
        console.error("updateUser(password) failed:", error.code ?? error.message);
        return { error: "We couldn't save your new password. Please try again." };
    }
  }

  // End every session, this one included. Anyone who was signed in with the
  // old password is thrown out, and the recovery session can't be reused to
  // change the password again. The user proves the new password by logging in.
  await supabase.auth.signOut({ scope: "global" });
  return { done: true };
}
