import { createServerSupabase } from "@/lib/supabase";
import { PageHeader } from "@/app/PageHeader";
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
      <PageHeader title="Post a job" back="/jobs" />
      <PostJobForm
        trades={trades ?? []}
        defaultTradeId={trades?.some((t) => t.id === trade) ? trade : undefined}
      />
    </main>
  );
}
