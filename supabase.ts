import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Browser client. Uses the publishable key, which is safe to ship to the
 * client: every request it makes is still filtered by the 25 RLS policies
 * on the database. The key identifies the project, it does not grant trust.
 */
export function createClient() {
  return createBrowserClient(URL, KEY);
}

/**
 * Server client, for Server Components and Route Handlers.
 * Still the publishable key — a logged-in user's session is read from
 * cookies, so RLS sees the real auth.uid() and policies apply normally.
 *
 * NOTE: there is deliberately no service-role client in this file.
 * That key bypasses every RLS policy including the ledger lockout, so it
 * belongs in a narrowly scoped server module, created when a specific
 * operation genuinely needs it — never as a general-purpose client.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(URL, KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Session refresh is handled by middleware instead.
        }
      },
    },
  });
}
