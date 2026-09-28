import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createServerSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";

// Landing point for email links that carry a token_hash (the recommended
// Supabase email templates — see README). Unlike /auth/callback's PKCE code,
// a token_hash does not depend on a cookie from the browser that asked for
// the email, so the link works when opened on a different device or in a
// phone's mail app.
const ALLOWED: EmailOtpType[] = ["recovery", "signup", "email"];

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const isRecovery = type === "recovery";
  const next = safeNext(searchParams.get("next"), isRecovery ? "/reset-password" : "/dashboard");

  if (tokenHash && type && ALLOWED.includes(type)) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }

  const back = new URL(isRecovery ? "/forgot-password" : "/login", origin);
  back.searchParams.set(
    "error",
    isRecovery
      ? "That reset link is invalid, has expired, or was already used. Request a new one below."
      : "That link is invalid or has expired. Please try again."
  );
  return NextResponse.redirect(back);
}
