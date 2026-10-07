"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotState } from "./actions";

export function ForgotPasswordForm({ initialError }: { initialError?: string }) {
  const [state, formAction, pending] = useActionState(requestPasswordReset, { error: initialError } as ForgotState);

  if (state.sent) {
    return (
      <div className="form">
        <p className="notice" role="status">
          If an account exists for <b>{state.email}</b>, we&apos;ve sent a link to reset your password. It works
          for one hour. Check your spam folder too. If nothing arrives within 10 minutes, come back and request
          another.
        </p>
        <p className="hint">Open the link on this device if you can — it&apos;s the most reliable way.</p>
        <p className="link-row">
          <Link href="/login">Back to log in</Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <form className="form" action={formAction}>
        <p className="hint">
          Enter the email you signed up with. We&apos;ll send you a link to choose a new password.
        </p>

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        {state.error && <p className="error-text">{state.error}</p>}

        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="link-row">
        Remembered it? <Link href="/login">Log in</Link>
      </p>
    </>
  );
}
