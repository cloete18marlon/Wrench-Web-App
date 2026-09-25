import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Everything else requires a signed-in session. Keep this list to routes that
// must work before/without auth: the marketing landing page, the auth forms
// themselves, the email-confirmation/OAuth callback, the ops status page
// (useful for diagnosing a broken deploy when login itself might be at fault),
// and the Peach Payments webhooks — Peach calls these server-to-server with
// no session cookie; authenticity is checked via HMAC signature inside the
// handler instead.
const PUBLIC_PATHS = new Set([
  "/",
  "/login",
  "/signup",
  "/auth/callback",
  "/status",
  "/api/webhooks/peach/checkout",
  "/api/webhooks/peach/payout",
]);

// Path prefixes guests may browse: the pro directory and every public pro
// profile under it. Anything a guest does (request a quote, message) lives
// under a gated path, so the gate sits exactly where the prototype put it.
const PUBLIC_PREFIXES = ["/pros"];

const MFA_PATH = "/login/mfa";

function isPublicPath(pathname: string) {
  return (
    PUBLIC_PATHS.has(pathname) ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))
  );
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Must call getUser() (not getSession()) here — it revalidates against
  // Supabase rather than trusting the cookie, which is what actually keeps
  // the session cookie refreshed on each request.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = isPublicPath(pathname);

  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // Two-step verification. Once someone has an authenticator set up, a
  // password alone only reaches the public pages: every signed-in page asks
  // for the code first. aal2 is the session level a verified code grants.
  if (user && !isPublic && pathname !== MFA_PATH) {
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      const mfaUrl = new URL(MFA_PATH, request.url);
      mfaUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(mfaUrl);
    }
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
