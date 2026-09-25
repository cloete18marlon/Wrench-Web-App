import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";
import { logout } from "../actions";
import { MfaForm } from "./MfaForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Enter your code · Wrenchy" };

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel === "aal2" || aal?.nextLevel !== "aal2") redirect(next);

  return (
    <main>
      <section className="hero hero-compact">
        <h1 className="brand" style={{ fontSize: 24 }}>Two-step verification</h1>
        <p className="hero-sub" style={{ marginTop: 10 }}>
          Open your authenticator app and enter the code for Wrenchy.
        </p>
      </section>
      <div style={{ height: 18 }} />
      <MfaForm next={next} />
      <form action={logout} className="link-row">
        No phone and no recovery codes? Contact Wrenchy support.
        <br />
        Not you?{" "}
        <button type="submit" className="link-btn">Log out</button>
      </form>
    </main>
  );
}
