import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
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
    .select("payout_details")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!proProfile) redirect("/dashboard/become-a-pro");

  return (
    <main>
      <div className="label" style={{ padding: "22px 20px 8px" }}>
        Banking details
      </div>
      <div style={{ padding: "0 20px" }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Wrenchy needs this to pay you out once a customer releases a job&apos;s payment.
        </p>
      </div>
      <BankingForm existing={proProfile.payout_details as never} />
    </main>
  );
}
