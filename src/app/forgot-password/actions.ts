"use server";

import { createServerSupabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";

export type ForgotState = { error?: string; sent?: boolean; email?: string };

/**
 * Sends the reset email. Deliberately gives the same answer whether or not an
 * account exists for that address — otherwise this form becomes a free tool
 * for finding out who uses Wrenchy. Supabase itself returns success for
 * unknown addresses without sending anything.
 */
export async function requestPasswordReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Same-browser fallback: the default email template sends people via
    // Supabase to /auth/callback with a PKCE code. The recommended template
    // (see README) links straight to /auth/confirm, which works on any device.
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });

  // Rate limits apply per address and per project, whether or not the
  // account exists, so saying so reveals nothing.
  if (error && (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit" || error.status === 429)) {
    return { error: "Too many reset emails requested. Wait a minute, then try again." };
  }
  if (error && error.code === "email_address_invalid") {
    return { error: "Enter a valid email address." };
  }
  // Any other error is logged server-side but not shown, to keep the answer uniform.
  if (error) console.error("resetPasswordForEmail failed:", error.code ?? error.message);

  return { sent: true, email };
}
