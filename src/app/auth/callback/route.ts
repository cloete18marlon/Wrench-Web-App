import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase";

// Landing point for both the signup-confirmation email link and (once added)
// OAuth sign-in — both hand back a PKCE `code` that this exchanges for a
// session cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const loginUrl = new URL("/login", origin);
  loginUrl.searchParams.set("error", "That link is invalid or has expired. Please try again.");
  return NextResponse.redirect(loginUrl);
}
