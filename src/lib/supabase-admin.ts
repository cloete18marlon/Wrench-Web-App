import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client — bypasses every RLS policy, including the lockout on
 * ledger_entries/audit_log/payments/payouts. Those tables have no write
 * policies at all for the publishable key by design (see README), so this is
 * the ONLY way to write them.
 *
 * Import this only from webhook route handlers and the payment/payout server
 * actions, and only after checking authorization yourself with a normal
 * session-scoped client first — this client trusts every call unconditionally.
 * Never import it from a "use client" file or expose it to the browser.
 */
export function createAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set — required for payment/payout writes.");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
