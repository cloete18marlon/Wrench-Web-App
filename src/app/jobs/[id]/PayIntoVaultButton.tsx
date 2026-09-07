"use client";

import { useActionState } from "react";
import { initiatePayment, type PaymentState } from "./actions";

const initialState: PaymentState = {};

export function PayIntoVaultButton({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(initiatePayment, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="jobId" value={jobId} />
      {state.error && <p className="error-text">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Redirecting to payment…" : "Pay into the Vault"}
      </button>
    </form>
  );
}
