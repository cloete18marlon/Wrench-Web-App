"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Logo } from "../logo";
import { signup, type SignupState } from "./actions";

const initialState: SignupState = {};

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signup, initialState);

  return (
    <main>
      <section className="hero hero-compact">
        <Logo size={48} />
        <h1 className="brand" style={{ fontSize: 26 }}>
          wrench<span className="y">y</span>
        </h1>
      </section>

      {state.success ? (
        <div className="card">
          <h3>Check your email</h3>
          <p>
            We sent a confirmation link to your inbox. Click it to activate your account, then
            come back and log in.
          </p>
        </div>
      ) : (
        <form className="form" action={formAction}>
          <input type="hidden" name="next" value={next} />
          <div className="label" style={{ padding: "22px 0 8px" }}>
            Create your account
          </div>

          <div className="field">
            <label htmlFor="fullName">Name</label>
            <input id="fullName" name="fullName" type="text" autoComplete="name" required />
          </div>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          {state.error && <p className="error-text">{state.error}</p>}

          <button className="btn btn-primary" type="submit" disabled={pending}>
            {pending ? "Creating account…" : "Sign up"}
          </button>
        </form>
      )}

      <p className="link-row">
        Already have an account?{" "}
        <Link href={next !== "/dashboard" ? `/login?next=${encodeURIComponent(next)}` : "/login"}>Log in</Link>
      </p>
    </main>
  );
}
