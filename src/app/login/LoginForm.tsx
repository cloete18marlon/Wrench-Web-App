"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type LoginState } from "./actions";

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const initialState: LoginState = { error: initialError };
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <>
      <form className="form" action={formAction}>
        <input type="hidden" name="next" value={next} />

        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required />
        </div>

        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        {state.error && <p className="error-text">{state.error}</p>}

        <button className="btn btn-primary" type="submit" disabled={pending}>
          {pending ? "Logging in…" : "Log in"}
        </button>
      </form>

      <p className="link-row">
        No account? <Link href="/signup">Sign up</Link>
      </p>
    </>
  );
}
