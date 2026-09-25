import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/peach";
import { parseWebhookBody } from "@/lib/webhook-body";

// Peach Payments' Checkout is believed to be built on the OPPWA platform,
// which uses this result-code convention for success/pending-success. Not
// independently confirmed for Peach specifically — check real sandbox
// responses before trusting this.
function isSuccessResultCode(code: string): boolean {
  return /^(000\.000\.|000\.100\.1|000\.[36])/.test(code);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const timestamp = request.headers.get("x-webhook-timestamp") ?? "";
  const signature = request.headers.get("x-webhook-signature") ?? "";
  const secret = process.env.PEACH_WEBHOOK_SECRET;

  if (!secret) {
    console.error("PEACH_WEBHOOK_SECRET is not set");
    return new NextResponse("Webhook not configured", { status: 500 });
  }

  const valid = await verifyWebhookSignature({
    rawBody,
    url: request.url,
    timestamp,
    signature,
    secret,
  });
  if (!valid) {
    return new NextResponse("Invalid signature", { status: 401 });
  }

  // TODO(verify): field names are best-guess — confirm against a real
  // Checkout webhook payload from Peach before relying on this.
  const body = parseWebhookBody(rawBody, request.headers.get("content-type"));
  const merchantTransactionId = String(body.merchantTransactionId ?? "");
  const resultCode = String(
    (body as { result?: { code?: string } }).result?.code ?? body.resultCode ?? ""
  );

  if (!merchantTransactionId) {
    return new NextResponse("Missing merchantTransactionId", { status: 400 });
  }

  // merchantTransactionId is set to our own payments.id when the checkout is
  // created, specifically so we don't depend on guessing Peach's own
  // provider-reference field name to find the row back.
  const supabase = createAdminSupabase();
  const { data: payment, error: lookupError } = await supabase
    .from("payments")
    .select("id, job_id, amount, status")
    .eq("id", merchantTransactionId)
    .maybeSingle();

  if (lookupError) {
    console.error("Peach checkout webhook: payment lookup failed", lookupError);
    return new NextResponse("Lookup failed", { status: 500 });
  }
  if (!payment) {
    return new NextResponse("Unknown payment", { status: 404 });
  }

  if (payment.status !== "pending") {
    // Not guaranteed to be delivered once or in order — a repeat is a no-op.
    return NextResponse.json({ ok: true });
  }

  if (isSuccessResultCode(resultCode)) {
    const results = await Promise.all([
      supabase.from("payments").update({ status: "held" }).eq("id", payment.id),
      supabase.from("ledger_entries").insert({
        job_id: payment.job_id,
        payment_id: payment.id,
        entry_type: "hold",
        account: "vault",
        amount: payment.amount,
      }),
      supabase.from("jobs").update({ status: "in_progress" }).eq("id", payment.job_id),
    ]);
    const writeError = results.find((r) => r.error)?.error;
    if (writeError) {
      console.error("Peach checkout webhook: state update failed", writeError);
      return new NextResponse("Update failed", { status: 500 });
    }
  } else {
    const { error: failError } = await supabase.from("payments").update({ status: "failed" }).eq("id", payment.id);
    if (failError) {
      console.error("Peach checkout webhook: failure-state update failed", failError);
      return new NextResponse("Update failed", { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
