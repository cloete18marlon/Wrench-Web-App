"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type PostJobState = { error?: string };

export async function postJob(_prevState: PostJobState, formData: FormData): Promise<PostJobState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const tradeId = String(formData.get("tradeId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const budgetMinRaw = String(formData.get("budgetMin") ?? "").trim();
  const budgetMaxRaw = String(formData.get("budgetMax") ?? "").trim();
  const preferredDate = String(formData.get("preferredDate") ?? "").trim();

  if (!tradeId) return { error: "Select a trade." };
  if (!title) return { error: "Give the job a short title." };

  const budgetMin = budgetMinRaw ? Number(budgetMinRaw) : null;
  const budgetMax = budgetMaxRaw ? Number(budgetMaxRaw) : null;
  if (budgetMin !== null && Number.isNaN(budgetMin)) return { error: "Invalid minimum budget." };
  if (budgetMax !== null && Number.isNaN(budgetMax)) return { error: "Invalid maximum budget." };

  const { data: job, error } = await supabase
    .from("jobs")
    .insert({
      customer_id: user.id,
      trade_id: tradeId,
      title,
      description: description || null,
      budget_min: budgetMin,
      budget_max: budgetMax,
      preferred_date: preferredDate || null,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/jobs/${job.id}`);
}
