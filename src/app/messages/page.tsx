import Link from "next/link";
import { PageHeader } from "@/app/PageHeader";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { initials } from "@/lib/pros";

export const dynamic = "force-dynamic";
export const metadata = { title: "Chat · Wrenchy" };

type JobRow = {
  id: string;
  title: string;
  customer_id: string;
  pro_id: string | null;
  pro_profiles: { display_name: string | null; company_name: string | null } | null;
};

const timeFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function MessagesPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/messages");

  const [{ data: myPro }, { data: jobs }, { count: waiting }] = await Promise.all([
    supabase.from("pro_profiles").select("id").eq("user_id", user.id).maybeSingle(),
    supabase
      .from("jobs")
      .select("id, title, customer_id, pro_id, pro_profiles(display_name, company_name)")
      .not("pro_id", "is", null)
      .order("updated_at", { ascending: false }),
    supabase
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("customer_id", user.id)
      .is("pro_id", null),
  ]);

  // A thread exists once a pro is assigned, between the customer and that pro only.
  const threads = ((jobs ?? []) as unknown as JobRow[]).filter(
    (j) => j.customer_id === user.id || (myPro && j.pro_id === myPro.id)
  );

  const { data: recent } = threads.length
    ? await supabase
        .from("messages")
        .select("job_id, body, is_system, sender_id, created_at")
        .in("job_id", threads.map((t) => t.id))
        .order("created_at", { ascending: false })
        .limit(300)
    : { data: [] };

  const last = new Map<string, { body: string; mine: boolean; at: string }>();
  for (const m of recent ?? []) {
    if (!last.has(m.job_id)) last.set(m.job_id, { body: m.body, mine: m.sender_id === user.id, at: m.created_at });
  }

  return (
    <main>
      <PageHeader title="Chat" back="/" />

      {threads.length === 0 ? (
        <div className="empty">
          <div className="icon">💬</div>
          <b>No conversations yet</b>
          <p>
            {waiting
              ? "Chat opens with a pro once you accept their quote. You have a job waiting on quotes."
              : "Chat opens once a quote is accepted, between you and the pro doing the job."}
          </p>
          <Link href={waiting ? "/jobs" : "/pros"} className="btn" style={{ display: "inline-block", marginTop: 14 }}>
            {waiting ? "View my jobs" : "Find a pro"}
          </Link>
        </div>
      ) : (
        <ul className="thread-list">
          {threads.map((t) => {
            const iAmCustomer = t.customer_id === user.id;
            const other = iAmCustomer
              ? t.pro_profiles?.display_name || t.pro_profiles?.company_name || "Your pro"
              : "Customer";
            const l = last.get(t.id);
            return (
              <li key={t.id}>
                <Link href={`/messages/${t.id}`} className="thread-row">
                  <span className="avatar avatar-sm" aria-hidden="true">
                    {initials(other)}
                  </span>
                  <span className="thread-info">
                    <span className="thread-top">
                      <span className="thread-name">{other}</span>
                      {l && <span className="thread-time">{timeFmt.format(new Date(l.at))}</span>}
                    </span>
                    <span className="thread-job">{t.title}</span>
                    <span className="thread-preview">
                      {l ? `${l.mine ? "You: " : ""}${l.body}` : "No messages yet. Say hello."}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
