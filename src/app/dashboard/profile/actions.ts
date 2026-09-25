"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { cleanCode, verifyAgainstAnyFactor } from "@/lib/mfa";
import { deleteRecoveryCodes, issueRecoveryCodes, unusedCodeCount } from "@/lib/recovery-codes";

async function requireUser() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/profile");
  return { supabase, user };
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
}

export type FormState = { error?: string; success?: string };

// ---------------------------------------------------------------- name

export async function updateName(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const fullName = String(formData.get("fullName") ?? "").trim().replace(/\s+/g, " ");
  if (fullName.length < 2) return { error: "Enter your name." };
  if (fullName.length > 80) return { error: "Keep your name under 80 characters." };

  const { error } = await supabase.from("users").update({ full_name: fullName }).eq("id", user.id);
  if (error) return { error: "Couldn't save your name. Try again." };
  refresh();
  return { success: "Name saved." };
}

// ---------------------------------------------------------------- photo

const AVATAR_PREFIX = "/storage/v1/object/public/avatars/";
const MAX_BYTES = 1024 * 1024;

/** Storage path of a previous photo, if it's one of this user's own uploads. */
function ownAvatarPath(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  const i = url.indexOf(AVATAR_PREFIX);
  if (i < 0) return null;
  const path = decodeURIComponent(url.slice(i + AVATAR_PREFIX.length));
  return path.startsWith(`${userId}/`) ? path : null;
}

async function setAvatar(url: string | null) {
  const { supabase, user } = await requireUser();
  const { data: me } = await supabase.from("users").select("avatar_url").eq("id", user.id).maybeSingle();

  const { error } = await supabase.from("users").update({ avatar_url: url }).eq("id", user.id);
  if (error) return { error: "Couldn't save your photo. Try again." };
  // Pros show the same photo in the public directory.
  await supabase.from("pro_profiles").update({ avatar_url: url }).eq("user_id", user.id);

  const old = ownAvatarPath(me?.avatar_url, user.id);
  if (old) await supabase.storage.from("avatars").remove([old]);
  refresh();
  return {};
}

export async function uploadAvatar(formData: FormData): Promise<{ error?: string }> {
  const { supabase, user } = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  if (file.type !== "image/jpeg") return { error: "That file isn't a supported photo." };
  if (file.size > MAX_BYTES) return { error: "That photo is too large. Try a smaller one." };

  // Unique name per upload: no overwrite rules needed, and browsers never
  // show a cached old photo under the new URL.
  const path = `${user.id}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) return { error: "Upload failed. Check your connection and try again." };

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return setAvatar(data.publicUrl);
}

export async function removeAvatar(): Promise<{ error?: string }> {
  return setAvatar(null);
}

// ---------------------------------------------------------------- email

export async function changeEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireUser();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email address." };
  if (email === user.email?.toLowerCase()) return { error: "That's already your email address." };

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: `${siteUrl}/auth/callback?next=/dashboard/profile` }
  );
  if (error) {
    if (/already/i.test(error.message)) return { error: "That address is already used by another account." };
    if (/rate|seconds/i.test(error.message)) return { error: "Too many attempts. Wait a minute and try again." };
    return { error: "Couldn't start the change. Try again." };
  }
  refresh();
  return {
    success: `Confirmation links sent. Your email changes to ${email} once you've confirmed from both your current and new inbox.`,
  };
}

// ---------------------------------------------------------------- two-step verification

const MAX_AUTHENTICATORS = 3;

async function requireVerifiedSession() {
  const ctx = await requireUser();
  const { data: aal } = await ctx.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  // With an authenticator on the account, changes here need a code-verified session.
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") redirect("/login/mfa?next=/dashboard/profile");
  return ctx;
}

export type EnrollResult = { error?: string; factorId?: string; qr?: string; secret?: string };

export async function startTwoFactor(): Promise<EnrollResult> {
  const { supabase } = await requireVerifiedSession();

  // Clear out any set-up that was started and abandoned, so it can't block a new one.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified").length;
  if (verified >= MAX_AUTHENTICATORS) return { error: `You can have up to ${MAX_AUTHENTICATORS} authenticators.` };

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Wrenchy",
    // Must be unique per account; the date and time also help people tell devices apart.
    friendlyName: verified === 0 ? "Authenticator" : `Backup authenticator ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
  });
  if (error || !data) return { error: "Couldn't start set-up. Try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export type ConfirmState = FormState & { codes?: string[] };

export async function confirmTwoFactor(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const { supabase, user } = await requireUser();
  const factorId = String(formData.get("factorId") ?? "");
  const code = cleanCode(formData.get("code"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code didn't match. Use the one showing in your app right now." };

  // First authenticator on the account: issue recovery codes now, while the
  // person is right here to save them.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified").length;
  if (verified === 1 || (await unusedCodeCount(user.id)) === 0) {
    const codes = await issueRecoveryCodes(user.id);
    refresh();
    return { success: "Two-step verification is on.", codes };
  }
  refresh();
  return { success: "Backup authenticator added. A code from either device now works." };
}

export async function regenerateRecoveryCodes(_prev: ConfirmState, formData: FormData): Promise<ConfirmState> {
  const { supabase, user } = await requireVerifiedSession();
  const code = cleanCode(formData.get("code"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app to confirm." };
  const ok = await verifyAgainstAnyFactor(supabase, code);
  if (!ok) return { error: "That code didn't match. Use the one showing in your app right now." };

  const codes = await issueRecoveryCodes(user.id);
  refresh();
  return { success: "New recovery codes created. Your old codes no longer work.", codes };
}

export async function removeAuthenticator(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireVerifiedSession();
  const factorId = String(formData.get("factorId") ?? "");
  const code = cleanCode(formData.get("code"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter a current code to confirm." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
  if (verified.length <= 1) return { error: "This is your only authenticator. Turn off two-step verification instead." };
  if (!verified.some((f) => f.id === factorId)) return { error: "That authenticator no longer exists." };

  if (!(await verifyAgainstAnyFactor(supabase, code))) {
    return { error: "That code didn't match. Use the one showing in your app right now." };
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) return { error: "Couldn't remove it. Try again." };
  refresh();
  return { success: "Authenticator removed." };
}

export async function disableTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireVerifiedSession();
  const code = cleanCode(formData.get("code"));
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app to confirm." };

  // Ask for a fresh code even though the session is already verified: turning
  // off protection should need the phone, not just an unattended open tab.
  const ok = await verifyAgainstAnyFactor(supabase, code);
  if (ok === null) return { success: "Two-step verification is already off." };
  if (!ok) return { error: "That code didn't match. Use the one showing in your app right now." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: "Couldn't turn it off completely. Try again." };
  }
  await deleteRecoveryCodes(user.id);
  refresh();
  return { success: "Two-step verification is off, and your recovery codes have been deleted." };
}
