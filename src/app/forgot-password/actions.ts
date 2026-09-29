"use server";

import { createServerSupabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";

/**
 * Supabase waits on its email sender before answering. When the sender hangs,
 * Supabase gives up at 10 s and its gateway retries, which outlasts the
 * Netlify function's own time limit, so the function is killed and the
 * browser shows "This page couldn't load". Stop waiting well before that.
 */
const SEND_TIMEOUT_MS = 7000;
const TIMED_OUT = Symbol("timed-out");

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
  const send = supabase.auth.resetPasswordForEmail(email, {
    // Same-browser fallback: the default email template sends people via
    // Supabase to /auth/callback with a PKCE code. The recommended template
    // (see README) links straight to /auth/confirm, which works on any device.
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  const result = await Promise.race([
    send,
    new Promise<typeof TIMED_OUT>((resolve) => setTimeout(() => resolve(TIMED_OUT), SEND_TIMEOUT_MS)),
  ]);

  if (result === TIMED_OUT) {
    // Only accounts that exist ever reach the email sender, so a distinct
    // message here would reveal which addresses are registered. Give the
    // usual answer; the "didn't arrive? request another" copy covers it.
    console.error("resetPasswordForEmail timed out after", SEND_TIMEOUT_MS, "ms (email sender slow or down)");
    return { sent: true, email };
  }
  const { error } = result;

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
