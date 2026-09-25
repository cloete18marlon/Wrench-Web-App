import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { initials } from "@/lib/pros";
import { PageHeader } from "@/app/PageHeader";
import { unusedCodeCount } from "@/lib/recovery-codes";
import { holdFmt, holdUntil } from "@/lib/security";
import { AvatarEditor, EmailForm, NameForm, TwoFactorSection } from "./ProfileForms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit profile · Wrenchy" };

const addedFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric" });

export default async function EditProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ recovered?: string }>;
}) {
  const { recovered } = await searchParams;
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
  const verified = (factors?.totp ?? [])
    .filter((f) => f.status === "verified")
    .map((f) => ({ id: f.id, name: f.friendly_name || "Authenticator", added: addedFmt.format(new Date(f.created_at)) }));
  const [codesLeft, hold] = await Promise.all([
    verified.length ? unusedCodeCount(user.id) : Promise.resolve(0),
    holdUntil(supabase, user.id),
  ]);

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
        {hold && (
          <p className="notice">
            Security hold until {holdFmt.format(hold)}: banking details can&apos;t be changed and payouts are paused
            after a recovery-code sign-in. If that wasn&apos;t you, contact Wrenchy support now.
          </p>
        )}
        <TwoFactorSection factors={verified} codesLeft={codesLeft} recovered={recovered === "1"} />
      </section>
    </main>
  );
}
