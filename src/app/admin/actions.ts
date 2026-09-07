"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export async function approvePro(formData: FormData) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const userId = String(formData.get("userId") ?? "");
  const proProfileId = String(formData.get("proProfileId") ?? "");

  // RLS (has_role('admin')) is the real gate — these just no-op if it fails.
  await supabase.from("user_roles").upsert(
    { user_id: userId, role: "pro" },
    { onConflict: "user_id,role", ignoreDuplicates: true }
  );
  await supabase.from("pro_profiles").update({ verification_tier: 1 }).eq("id", proProfileId);

  revalidatePath("/admin");
}
