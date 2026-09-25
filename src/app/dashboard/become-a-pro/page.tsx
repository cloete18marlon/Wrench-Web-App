import { redirect } from "next/navigation";
import { PageHeader } from "@/app/PageHeader";
import { createServerSupabase } from "@/lib/supabase";
import { BecomeProForm } from "./BecomeProForm";

export const dynamic = "force-dynamic";

export default async function BecomeAProPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: existingProfile }, { data: trades }] = await Promise.all([
    supabase.from("pro_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase.from("trades").select("id, name").order("name"),
  ]);

  if (existingProfile) redirect("/dashboard");

  return (
    <main>
      <PageHeader title="Apply as a pro" back="/dashboard" />
      <div style={{ padding: "0 20px" }}>
        <p style={{ fontSize: 13, color: "var(--ink-soft)", lineHeight: 1.55 }}>
          Submitting this doesn&apos;t make you a pro yet — Wrenchy verifies applicants before
          approving the pro role.
        </p>
      </div>
      <BecomeProForm trades={trades ?? []} />
    </main>
  );
}
