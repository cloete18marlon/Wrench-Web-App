import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { tierLabel } from "@/lib/badges";
import { formatRand } from "@/lib/money";
import { initials } from "@/lib/pros";
import { BackButton } from "@/app/NavHistory";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Your dashboard · Wrenchy" };

const ACTIVE = new Set(["requested", "quoted", "accepted", "in_progress", "disputed"]);
const DONE = new Set(["completed", "released"]);

const STATUS_TEXT: Record<string, string> = {
  requested: "Waiting for quotes",
  quoted: "Quotes in",
  accepted: "Ready to pay",
  in_progress: "In progress",
  completed: "Completed",
  released: "Paid",
  disputed: "In dispute",
  cancelled: "Cancelled",
};
const STATUS_PILL: Record<string, string> = {
  requested: "warn", quoted: "warn", accepted: "warn", in_progress: "ok",
  completed: "ok", released: "ok", disputed: "fail", cancelled: "fail",
};

const sum = (rows: { amount: number | string }[]) => rows.reduce((a, r) => a + Number(r.amount), 0);

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: me }, { data: roles }, { data: proProfile }, { data: jobs }, { data: payments }] = await Promise.all([
    supabase.from("users").select("full_name, avatar_url").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("pro_profiles")
      .select("id, display_name, company_name, verification_tier")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("jobs")
      .select("id, title, status, created_at, trades(name)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("payments").select("amount, status").eq("customer_id", user.id),
  ]);

  const roleNames = (roles ?? []).map((r) => r.role as string);
  const isPro = roleNames.includes("pro");
  const isAdmin = roleNames.includes("admin");
  const name = me?.full_name || user.email?.split("@")[0] || "there";
  const twoFactorOn = !!user.factors?.some((f) => f.status === "verified");

  // ---- customer numbers
  const myJobs = jobs ?? [];
  const pay = payments ?? [];
  const spent = sum(pay.filter((p) => p.status === "released"));
  const inVault = sum(pay.filter((p) => p.status === "held"));
  const activeCount = myJobs.filter((j) => ACTIVE.has(j.status)).length;
  const doneCount = myJobs.filter((j) => DONE.has(j.status)).length;

  // ---- pro numbers (only fetched when relevant)
  const pro = proProfile
    ? await Promise.all([
        supabase.from("payouts").select("amount, status").eq("pro_id", proProfile.id),
        supabase.from("jobs").select("status").eq("pro_id", proProfile.id),
        supabase.from("reviews").select("rating").eq("pro_id", proProfile.id),
      ]).then(([payouts, proJobs, reviews]) => {
        const p = payouts.data ?? [];
        const r = (reviews.data ?? []).map((x) => Number(x.rating));
        return {
          earned: sum(p.filter((x) => x.status === "paid")),
          onTheWay: sum(p.filter((x) => x.status === "pending" || x.status === "processing")),
          jobsDone: (proJobs.data ?? []).filter((j) => DONE.has(j.status)).length,
          activeJobs: (proJobs.data ?? []).filter((j) => ACTIVE.has(j.status)).length,
          rating: r.length ? r.reduce((a, b) => a + b, 0) / r.length : null,
          reviewCount: r.length,
        };
      })
    : null;

  const { count: waitingApplications } = isAdmin
    ? await supabase.from("pro_profiles").select("id", { count: "exact", head: true }).eq("verification_tier", 0)
    : { count: 0 };

  return (
    <main>
      <section className="dash-hero">
        <div className="dash-hero-top">
          <BackButton tone="dark" fallback="/" />
          <Link href="/dashboard/profile" className="auth-pill">Edit profile</Link>
        </div>
        {me?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.avatar_url} alt="" className="avatar avatar-lg" />
        ) : (
          <span className="avatar avatar-lg" aria-hidden="true">{initials(name)}</span>
        )}
        <h1 className="dash-name">{name}</h1>
        <p className="dash-email">{user.email}</p>
        <ul className="role-chips" aria-label="Your roles">
          {(roleNames.length ? roleNames : ["customer"]).map((r) => (
            <li key={r}>{r === "pro" ? "Pro" : r === "admin" ? "Admin" : "Customer"}</li>
          ))}
        </ul>
      </section>

      {!twoFactorOn && (
        <Link href="/dashboard/profile" className="nudge">
          <span className="nudge-icon" aria-hidden="true">🔒</span>
          <span>
            <b>Protect your account</b>
            <span>Turn on two-step verification before you pay into the Vault.</span>
          </span>
        </Link>
      )}

      <h2 className="section-title">Your activity</h2>
      <div className="stat-grid">
        <div className="stat stat-wide stat-money">
          <span className="stat-label">Total spent</span>
          <span className="stat-value">{formatRand(spent)}</span>
          <span className="stat-hint">
            {inVault > 0 ? `${formatRand(inVault)} held in the Vault right now` : "Paid to pros for finished jobs"}
          </span>
        </div>
        <div className="stat">
          <span className="stat-label">Jobs posted</span>
          <span className="stat-value">{myJobs.length}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Active</span>
          <span className="stat-value">{activeCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">Completed</span>
          <span className="stat-value">{doneCount}</span>
        </div>
        <div className="stat">
          <span className="stat-label">In the Vault</span>
          <span className="stat-value">{formatRand(inVault)}</span>
        </div>
      </div>

      <nav className="quick-actions" aria-label="Quick actions">
        <Link href="/jobs/new"><span aria-hidden="true">＋</span>Post a job</Link>
        <Link href="/pros"><span aria-hidden="true">🔍</span>Find a pro</Link>
        <Link href="/jobs"><span aria-hidden="true">📋</span>My jobs</Link>
        <Link href="/messages"><span aria-hidden="true">💬</span>Chat</Link>
      </nav>

      <div className="section-head">
        <h2 className="section-title">Recent jobs</h2>
        {myJobs.length > 3 && <Link href="/jobs" className="section-link">See all</Link>}
      </div>
      {myJobs.length === 0 ? (
        <div className="card">
          <p>You haven&apos;t posted a job yet. Describe what needs doing and approved pros in that trade can quote.</p>
          <Link href="/jobs/new" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: "inline-block" }}>
            Post your first job
          </Link>
        </div>
      ) : (
        <ul className="job-list">
          {myJobs.slice(0, 3).map((j) => (
            <li key={j.id}>
              <Link href={`/jobs/${j.id}`} className="job-row">
                <span className="job-row-info">
                  <span className="job-row-title">{j.title}</span>
                  <span className="job-row-sub">{(j.trades as unknown as { name: string } | null)?.name}</span>
                </span>
                <span className={`pill ${STATUS_PILL[j.status] ?? "warn"}`}>{STATUS_TEXT[j.status] ?? j.status}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <Link href="/admin" className="card admin-card">
          <span>
            <b>Pro applications</b>
            <span className="row-note">
              {waitingApplications ? `${waitingApplications} waiting for review` : "Nothing waiting"}
            </span>
          </span>
          <span className={`pill ${waitingApplications ? "warn" : "ok"}`}>{waitingApplications ?? 0}</span>
        </Link>
      )}

      <h2 className="section-title">Work as a pro</h2>
      {proProfile && pro ? (
        <>
          <div className="stat-grid">
            <div className="stat stat-wide stat-money">
              <span className="stat-label">Total earned</span>
              <span className="stat-value">{formatRand(pro.earned)}</span>
              <span className="stat-hint">
                {pro.onTheWay > 0 ? `${formatRand(pro.onTheWay)} on its way to your bank` : "Paid out to your bank account"}
              </span>
            </div>
            <div className="stat">
              <span className="stat-label">Jobs done</span>
              <span className="stat-value">{pro.jobsDone}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Rating</span>
              <span className="stat-value">{pro.rating !== null ? `★ ${pro.rating.toFixed(1)}` : "New"}</span>
              <span className="stat-hint">{pro.reviewCount} {pro.reviewCount === 1 ? "review" : "reviews"}</span>
            </div>
          </div>
          <div className="card">
            <div className="row flush-row">
              <div>
                <div className="row-label">{proProfile.company_name || proProfile.display_name || "Your pro profile"}</div>
                <div className="row-note">
                  {isPro ? `${pro.activeJobs} active ${pro.activeJobs === 1 ? "job" : "jobs"}` : "Application under review"}
                </div>
              </div>
              <span className={`pill ${isPro ? "ok" : "warn"}`}>
                {isPro ? tierLabel(proProfile.verification_tier) : "Pending review"}
              </span>
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              {isPro && <Link href={`/pros/${proProfile.id}`} className="btn btn-sm">View public profile</Link>}
              <Link href="/dashboard/banking" className="btn btn-sm">Banking details</Link>
            </div>
          </div>
        </>
      ) : (
        <div className="card">
          <h3>Get hired for jobs</h3>
          <p>Apply to become a Wrenchy pro: set your trade, rate and service area.</p>
          <Link href="/dashboard/become-a-pro" className="btn btn-primary btn-sm" style={{ marginTop: 12, display: "inline-block" }}>
            Apply as a pro
          </Link>
        </div>
      )}

      <form action={logout} className="logout-row">
        <button className="btn btn-quiet" type="submit">Log out</button>
      </form>
    </main>
  );
}
