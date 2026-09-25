"use server";

import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type BankingState = { error?: string; success?: boolean };

export async function saveBankingDetails(
  _prevState: BankingState,
  formData: FormData
): Promise<BankingState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const accountHolder = String(formData.get("accountHolder") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const branchCode = String(formData.get("branchCode") ?? "").trim();

  if (!accountHolder || !bankName || !accountNumber || !branchCode) {
    return { error: "Fill in every field." };
  }

  const { data: proProfile } = await supabase
    .from("pro_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!proProfile) return { error: "Apply as a pro before adding banking details." };

  const { error } = await supabase.from("pro_payout_accounts").upsert(
    {
      pro_id: proProfile.id,
      account_holder: accountHolder,
      bank_name: bankName,
      account_number: accountNumber,
      branch_code: branchCode,
    },
    { onConflict: "pro_id" }
  );

  if (error) return { error: error.message };

  return { success: true };
}
