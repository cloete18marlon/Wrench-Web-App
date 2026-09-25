import Link from "next/link";
import { BackButton } from "@/app/NavHistory";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { AutoRefresh, Composer } from "./Composer";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const timeFmt = new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default async function ThreadPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  if (!UUID.test(jobId)) notFound();

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/messages/${jobId}`);

  const [{ data: job }, { data: myPro }] = await Promise.all([
    supabase
      .from("jobs")
      .select("id, title, customer_id, pro_id, pro_profiles(display_name, company_name)")
      .eq("id", jobId)
      .maybeSingle(),
    supabase.from("pro_profiles").select("id").eq("user_id", user.id).maybeSingle(),
  ]);
  if (!job) notFound();

  const iAmCustomer = job.customer_id === user.id;
  const iAmPro = !!myPro && job.pro_id === myPro.id;

  if (!job.pro_id || (!iAmCustomer && !iAmPro)) {
    return (
      <main>
        <header className="page-head">
          <BackButton fallback="/messages" />
          <h1>{job.title}</h1>
        </header>
        <div className="empty">
          <div className="icon">💬</div>
          <b>Chat isn&apos;t open for this job yet</b>
          <p>It opens between the customer and the pro once a quote is accepted.</p>
          <Link href={`/jobs/${job.id}`} className="btn" style={{ display: "inline-block", marginTop: 14 }}>
            View the job
          </Link>
        </div>
      </main>
    );
  }

  const pro = job.pro_profiles as unknown as { display_name: string | null; company_name: string | null } | null;
  const other = iAmCustomer ? pro?.display_name || pro?.company_name || "Your pro" : "Customer";

  const { data: messages } = await supabase
    .from("messages")
    .select("id, body, is_system, sender_id, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .limit(300);

  return (
    <main className="thread-page">
      <header className="page-head">
        <BackButton fallback="/messages" />
        <div>
          <h1>{other}</h1>
          <Link href={`/jobs/${job.id}`} className="page-sub">{job.title}</Link>
        </div>
      </header>

      <ol className="chat-body" aria-live="polite">
        {(messages ?? []).length === 0 && (
          <li className="msg system">Messages here are only visible to you and {other}.</li>
        )}
        {(messages ?? []).map((m) =>
          m.is_system ? (
            <li key={m.id} className="msg system">{m.body}</li>
          ) : (
            <li key={m.id} className={`msg ${m.sender_id === user.id ? "me" : "them"}`}>
              {m.body}
              <time className="msg-time" dateTime={m.created_at}>{timeFmt.format(new Date(m.created_at))}</time>
            </li>
          )
        )}
      </ol>

      <Composer jobId={job.id} />
      <AutoRefresh />
    </main>
  );
}
