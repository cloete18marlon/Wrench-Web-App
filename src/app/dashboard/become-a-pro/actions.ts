"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type ApplyState = { error?: string };

export async function applyAsPro(_prevState: ApplyState, formData: FormData): Promise<ApplyState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tradeIds = formData.getAll("trades").map(String);
  if (tradeIds.length === 0) return { error: "Select at least one trade." };

  const companyName = String(formData.get("companyName") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const hourlyRateRaw = String(formData.get("hourlyRate") ?? "").trim();
  const radiusRaw = String(formData.get("serviceRadiusKm") ?? "").trim();

  const hourlyRate = hourlyRateRaw ? Number(hourlyRateRaw) : null;
  if (hourlyRate !== null && (Number.isNaN(hourlyRate) || hourlyRate < 0)) {
    return { error: "Enter a valid hourly rate." };
  }

  const serviceRadiusKm = radiusRaw ? Number(radiusRaw) : undefined;
  if (serviceRadiusKm !== undefined && (Number.isNaN(serviceRadiusKm) || serviceRadiusKm <= 0)) {
    return { error: "Service radius must be greater than 0." };
  }

  // The name shown in the public directory. Guests can't read public.users,
  // so it is copied onto the profile at application time.
  const { data: me } = await supabase.from("users").select("full_name").eq("id", user.id).maybeSingle();

  const { data: proProfile, error: profileError } = await supabase
    .from("pro_profiles")
    .insert({
      user_id: user.id,
      display_name: me?.full_name ?? null,
      company_name: companyName || null,
      bio: bio || null,
      hourly_rate: hourlyRate,
      ...(serviceRadiusKm !== undefined ? { service_radius_km: serviceRadiusKm } : {}),
    })
    .select("id")
    .single();

  if (profileError) {
    if (profileError.code === "23505") {
      return { error: "You've already applied — check your dashboard for status." };
    }
    return { error: profileError.message };
  }

  const { error: tradesError } = await supabase
    .from("pro_trades")
    .insert(tradeIds.map((trade_id) => ({ pro_id: proProfile.id, trade_id })));

  if (tradesError) return { error: tradesError.message };

  redirect("/dashboard");
}
