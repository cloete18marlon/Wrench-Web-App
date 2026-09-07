"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { createCheckout, createPayout, type PayoutBankDetails } from "@/lib/peach";
import { splitCommission } from "@/lib/money";
import { siteUrl } from "@/lib/site";

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

export type PaymentState = { error?: string };

export async function initiatePayment(_prevState: PaymentState, formData: FormData): Promise<PaymentState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return { error: "Something went wrong loading this job — try again." };
  if (!job || job.customer_id !== user.id) return { error: "Job not found." };
  if (job.status !== "accepted") return { error: "This job isn't awaiting payment." };

  const { data: quote, error: quoteLookupError } = await supabase
    .from("quotes")
    .select("id, quote_line_items(amount)")
    .eq("job_id", jobId)
    .eq("status", "accepted")
    .maybeSingle();
  if (quoteLookupError) return { error: "Something went wrong loading the quote — try again." };
  if (!quote) return { error: "No accepted quote found for this job." };

  const total = (quote.quote_line_items as { amount: number }[]).reduce(
    (sum, li) => sum + Number(li.amount),
    0
  );
  if (total <= 0) return { error: "Quote amount is invalid." };

  const admin = createAdminSupabase();
  const { data: payment, error: paymentError } = await admin
    .from("payments")
    .insert({
      job_id: jobId,
      quote_id: quote.id,
      customer_id: user.id,
      amount: total,
      status: "pending",
      provider: "peach",
    })
    .select("id")
    .single();
  if (paymentError) return { error: paymentError.message };

  let redirectUrl: string;
  try {
    const checkout = await createCheckout({
      amount: total,
      currency: "ZAR",
      merchantTransactionId: payment.id,
      notificationUrl: `${siteUrl}/api/webhooks/peach/checkout`,
      shopperResultUrl: `${siteUrl}/jobs/${jobId}`,
    });
    await admin.from("payments").update({ provider_reference: checkout.checkoutId }).eq("id", payment.id);
    redirectUrl = checkout.redirectUrl;
  } catch (err) {
    await admin.from("payments").update({ status: "failed" }).eq("id", payment.id);
    return { error: err instanceof Error ? err.message : "Could not start payment." };
  }

  redirect(redirectUrl);
}

export async function releasePayment(_prevState: PaymentState, formData: FormData): Promise<PaymentState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, customer_id, pro_id, status")
    .eq("id", jobId)
    .maybeSingle();
  if (jobError) return { error: "Something went wrong loading this job — try again." };
  if (!job || job.customer_id !== user.id) return { error: "Job not found." };
  if (job.status !== "in_progress") return { error: "This job isn't ready to release." };
  if (!job.pro_id) return { error: "No pro assigned to this job." };

  const admin = createAdminSupabase();

  const { data: payment, error: paymentLookupError } = await admin
    .from("payments")
    .select("id, amount")
    .eq("job_id", jobId)
    .eq("status", "held")
    .maybeSingle();
  if (paymentLookupError) return { error: "Something went wrong loading the payment — try again." };
  if (!payment) return { error: "No held payment found for this job." };

  const { data: proProfile, error: proProfileError } = await admin
    .from("pro_profiles")
    .select("payout_details")
    .eq("id", job.pro_id)
    .maybeSingle();
  if (proProfileError) return { error: "Something went wrong loading the pro's profile — try again." };

  const bankDetails = proProfile?.payout_details as PayoutBankDetails | null;
  if (!bankDetails?.accountNumber) {
    return { error: "This pro hasn't added banking details yet — ask them to add them before releasing." };
  }

  const { commission, payout } = splitCommission(Number(payment.amount));

  const { data: payoutRow, error: payoutInsertError } = await admin
    .from("payouts")
    .insert({ pro_id: job.pro_id, job_id: jobId, amount: payout, status: "pending" })
    .select("id")
    .single();
  if (payoutInsertError) return { error: payoutInsertError.message };

  // Attempt the actual payout BEFORE touching the ledger/payment/job status —
  // if Peach rejects it, nothing else should look like money moved.
  let payoutId: string;
  try {
    const result = await createPayout({ amount: payout, currency: "ZAR", reference: payoutRow.id, bankDetails });
    payoutId = result.payoutId;
  } catch (err) {
    await admin.from("payouts").update({ status: "failed" }).eq("id", payoutRow.id);
    return {
      error: `Could not start the payout: ${err instanceof Error ? err.message : "unknown error"}. Nothing has been released — try again once this is fixed.`,
    };
  }

  await admin
    .from("payouts")
    .update({ status: "processing", provider_reference: payoutId })
    .eq("id", payoutRow.id);

  await admin.from("ledger_entries").insert([
    {
      job_id: jobId,
      payment_id: payment.id,
      entry_type: "release",
      account: "vault",
      amount: -Number(payment.amount),
    },
    { job_id: jobId, payment_id: payment.id, entry_type: "commission", account: "wrenchy_revenue", amount: commission },
    { job_id: jobId, payment_id: payment.id, entry_type: "payout", account: "pro_payable", amount: payout },
  ]);

  await admin.from("payments").update({ status: "released" }).eq("id", payment.id);
  await supabase.from("jobs").update({ status: "released" }).eq("id", jobId);

  revalidatePath(`/jobs/${jobId}`);
  return {};
}
