import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { approvePro } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: myRoles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isAdmin = (myRoles ?? []).some((r) => r.role === "admin");
  if (!isAdmin) redirect("/dashboard");

  const [{ data: applicants }, { data: proRoles }] = await Promise.all([
    supabase
      .from("pro_profiles")
      .select("id, user_id, display_name, company_name, bio, verification_tier, pro_trades(trades(name))")
      .order("created_at", { ascending: true }),
    supabase.from("user_roles").select("user_id").eq("role", "pro"),
  ]);

  const approvedUserIds = new Set((proRoles ?? []).map((r) => r.user_id));

  return (
    <main>
      <div className="label" style={{ padding: "22px 20px 8px" }}>
        Pro applications
      </div>

      {applicants && applicants.length > 0 ? (
        applicants.map((app) => {
          const isApproved = approvedUserIds.has(app.user_id);
          const trades = (app.pro_trades as unknown as { trades: { name: string } | null }[]) ?? [];
          return (
            <div className="card" key={app.id}>
              <h3>{app.display_name ?? "Applicant"}</h3>
              {app.company_name && <p className="row-note">{app.company_name}</p>}
              <p style={{ marginTop: 6 }}>{app.bio || "No bio provided."}</p>
              <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 6 }}>
                {trades.map((t) => t.trades?.name).filter(Boolean).join(", ") || "No trades listed"}
              </p>
              <div className="row">
                <div className="row-label">Status</div>
                <span className={`pill ${isApproved ? "ok" : "warn"}`}>
                  {isApproved ? "Approved" : "Pending"}
                </span>
              </div>
              {!isApproved && (
                <form action={approvePro} style={{ marginTop: 10 }}>
                  <input type="hidden" name="userId" value={app.user_id} />
                  <input type="hidden" name="proProfileId" value={app.id} />
                  <button className="btn btn-primary" type="submit">
                    Approve as pro
                  </button>
                </form>
              )}
            </div>
          );
        })
      ) : (
        <div className="empty">
          <div className="icon">📋</div>
          <b>No applications yet</b>
        </div>
      )}
    </main>
  );
}
