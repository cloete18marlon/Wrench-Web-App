"use client";

import { useActionState } from "react";
import { submitQuote, type QuoteState } from "./actions";

const initialState: QuoteState = {};

export function QuoteForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(submitQuote, initialState);

  return (
    <form className="form" action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />

      <div className="field">
        <label htmlFor="amount">Quote amount (ZAR)</label>
        <input id="amount" name="amount" type="number" min={0} step="0.01" required />
      </div>

      <div className="field">
        <label htmlFor="estimatedDays">Estimated days</label>
        <input id="estimatedDays" name="estimatedDays" type="number" min={0} step="0.5" />
      </div>

      <div className="field">
        <label htmlFor="description">Notes for the customer</label>
        <textarea id="description" name="description" rows={3} placeholder="What's included" />
      </div>

      {state.error && <p className="error-text">{state.error}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Sending…" : "Send quote"}
      </button>
    </form>
  );
}
