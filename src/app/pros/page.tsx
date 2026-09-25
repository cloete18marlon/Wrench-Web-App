import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { TIER_BADGE, VERIFIED_MIN_TIER } from "@/lib/badges";
import {
  PAGE_SIZE,
  TRADE_EMOJI,
  applyFilters,
  directoryHref,
  fetchApprovedPros,
  initials,
  parseFilters,
  type ProCard,
} from "@/lib/pros";

export const dynamic = "force-dynamic";

export const metadata = { title: "Find a pro · Wrenchy" };

export default async function DirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const f = parseFilters(await searchParams);
  const supabase = await createServerSupabase();

  const [{ data: authData }, { data: trades }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("trades").select("id, name").order("name"),
  ]);
  const user = authData.user;

  let pros: ProCard[] = [];
  let loadError: string | null = null;
  try {
    pros = await fetchApprovedPros(supabase);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "unknown error";
  }

  const matches = applyFilters(pros, f);
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const page = Math.min(f.page, pageCount);
  const shown = matches.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeFilters =
    (f.minRating ? 1 : 0) + (f.maxRate ? 1 : 0) + (f.verifiedOnly ? 1 : 0) + (f.sort !== "best" ? 1 : 0);

  return (
    <main>
      <header className="search-header">
        <div className="search-top">
          <Link href="/" className="round-btn" aria-label="Back to home">
            ←
          </Link>
          <h1 className="search-title">Find a pro</h1>
          {user ? (
            <Link href="/dashboard" className="auth-pill signed-in">
              Dashboard
            </Link>
          ) : (
            <Link href="/login?next=/pros" className="auth-pill">
              Log in
            </Link>
          )}
        </div>

        {!user && (
          <p className="guest-note">
            You&apos;re browsing as a guest. You&apos;ll only need an account to request a quote.
          </p>
        )}

        <form className="search-form" action="/pros" method="get" role="search">
          {f.trade && <input type="hidden" name="trade" value={f.trade} />}
          <div className="search-bar">
            <span aria-hidden="true">🔍</span>
            <label htmlFor="q" className="sr-only">
              Search pros
            </label>
            <input
              id="q"
              name="q"
              defaultValue={f.q}
              placeholder="Trade, company, skill or name"
              autoComplete="off"
            />
          </div>

          <details className="filter-panel" open={activeFilters > 0}>
            <summary>
              Filters{activeFilters > 0 && <span className="filter-badge">{activeFilters}</span>}
            </summary>
            <div className="filter-grid">
              <div className="field dark">
                <label htmlFor="minRating">Minimum rating</label>
                <select id="minRating" name="minRating" defaultValue={String(f.minRating || "")}>
                  <option value="">Any</option>
                  <option value="4">★ 4.0+</option>
                  <option value="4.5">★ 4.5+</option>
                  <option value="4.8">★ 4.8+</option>
                </select>
              </div>
              <div className="field dark">
                <label htmlFor="maxRate">Max hourly rate</label>
                <select id="maxRate" name="maxRate" defaultValue={String(f.maxRate || "")}>
                  <option value="">Any</option>
                  <option value="150">R150</option>
                  <option value="200">R200</option>
                  <option value="250">R250</option>
                  <option value="300">R300</option>
                  <option value="350">R350</option>
                </select>
              </div>
              <div className="field dark">
                <label htmlFor="sort">Sort by</label>
                <select id="sort" name="sort" defaultValue={f.sort}>
                  <option value="best">Best match</option>
                  <option value="rating">Highest rated</option>
                  <option value="priceLow">Price: low to high</option>
                  <option value="priceHigh">Price: high to low</option>
                </select>
              </div>
              <label className="toggle dark">
                <input type="checkbox" name="verified" value="1" defaultChecked={f.verifiedOnly} />
                <span>{TIER_BADGE[VERIFIED_MIN_TIER]?.label} pros only</span>
              </label>
            </div>
          </details>

          <button className="btn btn-primary search-submit" type="submit">
            Show pros
          </button>
        </form>
      </header>

      <nav className="trade-strip" aria-label="Filter by trade">
        <Link href={directoryHref({ ...f, trade: "", page: 1 })} className={`trade-pill${f.trade ? "" : " active"}`}>
          All trades
        </Link>
        {(trades ?? []).map((t) => (
          <Link
            key={t.id}
            href={directoryHref({ ...f, trade: t.name, page: 1 })}
            className={`trade-pill${f.trade === t.name ? " active" : ""}`}
            aria-current={f.trade === t.name ? "true" : undefined}
          >
            {TRADE_EMOJI[t.name] ?? "🔧"} {t.name}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <div className="card" style={{ borderColor: "var(--red)" }}>
          <h3 style={{ color: "var(--red)" }}>The directory didn&apos;t load</h3>
          <p className="mono" style={{ fontSize: 11.5 }}>{loadError}</p>
          <p style={{ marginTop: 8 }}>Refresh the page. If this keeps happening, the database may be paused.</p>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty">
          <div className="icon">🔧</div>
          <b>{pros.length === 0 ? "No pros listed yet" : "No pros match these filters"}</b>
          <p>
            {pros.length === 0
              ? "Approved pros will appear here as they join."
              : "Try a different trade, a broader search, or clear your filters."}
          </p>
          {pros.length > 0 && (
            <Link href="/pros" className="btn" style={{ display: "inline-block", marginTop: 14 }}>
              Clear filters
            </Link>
          )}
        </div>
      ) : (
        <>
          <p className="results-count">
            <b>
              {matches.length} {matches.length === 1 ? "pro" : "pros"}
            </b>
            {f.q ? ` matching “${f.q}”` : ""}
            {f.trade ? ` in ${f.trade}` : ""}
          </p>
          <ul className="pro-list">
            {shown.map((p) => (
              <li key={p.id}>
                <ProCardView pro={p} />
              </li>
            ))}
          </ul>
          {pageCount > 1 && (
            <nav className="pager" aria-label="Pages">
              {page > 1 ? (
                <Link className="btn" href={directoryHref({ ...f, page: page - 1 })}>
                  Previous
                </Link>
              ) : (
                <span />
              )}
              <span className="pager-state">
                Page {page} of {pageCount}
              </span>
              {page < pageCount ? (
                <Link className="btn" href={directoryHref({ ...f, page: page + 1 })}>
                  Next
                </Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </>
      )}

      <p className="footer">Distance search arrives once location is switched on.</p>
    </main>
  );
}

function ProCardView({ pro }: { pro: ProCard }) {
  const badge = TIER_BADGE[pro.tier];
  const trade = pro.trades[0]?.name;
  return (
    <Link href={`/pros/${pro.id}`} className="pro-card">
      <span className="avatar" aria-hidden="true">
        {initials(pro.name)}
      </span>
      <span className="pro-info">
        <span className="pro-top">
          <span className="pro-name">{pro.name}</span>
          {pro.hourlyRate !== null && <span className="pro-rate mono">R{pro.hourlyRate}/hr</span>}
        </span>
        <span className="pro-company">
          {trade ? `${TRADE_EMOJI[trade] ?? "🔧"} ` : ""}
          {pro.company || trade || "Independent"}
        </span>
        <span className="pro-meta">
          {pro.rating !== null ? (
            <span className="rating">
              ★ {pro.rating.toFixed(1)} <span className="muted">({pro.reviewCount})</span>
            </span>
          ) : (
            <span className="muted">New on Wrenchy</span>
          )}
          {badge && pro.tier >= VERIFIED_MIN_TIER && <span className="badge-verified">✓ {badge.label}</span>}
          {badge && pro.tier < VERIFIED_MIN_TIER && <span className="badge-basic">{badge.label}</span>}
        </span>
      </span>
    </Link>
  );
}
