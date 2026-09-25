"use client";

import { useActionState } from "react";
import { saveBankingDetails, type BankingState } from "./actions";

const initialState: BankingState = {};

type Existing = { accountHolder?: string; bankName?: string; accountNumber?: string; branchCode?: string } | null;

export function BankingForm({ existing }: { existing: Existing }) {
  const [state, formAction, pending] = useActionState(saveBankingDetails, initialState);

  return (
    <form className="form" action={formAction}>
      <div className="field">
        <label htmlFor="accountHolder">Account holder name</label>
        <input id="accountHolder" name="accountHolder" type="text" defaultValue={existing?.accountHolder} required />
      </div>

      <div className="field">
        <label htmlFor="bankName">Bank</label>
        <input id="bankName" name="bankName" type="text" defaultValue={existing?.bankName} required />
      </div>

      <div className="field">
        <label htmlFor="accountNumber">Account number</label>
        <input id="accountNumber" name="accountNumber" type="text" defaultValue={existing?.accountNumber} required />
      </div>

      <div className="field">
        <label htmlFor="branchCode">Branch code</label>
        <input id="branchCode" name="branchCode" type="text" defaultValue={existing?.branchCode} required />
      </div>

      {state.error && <p className="error-text">{state.error}</p>}
      {state.success && <p className="success-text">Saved.</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save banking details"}
      </button>
    </form>
  );
}
