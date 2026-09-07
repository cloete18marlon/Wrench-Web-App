import { createServerSupabase } from "@/lib/supabase";
import { Logo } from "./logo";

// Always hit the database rather than serving a cached build-time snapshot.
export const dynamic = "force-dynamic";

const TRADE_EMOJI: Record<string, string> = {
  Painting: "🎨",
  Electrical: "⚡",
  Plumbing: "🚰",
  Carpentry: "🪚",
  Landscaping: "🌿",
  Cleaning: "🧹",
  Tiling: "🧱",
  Roofing: "🏠",
};

const STEPS = [
  ["Request a quote", "Describe the job, set your budget, and search pros within your radius."],
  ["Compare and accept", "Pros send quotes. Chat, compare, and accept the one you trust."],
  ["Pay into the Vault", "Your payment is held securely — the pro isn't paid until the job's done."],
  ["Confirm and release", "Job done? Confirm it and the Vault releases payment."],
];

export default async function Home() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: trades, error } = await supabase
    .from("trades")
    .select("id, name")
    .order("name");

  return (
    <main>
      <section className="hero">
        <Logo />
        <h1 className="brand">
          wrench<span className="y">y</span>
        </h1>
        <div className="tagline">Nailed it.</div>
        <p className="hero-sub">
          Find trusted, verified pros near you — or get hired for jobs in your area.
        </p>
      </section>

      <nav className="nav">
        {user ? (
          <a href="/dashboard">Dashboard</a>
        ) : (
          <>
            <a href="/login">Log in</a>
            <a href="/signup">Sign up</a>
          </>
        )}
        <a href="/status">System status</a>
      </nav>

      <div className="label">
        Trades {trades ? `· ${trades.length} loaded from the database` : ""}
      </div>

      {error ? (
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <h3 style={{ color: "var(--red)" }}>Trades didn&apos;t load</h3>
          <p className="mono" style={{ fontSize: 11.5 }}>{error.message}</p>
          <p style={{ marginTop: 8 }}>
            Check that NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
            are set, and that the trades table has a public read policy.
          </p>
        </div>
      ) : trades && trades.length > 0 ? (
        <div className="trades">
          {trades.map((t) => (
            <div className="chip" key={t.id}>
              <span className="emoji">{TRADE_EMOJI[t.name] ?? "🔧"}</span>
              {t.name}
            </div>
          ))}
        </div>
      ) : (
        <div className="empty">
          <div className="icon">🔧</div>
          <b>No trades yet</b>
          <p>The trades table is empty. Run the seed block in wrenchy_schema.sql.</p>
        </div>
      )}

      <div className="label">How it works</div>
      {STEPS.map(([title, body], i) => (
        <div className="card" key={title}>
          <h3>
            <span className="mono" style={{ color: "var(--blue)", marginRight: 8 }}>
              {String(i + 1).padStart(2, "0")}
            </span>
            {title}
          </h3>
          <p>{body}</p>
        </div>
      ))}

      <div className="footer">
        Gauteng · South Africa
        <br />
        Reading live from Supabase. Every query on this page is filtered by Row Level Security.
      </div>
    </main>
  );
}
