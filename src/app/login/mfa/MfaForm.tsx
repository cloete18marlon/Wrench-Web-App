"use client";

import { useActionState } from "react";
import { verifyLoginCode, type MfaState } from "./actions";

const initialState: MfaState = {};

export function MfaForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(verifyLoginCode, initialState);
  return (
    <form className="form" action={formAction}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="code">6-digit code</label>
        <input id="code" name="code" className="code-input" inputMode="numeric" pattern="[0-9 ]*"
               autoComplete="one-time-code" maxLength={7} required autoFocus />
      </div>
      {state.error && <p className="error-text">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Verify and continue"}
      </button>
    </form>
  );
}
