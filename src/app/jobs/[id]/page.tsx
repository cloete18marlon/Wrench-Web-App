import Link from "next/link";
import { PageHeader } from "@/app/PageHeader";
import { notFound, redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";
import { QuoteForm } from "./QuoteForm";
import { PayIntoVaultButton } from "./PayIntoVaultButton";
import { ReleasePaymentButton } from "./ReleasePaymentButton";
import { acceptQuote } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_PILL: Record<string, "ok" | "warn" | "fail"> = {
  requested: "warn",
  quoted: "warn",
  accepted: "warn",
  in_progress: "ok",
  completed: "ok",
  released: "ok",
  disputed: "fail",
  cancelled: "fail",
};

type QuoteRow = {
  id: string;
  status: string;
  estimated_days: number | null;
  pro_id: string;
  pro_profiles: { display_name: string | null; company_name: string | null } | null;
  quote_line_items: { description: string; amount: number }[];
};

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: job } = await supabase
    .from("jobs")
    .select("id, title, description, status, budget_min, budget_max, preferred_date, customer_id, pro_id, trades(name)")
    .eq("id", id)
    .maybeSingle();

  if (!job) notFound();

  const isOwner = job.customer_id === user.id;

  const [{ data: quotes }, { data: proProfile }] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, status, estimated_days, pro_id, pro_profiles(display_name, company_name), quote_line_items(description, amount)")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("pro_profiles").select("id").eq("user_id", user.id).maybeSingle(),
  ]);

  const typedQuotes = (quotes ?? []) as unknown as QuoteRow[];
  const myQuote = proProfile ? typedQuotes.find((q) => q.pro_id === proProfile.id) : undefined;
  const canQuote = !isOwner && proProfile && !myQuote && job.status === "requested" && !job.pro_id;

  const { data: myPayout } =
    !isOwner && myQuote?.status === "accepted"
      ? await supabase.from("payouts").select("status, amount").eq("job_id", id).eq("pro_id", proProfile!.id).maybeSingle()
      : { data: null };

  return (
    <main>
      <PageHeader title="Job details" back="/jobs" />
      <div className="card">
        <h3>{job.title}</h3>
        <p className="row-note">{(job.trades as unknown as { name: string } | null)?.name}</p>
        {job.description && <p style={{ marginTop: 8 }}>{job.description}</p>}
        <div className="row">
          <div className="row-label">Status</div>
          <span className={`pill ${STATUS_PILL[job.status] ?? "warn"}`}>{job.status}</span>
        </div>
        {(job.budget_min || job.budget_max) && (
          <div className="row">
            <div className="row-label">Budget</div>
            <span className="mono" style={{ fontSize: 12 }}>
              R{job.budget_min ?? "?"} – R{job.budget_max ?? "?"}
            </span>
          </div>
        )}
        {job.preferred_date && (
          <div className="row">
            <div className="row-label">Preferred date</div>
            <span className="mono" style={{ fontSize: 12 }}>
              {job.preferred_date}
            </span>
          </div>
        )}
      </div>

      {job.pro_id && (isOwner || proProfile?.id === job.pro_id) && (
        <div className="card">
          <div className="row" style={{ padding: 0, border: "none" }}>
            <div className="row-label">{isOwner ? "Chat with your pro" : "Chat with the customer"}</div>
            <Link href={`/messages/${job.id}`} className="btn" style={{ padding: "8px 14px" }}>
              Open chat
            </Link>
          </div>
        </div>
      )}

      {isOwner && job.status === "accepted" && (
        <div className="card">
          <h3>Pay into the Vault</h3>
          <p>Your payment is held securely — the pro isn&apos;t paid until you confirm the job&apos;s done.</p>
          <div style={{ marginTop: 10 }}>
            <PayIntoVaultButton jobId={job.id} />
          </div>
        </div>
      )}

      {isOwner && job.status === "in_progress" && (
        <div className="card">
          <h3>Payment held in the Vault</h3>
          <p>Once the job&apos;s done, confirm below to release payment to the pro.</p>
          <div style={{ marginTop: 10 }}>
            <ReleasePaymentButton jobId={job.id} />
          </div>
        </div>
      )}

      {isOwner && job.status === "released" && (
        <div className="card">
          <h3>Payment released</h3>
          <p>The pro has been paid out.</p>
        </div>
      )}

      {isOwner && (
        <>
          <div className="label">Quotes</div>
          {typedQuotes.length > 0 ? (
            typedQuotes.map((quote) => {
              const total = quote.quote_line_items.reduce((sum, li) => sum + Number(li.amount), 0);
              return (
                <div className="card" key={quote.id}>
                  <h3>{quote.pro_profiles?.company_name || quote.pro_profiles?.display_name || "Pro"}</h3>
                  <p>R{total.toFixed(2)} {quote.estimated_days ? `· ${quote.estimated_days} days` : ""}</p>
                  <div className="row">
                    <div className="row-label">Status</div>
                    <span
                      className={`pill ${quote.status === "accepted" ? "ok" : quote.status === "declined" ? "fail" : "warn"}`}
                    >
                      {quote.status}
                    </span>
                  </div>
                  {quote.status === "pending" && job.status === "requested" && (
                    <form action={acceptQuote} style={{ marginTop: 10 }}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="quoteId" value={quote.id} />
                      <input type="hidden" name="proId" value={quote.pro_id} />
                      <button className="btn btn-primary" type="submit">
                        Accept this quote
                      </button>
                    </form>
                  )}
                </div>
              );
            })
          ) : (
            <div className="empty">
              <div className="icon">💬</div>
              <b>No quotes yet</b>
              <p>Pros in this trade can see your job and will quote soon.</p>
            </div>
          )}
        </>
      )}

      {!isOwner && myQuote && (
        <div className="card">
          <h3>Your quote</h3>
          <p>R{myQuote.quote_line_items.reduce((sum, li) => sum + Number(li.amount), 0).toFixed(2)}</p>
          <div className="row">
            <div className="row-label">Status</div>
            <span
              className={`pill ${myQuote.status === "accepted" ? "ok" : myQuote.status === "declined" ? "fail" : "warn"}`}
            >
              {myQuote.status}
            </span>
          </div>
        </div>
      )}

      {!isOwner && myPayout && (
        <div className="card">
          <h3>Payout</h3>
          <p>R{Number(myPayout.amount).toFixed(2)}</p>
          <div className="row">
            <div className="row-label">Status</div>
            <span className={`pill ${myPayout.status === "paid" ? "ok" : myPayout.status === "failed" ? "fail" : "warn"}`}>
              {myPayout.status}
            </span>
          </div>
        </div>
      )}

      {canQuote && (
        <>
          <div className="label">Send a quote</div>
          <QuoteForm jobId={job.id} />
        </>
      )}
    </main>
  );
}
