"use client";

import { useActionState, useState } from "react";
import { submitRecoveryCode, verifyLoginCode, type MfaState } from "./actions";

const initialState: MfaState = {};

export function MfaForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"code" | "recovery">("code");
  const [state, formAction, pending] = useActionState(verifyLoginCode, initialState);
  const [recState, recAction, recPending] = useActionState(submitRecoveryCode, initialState);

  if (mode === "recovery") {
    return (
      <form className="form" action={recAction}>
        <p className="hint">
          Enter one of the recovery codes you saved when you turned on two-step verification. It removes your
          old authenticator so you can set up a new one. For your safety, banking changes and payouts pause for
          48 hours afterwards.
        </p>
        <div className="field">
          <label htmlFor="recoveryCode">Recovery code</label>
          <input id="recoveryCode" name="recoveryCode" className="code-input" placeholder="XXXXX-XXXXX"
                 autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} required autoFocus />
        </div>
        {recState.error && <p className="error-text" role="alert">{recState.error}</p>}
        <button className="btn btn-primary" type="submit" disabled={recPending}>
          {recPending ? "Checking…" : "Use recovery code"}
        </button>
        <button type="button" className="link-btn center" onClick={() => setMode("code")}>
          Use my authenticator app instead
        </button>
      </form>
    );
  }

  return (
    <form className="form" action={formAction}>
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label htmlFor="code">6-digit code</label>
        <input id="code" name="code" className="code-input" inputMode="numeric" pattern="[0-9 ]*"
               autoComplete="one-time-code" maxLength={7} required autoFocus />
      </div>
      {state.error && <p className="error-text" role="alert">{state.error}</p>}
      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Checking…" : "Verify and continue"}
      </button>
      <button type="button" className="link-btn center" onClick={() => setMode("recovery")}>
        Lost your phone? Use a recovery code
      </button>
    </form>
  );
}
