import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { initials } from "@/lib/pros";
import { PageHeader } from "@/app/PageHeader";
import { AvatarEditor, EmailForm, NameForm, TwoFactorSection } from "./ProfileForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit profile · Wrenchy" };

export default async function EditProfilePage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard/profile");

  const [{ data: me }, { data: factors }] = await Promise.all([
    supabase.from("users").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.auth.mfa.listFactors(),
  ]);
  const name = me?.full_name ?? "";
  const twoFactorOn = !!factors?.totp.some((f) => f.status === "verified");

  return (
    <main>
      <PageHeader title="Edit profile" back="/dashboard" />

      <section className="card">
        <h2 className="card-title">Photo</h2>
        <AvatarEditor current={me?.avatar_url ?? null} initials={initials(name || user.email || "?")} />
      </section>

      <section className="card">
        <h2 className="card-title">Your details</h2>
        <NameForm current={name} />
      </section>

      <section className="card">
        <h2 className="card-title">Email</h2>
        <EmailForm current={user.email ?? ""} pending={user.new_email ?? null} />
      </section>

      <section className="card">
        <h2 className="card-title">Security</h2>
        <TwoFactorSection enabled={twoFactorOn} />
      </section>
    </main>
  );
}
