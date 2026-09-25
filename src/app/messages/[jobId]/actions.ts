"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase";

export type SendState = { error?: string; sentAt?: number };

const MAX_LENGTH = 2000;

export async function sendMessage(_prev: SendState, formData: FormData): Promise<SendState> {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const jobId = String(formData.get("jobId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return {};
  if (body.length > MAX_LENGTH) return { error: `Keep messages under ${MAX_LENGTH} characters.` };

  // messages_participant_insert is the real gate: sender must be the caller,
  // and the caller must be the job's customer or its assigned pro.
  const { error } = await supabase.from("messages").insert({ job_id: jobId, sender_id: user.id, body });
  if (error) return { error: "Message not sent. Check your connection and try again." };

  revalidatePath(`/messages/${jobId}`);
  revalidatePath("/messages");
  return { sentAt: Date.now() };
}
