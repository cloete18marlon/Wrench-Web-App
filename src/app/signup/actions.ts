"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { safeNext } from "@/lib/safe-next";

export type SignupState = { error?: string; success?: boolean };

export async function signup(_prevState: SignupState, formData: FormData): Promise<SignupState> {
  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNext(formData.get("next"));

  if (!fullName) return { error: "Enter your name." };
  if (!email) return { error: "Enter your email." };
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      // The confirmation link brings them back to what they were doing,
      // e.g. requesting a quote from a pro they found while browsing.
      emailRedirectTo: `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error) return { error: error.message };

  // Confirm-email is on: signUp succeeds but returns no session until the
  // link in that email is clicked (which lands on /auth/callback). If email
  // confirmation is ever turned off, a session comes back immediately.
  if (!data.session) {
    return { success: true };
  }

  redirect(next);
}
