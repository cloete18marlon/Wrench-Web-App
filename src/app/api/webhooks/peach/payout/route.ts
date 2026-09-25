import { NextResponse } from "next/server";
import { createAdminSupabase } from "@/lib/supabase-admin";
import { verifyWebhookSignature } from "@/lib/peach";
import { parseWebhookBody } from "@/lib/webhook-body";

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
  // Payouts webhook payload from Peach before relying on this.
  const body = parseWebhookBody(rawBody, request.headers.get("content-type"));
  const reference = String(body.reference ?? "");
  const status = String(body.status ?? "").toLowerCase();

  if (!reference) {
    return new NextResponse("Missing reference", { status: 400 });
  }

  // reference is set to our own payouts.id when the payout is created, for
  // the same reason merchantTransactionId is on the checkout side.
  const supabase = createAdminSupabase();
  const { data: payout, error: lookupError } = await supabase
    .from("payouts")
    .select("id, job_id, pro_id, amount, status")
    .eq("id", reference)
    .maybeSingle();

  if (lookupError) {
    console.error("Peach payout webhook: payout lookup failed", lookupError);
    return new NextResponse("Lookup failed", { status: 500 });
  }
  if (!payout) {
    return new NextResponse("Unknown payout", { status: 404 });
  }

  if (payout.status === "paid" || payout.status === "failed") {
    return NextResponse.json({ ok: true });
  }

  let updateError = null;
  if (status === "paid" || status === "success" || status === "successful") {
    ({ error: updateError } = await supabase
      .from("payouts")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", payout.id));
  } else if (status === "failed" || status === "error") {
    ({ error: updateError } = await supabase.from("payouts").update({ status: "failed" }).eq("id", payout.id));
  }

  if (updateError) {
    console.error("Peach payout webhook: state update failed", updateError);
    return new NextResponse("Update failed", { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
