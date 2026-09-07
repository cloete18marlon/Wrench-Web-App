# Wrenchy — Web App

Next.js 16 (App Router) reading live from Supabase. Rebuilt from the prototype.

## Run it

```bash
npm install
cp .env.local.example .env.local   # values already filled in for staging
npm run dev
```

Open http://localhost:3000

## Pages

| Route | What it does |
|---|---|
| `/` | Landing. Trades read live from the `trades` table. |
| `/signup` | Email + password signup. Sends a confirmation email; no session until it's clicked. |
| `/login` | Email + password login. |
| `/auth/callback` | Exchanges the signup-confirmation link's code for a session. Also where OAuth will land once a provider is added. |
| `/dashboard` | Signed-in home. Shows role(s) and, for non-pros, a link to apply. |
| `/dashboard/become-a-pro` | Pro application form (trade, bio, rate, radius). Writes `pro_profiles` + `pro_trades`; does **not** grant the `pro` role. |
| `/jobs` | Jobs you posted, plus (if you're an approved pro) open jobs matching your trades. |
| `/jobs/new` | Post a job (trade, title, description, budget, preferred date). |
| `/jobs/[id]` | Job detail. Owner sees quotes and can accept one; an eligible pro sees a quote form. |
| `/admin` | Lists pro applications; lets an admin grant the `pro` role. Admin-only — redirects everyone else to `/dashboard`. |
| `/directory` | Pro directory from `pro_profiles`. Not yet built. |
| `/status` | Live diagnostics: env vars, reads, and RLS lockout on the money tables. Not yet built. |

Everything except `/`, `/login`, `/signup`, `/auth/callback`, and `/status` requires
being signed in — enforced in `src/proxy.ts` (Next 16's replacement for
`middleware.ts`), which also refreshes the session cookie on every request.

## The two checks that matter

`ledger_entries` and `audit_log` must return **zero rows** to the publishable key.
They have RLS enabled with no policies, so only the service role reaches them.
The `/status` page described above (checking env vars, reads, and this lockout)
hasn't been built yet — for now, verify it with a direct query against the
`anon` role if you need to confirm it.

Never let a `NEXT_PUBLIC_` variable contain `SERVICE_ROLE` — that prefix compiles
the value into the browser bundle, and the service-role key bypasses all RLS
policies.

## Auth notes

- Every signup (the trigger `handle_new_user`) creates a `public.users` row and
  grants the `customer` role automatically. The `pro` role is **never**
  self-granted — `/dashboard/become-a-pro` only writes an application
  (`pro_profiles` + `pro_trades`). Granting `pro` currently has to be done by
  hand, e.g.:
  ```sql
  insert into user_roles (user_id, role) values ('<uuid>', 'pro');
  ```
- Email confirmation is required before login works — make sure "Confirm
  email" is turned on under Authentication → Providers → Email in the Supabase
  dashboard, for both the staging and production projects.
- Under Authentication → URL Configuration, add `<your-site-url>/auth/callback`
  to Redirect URLs (and `http://localhost:3000/auth/callback` for local dev),
  or the confirmation link in signup emails will fail.
- Google OAuth is not wired up yet. `/auth/callback` is already written to
  handle it — enabling it later is just adding a "Continue with Google"
  button that calls `signInWithOAuth`, once a Google Cloud OAuth client is
  configured in Supabase.

## Environment

| Variable | Browser? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes, by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes, by design |
| `NEXT_PUBLIC_SITE_URL` | yes — used to build the auth-email redirect link |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** — server only, not needed yet |

## Deploying to Netlify

- Build command `npm run build`, publish directory `.next`
- Install the Netlify Next.js plugin when prompted
- Set the `NEXT_PUBLIC_` variables (including `NEXT_PUBLIC_SITE_URL`, set to
  this site's real URL) in Site settings → Environment variables
- Point the first site at **Wrency-Staging**; add production as a second site later
- Choose a **Europe** region — both Supabase projects are in `eu-west-1`, and a
  server-rendered page makes several database round trips

## What is deliberately not here

- No Google (or other OAuth) sign-in yet — see Auth notes above.
- No "forgot password" flow yet.
- `/admin` only grants the `pro` role and bumps `verification_tier` to 1 — no
  real ID/background-check pipeline behind it yet.
- Accepting a quote does three separate updates (accept the quote, decline the
  rest, assign the job) rather than one DB transaction — fine for now since
  nothing else races against it, but worth an RPC if that changes.
- No pro seed data, so `/directory` (not yet built) would show its empty state.
- No radius search. That lands with PostGIS in Week 11.
- No service-role client. Nothing in this app needs to bypass RLS yet, and the
  fewer places that key exists, the better.

## A note on verification

Queries were checked against the staging database as the `anon` role: 8 trades
readable, 0 rows from `ledger_entries` and `audit_log`. Two migrations were
added because the tables had no write path at all for what the UI needs:

- `pro_trades_owner_write` — a pro can attach their own trades.
- `jobs_quotes_roles_rls` — adds `has_role()`, lets approved pros browse open
  jobs in their trade, lets a customer accept/decline quotes on their own job,
  lets a pro insert a quote (only if approved and the job is still open), and
  lets an admin grant roles / bump `verification_tier`.

`npm run build` passes and route protection (redirects to `/login`) was
checked with curl for every new route. The full signup → confirm → post a job
→ apply as pro → get approved → quote → accept loop has **not** been
exercised against real data — this dev sandbox's outbound network can't reach
the Supabase project directly. Run it locally before trusting it end to end.
