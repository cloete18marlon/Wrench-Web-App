import { redirect } from "next/navigation";
import { PageHeader } from "@/app/PageHeader";
import { createServerSupabase } from "@/lib/supabase";
import { holdFmt, holdUntil } from "@/lib/security";
import { BankingForm } from "./BankingForm";

export const dynamic = "force-dynamic";

export default async function BankingPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: proProfile } = await supabase
    .from("pro_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!proProfile) redirect("/dashboard/become-a-pro");

  // Owner-only table (RLS). Nobody else, admins included, can read this row.
  const { data: account } = await supabase
    .from("pro_payout_accounts")
    .select("account_holder, bank_name, account_number, branch_code")
    .eq("pro_id", proProfile.id)
    .maybeSingle();

  const hold = await holdUntil(supabase, user.id);

  const existing = account
    ? {
        accountHolder: account.account_holder,
        bankName: account.bank_name,
        accountNumber: account.account_number,
        branchCode: account.branch_code,
      }
    : null;

  return (
    <main>
      <PageHeader title="Banking details" back="/dashboard" />
      <div style={{ padding: "0 20px" }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Wrenchy needs this to pay you out once a customer releases a job&apos;s payment.
        </p>
      </div>
      {hold ? (
        <p className="notice" style={{ margin: "12px 20px" }}>
          Your banking details are locked until {holdFmt.format(hold)} because you signed in with a recovery code.
          This stops anyone who got into your account from redirecting your payouts. If that sign-in wasn&apos;t
          you, contact Wrenchy support now.
        </p>
      ) : (
        <BankingForm existing={existing} />
      )}
    </main>
  );
}
