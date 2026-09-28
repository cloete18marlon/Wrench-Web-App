import Link from "next/link";
import { Logo } from "../logo";
import { createServerSupabase } from "@/lib/supabase";
import { hasFreshRecovery, PASSWORD_MIN } from "@/lib/password-reset";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Choose a new password · Wrenchy" };

// Reached from the emailed link via /auth/callback or /auth/confirm, which
// sign the user into a short-lived recovery session. If they have two-step
// verification on, src/proxy.ts sends them to /login/mfa first and back here.
export default async function ResetPasswordPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const allowed = !!user && (await hasFreshRecovery(supabase));

  return (
    <main>
      <section className="hero hero-compact">
        <Logo size={48} />
        <h1 className="brand" style={{ fontSize: 26 }}>
          wrench<span className="y">y</span>
        </h1>
      </section>

      <div className="label" style={{ padding: "22px 0 8px" }}>
        Choose a new password
      </div>

      {allowed ? (
        <ResetPasswordForm email={user!.email ?? ""} min={PASSWORD_MIN} />
      ) : (
        <div className="form">
          <p className="notice">
            This page only works from a password reset link, and each link works for one hour. Request a new one and
            open it from your email.
          </p>
          <Link className="btn btn-primary" href="/forgot-password">
            Send me a new link
          </Link>
        </div>
      )}
    </main>
  );
}
