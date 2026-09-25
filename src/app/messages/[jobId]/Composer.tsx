"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { sendMessage, type SendState } from "./actions";

const initialState: SendState = {};

export function Composer({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(sendMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.sentAt) formRef.current?.reset();
  }, [state.sentAt]);

  return (
    <form ref={formRef} action={formAction} className="composer">
      <input type="hidden" name="jobId" value={jobId} />
      <label htmlFor="body" className="sr-only">
        Message
      </label>
      <input id="body" name="body" placeholder="Type a message" autoComplete="off" maxLength={2000} required />
      <button type="submit" className="send-btn" disabled={pending} aria-label="Send message">
        ➤
      </button>
      {state.error && <p className="error-text composer-error">{state.error}</p>}
    </form>
  );
}

/**
 * Picks up the other person's replies by re-rendering every few seconds
 * while the tab is visible. A stopgap: Supabase Realtime replaces this when
 * messaging gets its proper build (Week 12).
 */
export function AutoRefresh({ seconds = 8 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
