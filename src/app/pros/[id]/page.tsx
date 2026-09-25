import Link from "next/link";
import { BackButton } from "@/app/NavHistory";
import { ProAvatar } from "@/app/ProAvatar";
import { notFound } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { TIER_BADGE } from "@/lib/badges";
import { fetchApprovedPro, initials } from "@/lib/pros";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const dateFmt = new Intl.DateTimeFormat("en-ZA", { month: "short", year: "numeric" });

export default async function ProProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const supabase = await createServerSupabase();
  const [{ data: authData }, pro] = await Promise.all([
    supabase.auth.getUser(),
    fetchApprovedPro(supabase, id),
  ]);
  if (!pro) notFound();

  const user = authData.user;
  const badge = TIER_BADGE[pro.tier];
  const primaryTrade = pro.trades[0];

  // Jobs are posted per trade today: the request goes to every approved pro
  // in that trade, this one included. Pre-select the trade so the form is
  // one step shorter. Guests go through login first and land straight back.
  const quoteTarget = primaryTrade ? `/jobs/new?trade=${primaryTrade.id}` : "/jobs/new";
  const quoteHref = user ? quoteTarget : `/login?next=${encodeURIComponent(quoteTarget)}`;

  return (
    <main className="has-sticky">
      <section className="profile-hero">
        <div className="profile-top">
          <BackButton tone="dark" fallback="/pros" />
        </div>
        <ProAvatar url={pro.avatarUrl} name={pro.name} initials={initials(pro.name)} size="lg" />
        <h1 className="profile-name">{pro.name}</h1>
        <p className="profile-sub">
          {[pro.company, pro.trades.map((t) => t.name).join(", "), pro.hourlyRate !== null ? `R${pro.hourlyRate}/hr` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <dl className="profile-stats">
          <div>
            <dt>Rating</dt>
            <dd>{pro.rating !== null ? `★ ${pro.rating.toFixed(1)}` : "New"}</dd>
          </div>
          <div>
            <dt>Reviews</dt>
            <dd>{pro.reviewCount}</dd>
          </div>
          <div>
            <dt>Works within</dt>
            <dd>{pro.serviceRadiusKm} km</dd>
          </div>
        </dl>
      </section>

      {badge && (
        <div className="card badge-card">
          <span className={pro.tier >= 2 ? "badge-verified" : "badge-basic"}>✓ {badge.label}</span>
          <p>{badge.description}</p>
        </div>
      )}

      <section className="card">
        <h2 className="card-title">About</h2>
        <p>{pro.bio || "This pro hasn't added a description yet."}</p>
      </section>

      {pro.skills.length > 0 && (
        <section className="card">
          <h2 className="card-title">Skills</h2>
          <ul className="skill-pills">
            {pro.skills.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="card">
        <h2 className="card-title">Reviews</h2>
        {pro.reviews.length === 0 ? (
          <p>No reviews yet. Reviews appear here after a customer confirms a completed job.</p>
        ) : (
          <ul className="review-list">
            {pro.reviews.map((r, i) => (
              <li key={i} className="review">
                <div className="review-top">
                  <span>Wrenchy customer · {dateFmt.format(new Date(r.created_at))}</span>
                  <span className="rating" aria-label={`${r.rating} out of 5`}>
                    {"★".repeat(r.rating)}
                  </span>
                </div>
                {r.comment && <p>{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky-cta">
        <Link href={quoteHref} className="btn btn-primary">
          Request a quote
        </Link>
        <p className="cta-note">
          {primaryTrade
            ? `Your job goes to ${pro.name} and other approved ${primaryTrade.name.toLowerCase()} pros.`
            : "Your job goes to approved pros in the trade you choose."}
          {!user && " You'll log in first, then come straight back."}
        </p>
      </div>
    </main>
  );
}
