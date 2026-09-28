import { Logo } from "../logo";
import { BackButton } from "@/app/NavHistory";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const metadata = { title: "Reset your password · Wrenchy" };

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main>
      <section className="hero hero-compact">
        <div className="hero-back">
          <BackButton tone="dark" fallback="/login" />
        </div>
        <Logo size={48} />
        <h1 className="brand" style={{ fontSize: 26 }}>
          wrench<span className="y">y</span>
        </h1>
      </section>

      <div className="label" style={{ padding: "22px 0 8px" }}>
        Forgot your password?
      </div>

      <ForgotPasswordForm initialError={error} />
    </main>
  );
}
