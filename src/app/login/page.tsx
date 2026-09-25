import { Logo } from "../logo";
import { LoginForm } from "./LoginForm";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;

  return (
    <main>
      <section className="hero hero-compact">
        <Logo size={48} />
        <h1 className="brand" style={{ fontSize: 26 }}>
          wrench<span className="y">y</span>
        </h1>
      </section>

      <div className="label" style={{ padding: "22px 0 8px" }}>
        Log in
      </div>

      <LoginForm next={next ?? "/dashboard"} initialError={error} />
    </main>
  );
}
