import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase";
import { logout } from "../login/actions";

export const dynamic = "force-dynamic";

const TIER_LABEL: Record<number, string> = {
  0: "Not verified yet",
  1: "ID verified",
  2: "Background checked",
  3: "Fully verified",
};

export default async function DashboardPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: profile }, { data: roles }, { data: proProfile }] = await Promise.all([
    supabase.from("users").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase
      .from("pro_profiles")
      .select("company_name, bio, hourly_rate, service_radius_km, verification_tier")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const roleNames = roles?.map((r) => r.role) ?? [];
  const isPro = roleNames.includes("pro");
  const isAdmin = roleNames.includes("admin");

  return (
    <main>
      <section className="hero hero-compact">
        <h1 className="brand" style={{ fontSize: 26 }}>
          Hi, {profile?.full_name ?? "there"}
        </h1>
        <div className="tagline">{roleNames.join(" · ") || "customer"}</div>
      </section>

      <div className="label">Your account</div>
      <div className="card">
        <div className="row">
          <div>
            <div className="row-label">Email</div>
          </div>
          <span className="mono" style={{ fontSize: 12 }}>
            {user.email}
          </span>
        </div>
        <div className="row">
          <div>
            <div className="row-label">Roles</div>
          </div>
          <span className="mono" style={{ fontSize: 12 }}>
            {roleNames.join(", ") || "customer"}
          </span>
        </div>
      </div>

      <div className="label">Jobs</div>
      <div className="card">
        <div className="row">
          <div className="row-label">Post a job or check on quotes</div>
          <Link href="/jobs" className="btn" style={{ padding: "8px 14px" }}>
            My jobs
          </Link>
        </div>
        {isPro && (
          <div className="row">
            <div className="row-label">Open jobs in your trades</div>
            <Link href="/jobs" className="btn" style={{ padding: "8px 14px" }}>
              Browse
            </Link>
          </div>
        )}
      </div>

      {isAdmin && (
        <div className="card">
          <div className="row">
            <div className="row-label">Pro applications waiting on you</div>
            <Link href="/admin" className="btn btn-primary" style={{ padding: "8px 14px" }}>
              Review
            </Link>
          </div>
        </div>
      )}

      <div className="label">Work as a pro</div>
      {proProfile ? (
        <div className="card">
          <h3>{proProfile.company_name || "Your pro application"}</h3>
          <p>{proProfile.bio || "No bio yet."}</p>
          <div className="row">
            <div className="row-label">Status</div>
            <span className={`pill ${isPro ? "ok" : "warn"}`}>
              {isPro ? "Approved" : TIER_LABEL[proProfile.verification_tier] ?? "Pending review"}
            </span>
          </div>
          <Link href="/dashboard/banking" className="btn" style={{ marginTop: 10, display: "inline-block" }}>
            Banking details
          </Link>
        </div>
      ) : (
        <div className="card">
          <h3>Get hired for jobs</h3>
          <p>Apply to become a Wrenchy pro — set your trade, rate, and service area.</p>
          <Link href="/dashboard/become-a-pro" className="btn btn-primary" style={{ marginTop: 10, display: "inline-block" }}>
            Apply as a pro
          </Link>
        </div>
      )}

      <form action={logout} style={{ padding: "8px 20px 30px" }}>
        <button className="btn" type="submit">
          Log out
        </button>
      </form>
    </main>
  );
}
