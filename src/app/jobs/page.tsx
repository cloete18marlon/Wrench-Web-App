import Link from "next/link";
import { PageHeader } from "@/app/PageHeader";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, "ok" | "warn" | "fail"> = {
  requested: "warn",
  quoted: "warn",
  accepted: "ok",
  in_progress: "ok",
  completed: "ok",
  released: "ok",
  disputed: "fail",
  cancelled: "fail",
};

export default async function JobsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
  const isPro = (roles ?? []).some((r) => r.role === "pro");

  const [{ data: myJobs }, { data: openJobs }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, status, trades(name)")
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false }),
    isPro
      ? supabase
          .from("jobs")
          .select("id, title, status, budget_min, budget_max, trades(name)")
          .is("pro_id", null)
          .eq("status", "requested")
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ]);

  return (
    <main>
      <PageHeader
        title="My jobs"
        back="/dashboard"
        action={
          <Link href="/jobs/new" className="btn btn-primary btn-sm">
            Post a job
          </Link>
        }
      />
      <div className="label">Jobs you posted</div>

      {myJobs && myJobs.length > 0 ? (
        myJobs.map((job) => (
          <Link key={job.id} href={`/jobs/${job.id}`} className="card" style={{ display: "block" }}>
            <div className="row" style={{ padding: 0, border: "none" }}>
              <div>
                <h3>{job.title}</h3>
                <p className="row-note">{(job.trades as unknown as { name: string } | null)?.name}</p>
              </div>
              <span className={`pill ${STATUS_PILL[job.status] ?? "warn"}`}>{job.status}</span>
            </div>
          </Link>
        ))
      ) : (
        <div className="empty">
          <div className="icon">🔧</div>
          <b>No jobs yet</b>
          <p>Post a job to start getting quotes from pros.</p>
        </div>
      )}

      {isPro && (
        <>
          <div className="label">Open jobs in your trades</div>
          {openJobs && openJobs.length > 0 ? (
            openJobs.map((job) => (
              <Link key={job.id} href={`/jobs/${job.id}`} className="card" style={{ display: "block" }}>
                <h3>{job.title}</h3>
                <p className="row-note">{(job.trades as unknown as { name: string } | null)?.name}</p>
                {(job.budget_min || job.budget_max) && (
                  <p style={{ fontSize: 12.5, color: "var(--ink-soft)", marginTop: 4 }}>
                    Budget: R{job.budget_min ?? "?"} – R{job.budget_max ?? "?"}
                  </p>
                )}
              </Link>
            ))
          ) : (
            <div className="empty">
              <div className="icon">📭</div>
              <b>No open jobs right now</b>
              <p>Nothing matching your trades is open for quotes at the moment.</p>
            </div>
          )}
        </>
      )}
    </main>
  );
}
