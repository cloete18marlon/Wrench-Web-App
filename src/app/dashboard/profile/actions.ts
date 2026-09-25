"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";

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

export type EnrollResult = { error?: string; factorId?: string; qr?: string; secret?: string };

export async function startTwoFactor(): Promise<EnrollResult> {
  const { supabase } = await requireUser();

  // Clear out any set-up that was started and abandoned, so it can't block a new one.
  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const f of factors?.all ?? []) {
    if (f.factor_type === "totp" && f.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: f.id });
    }
  }
  if (factors?.totp.some((f) => f.status === "verified")) return { error: "Two-step verification is already on." };

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    issuer: "Wrenchy",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: "Couldn't start set-up. Try again." };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

export async function confirmTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { error: "That code didn't match. Use the one showing in your app right now." };
  refresh();
  return { success: "Two-step verification is on. You'll need a code from your app each time you log in." };
}

export async function disableTwoFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireUser();
  const code = String(formData.get("code") ?? "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your app to confirm." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) return { success: "Two-step verification is already off." };

  // Ask for a fresh code even though the session is already verified: turning
  // off protection should need the phone, not just an unattended open tab.
  const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (verifyError) return { error: "That code didn't match. Use the one showing in your app right now." };

  const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
  if (error) return { error: "Couldn't turn it off. Try again." };
  refresh();
  return { success: "Two-step verification is off." };
}
