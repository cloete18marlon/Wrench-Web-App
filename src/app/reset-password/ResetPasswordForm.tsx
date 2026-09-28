"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { resetPassword, type ResetState } from "./actions";

export function ResetPasswordForm({ email, min }: { email: string; min: number }) {
  const [state, formAction, pending] = useActionState(resetPassword, {} as ResetState);
  const [show, setShow] = useState(false);

  if (state.done) {
    return (
      <div className="form">
        <p className="notice" role="status">
          Your password has been changed. For your safety we&apos;ve signed you out everywhere, including any other
          phone or computer.
        </p>
        <Link className="btn btn-primary" href="/login">
          Log in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form className="form" action={formAction}>
      <p className="hint">
        Choose a new password for <b>{email}</b>. Use at least {min} characters — a short phrase is easier to remember
        than a jumble of symbols.
      </p>

      {/* Lets password managers save the new password against the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />

      <div className="field">
        <label htmlFor="password">New password</label>
        <input
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={min}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="confirm">Type it again</label>
        <input
          id="confirm"
          name="confirm"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          minLength={min}
          required
        />
      </div>

      <button type="button" className="link-btn" style={{ alignSelf: "flex-start" }} onClick={() => setShow((s) => !s)}>
        {show ? "Hide passwords" : "Show passwords"}
      </button>

      {state.error && <p className="error-text">{state.error}</p>}

      <button className="btn btn-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save new password"}
      </button>
    </form>
  );
}
