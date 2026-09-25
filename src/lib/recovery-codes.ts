// Server only: imports node:crypto and the service-role client. Never import
// this from a "use client" file.
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { createAdminSupabase } from "./supabase-admin";

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const CODE_COUNT = 10;

// No 0/O, 1/I/L: codes get copied off paper and typed on phones.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** 10 characters from 31 symbols is ~49 bits: out of reach at 5 guesses per 15 minutes. */
function newCode(): string {
  const bytes = randomBytes(10);
  const chars = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
}

export function normaliseCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

async function hash(code: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(normaliseCode(code), salt, 32);
  return `${salt.toString("base64")}:${derived.toString("base64")}`;
}

async function matches(code: string, stored: string): Promise<boolean> {
  const [saltB64, hashB64] = stored.split(":");
  if (!saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, "base64");
  const derived = await scrypt(normaliseCode(code), Buffer.from(saltB64, "base64"), expected.length);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Replaces any existing codes with a fresh set. Returns the plain codes: show once, never store. */
export async function issueRecoveryCodes(userId: string): Promise<string[]> {
  const admin = createAdminSupabase();
  const codes = Array.from({ length: CODE_COUNT }, newCode);
  const rows = await Promise.all(codes.map(async (c) => ({ user_id: userId, code_hash: await hash(c) })));
  await admin.from("mfa_recovery_codes").delete().eq("user_id", userId);
  const { error } = await admin.from("mfa_recovery_codes").insert(rows);
  if (error) throw new Error("Could not save recovery codes");
  return codes;
}

export async function unusedCodeCount(userId: string): Promise<number> {
  const admin = createAdminSupabase();
  const { count } = await admin
    .from("mfa_recovery_codes")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("used_at", null);
  return count ?? 0;
}

export async function deleteRecoveryCodes(userId: string): Promise<void> {
  await createAdminSupabase().from("mfa_recovery_codes").delete().eq("user_id", userId);
}

/** Marks the matching code used and returns true, or returns false. */
export async function redeemRecoveryCode(userId: string, input: string): Promise<boolean> {
  if (normaliseCode(input).length !== 10) return false;
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("mfa_recovery_codes")
    .select("id, code_hash")
    .eq("user_id", userId)
    .is("used_at", null);
  for (const row of data ?? []) {
    if (await matches(input, row.code_hash)) {
      // Guard on used_at so two simultaneous attempts can't both spend it.
      const { data: spent } = await admin
        .from("mfa_recovery_codes")
        .update({ used_at: new Date().toISOString() })
        .eq("id", row.id)
        .is("used_at", null)
        .select("id");
      return (spent?.length ?? 0) === 1;
    }
  }
  return false;
}

// ---- rate limiting: 5 wrong codes per 15 minutes per account ----

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 5;

export async function recoveryLockedOut(userId: string): Promise<boolean> {
  const { data } = await createAdminSupabase()
    .from("account_security")
    .select("recovery_failures, recovery_window_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data?.recovery_window_started_at) return false;
  const inWindow = Date.now() - new Date(data.recovery_window_started_at).getTime() < WINDOW_MS;
  return inWindow && data.recovery_failures >= MAX_FAILURES;
}

export async function recordRecoveryFailure(userId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("account_security")
    .select("recovery_failures, recovery_window_started_at")
    .eq("user_id", userId)
    .maybeSingle();
  const now = new Date();
  const fresh =
    !data?.recovery_window_started_at ||
    now.getTime() - new Date(data.recovery_window_started_at).getTime() >= WINDOW_MS;
  await admin.from("account_security").upsert({
    user_id: userId,
    recovery_failures: fresh ? 1 : (data?.recovery_failures ?? 0) + 1,
    recovery_window_started_at: fresh ? now.toISOString() : data!.recovery_window_started_at,
    updated_at: now.toISOString(),
  });
}

/** Clears the failure counter and starts the 48-hour hold (see migration 20260925d). */
export async function recordRecovery(userId: string): Promise<void> {
  const now = new Date().toISOString();
  await createAdminSupabase().from("account_security").upsert({
    user_id: userId,
    mfa_reset_at: now,
    recovery_failures: 0,
    recovery_window_started_at: null,
    updated_at: now,
  });
}

/** Removes every authenticator on the account, using the server's admin access. */
export async function removeAllAuthenticators(userId: string): Promise<void> {
  const admin = createAdminSupabase();
  const { data } = await admin.auth.admin.mfa.listFactors({ userId });
  for (const f of data?.factors ?? []) {
    await admin.auth.admin.mfa.deleteFactor({ userId, id: f.id });
  }
}
