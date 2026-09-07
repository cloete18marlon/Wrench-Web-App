"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type QuoteState = { error?: string };

export async function submitQuote(_prevState: QuoteState, formData: FormData): Promise<QuoteState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  const estimatedDaysRaw = String(formData.get("estimatedDays") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();

  const amount = Number(amountRaw);
  if (!amountRaw || Number.isNaN(amount) || amount < 0) return { error: "Enter a valid amount." };

  const { data: proProfile } = await supabase
    .from("pro_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!proProfile) return { error: "You need an approved pro profile to quote." };

  const { data: quote, error: quoteError } = await supabase
    .from("quotes")
    .insert({
      job_id: jobId,
      pro_id: proProfile.id,
      estimated_days: estimatedDaysRaw ? Number(estimatedDaysRaw) : null,
    })
    .select("id")
    .single();

  if (quoteError) return { error: quoteError.message };

  const { error: lineItemError } = await supabase.from("quote_line_items").insert({
    quote_id: quote.id,
    item_type: "labour",
    description: description || "Labour",
    amount,
  });

  if (lineItemError) {
    // Best-effort cleanup so a failed line item doesn't leave a bare quote behind.
    await supabase.from("quotes").delete().eq("id", quote.id);
    return { error: lineItemError.message };
  }

  revalidatePath(`/jobs/${jobId}`);
  redirect(`/jobs/${jobId}`);
}

export async function acceptQuote(formData: FormData) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const proId = String(formData.get("proId") ?? "");

  await supabase.from("quotes").update({ status: "accepted" }).eq("id", quoteId);
  await supabase
    .from("quotes")
    .update({ status: "declined" })
    .eq("job_id", jobId)
    .eq("status", "pending")
    .neq("id", quoteId);
  await supabase.from("jobs").update({ pro_id: proId, status: "accepted" }).eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
}
