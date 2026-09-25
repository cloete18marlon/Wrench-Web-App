import { createServerSupabase } from "@/lib/supabase";
import { PostJobForm } from "./PostJobForm";

export const dynamic = "force-dynamic";

export default async function NewJobPage({
  searchParams,
}: {
  searchParams: Promise<{ trade?: string }>;
}) {
  const { trade } = await searchParams;
  const supabase = await createServerSupabase();
  const { data: trades } = await supabase.from("trades").select("id, name").order("name");

  return (
    <main>
      <div className="label" style={{ padding: "22px 20px 8px" }}>
        Post a job
      </div>
      <PostJobForm
        trades={trades ?? []}
        defaultTradeId={trades?.some((t) => t.id === trade) ? trade : undefined}
      />
    </main>
  );
}
