"use client";

import { useActionState } from "react";
import { releasePayment, type PaymentState } from "./actions";

const initialState: PaymentState = {};

export function ReleasePaymentButton({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(releasePayment, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />
      {state.error && <p className="error-text">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Releasing…" : "Confirm & release payment"}
      </button>
    </form>
  );
}
