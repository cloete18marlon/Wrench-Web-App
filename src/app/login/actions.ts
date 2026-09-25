"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type LoginState = { error?: string };

export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) return { error: "Enter your email and password." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Confirm your email first — check the link we sent you." };
    }
    return { error: "Incorrect email or password." };
  }

  redirect(isSafeNext(next) ? next : "/dashboard");
}

// Only same-site paths. "//evil.com" and "/\evil.com" start with "/" but
// browsers treat them as links to another site.
function isSafeNext(next: string) {
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
}

export async function logout() {
  const supabase = await createServerSupabase();
  await supabase.auth.signOut();
  redirect("/");
}
