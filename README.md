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
| `/dashboard/banking` | A pro's payout bank details (account holder, bank, account number, branch code), stored as jsonb. Required before a release can pay them out. |
| `/api/webhooks/peach/checkout` | Peach calls this when a Checkout payment completes. Public (no session) — verified by HMAC signature instead. |
| `/api/webhooks/peach/payout` | Peach calls this when a payout succeeds/fails. Same deal. |
| `/directory` | Pro directory from `pro_profiles`. Not yet built. |
| `/status` | Live diagnostics: env vars, reads, and RLS lockout on the money tables. Not yet built. |

Everything except `/`, `/login`, `/signup`, `/auth/callback`, `/status`, and the
two `/api/webhooks/peach/*` routes requires being signed in — enforced in
`src/proxy.ts` (Next 16's replacement for `middleware.ts`), which also
refreshes the session cookie on every request.

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

## Payments (Peach Payments) — integration status

Wrenchy is not an FSP, so it never touches customer funds directly: a
customer's payment goes into Wrenchy's own Peach merchant account via
Checkout (Wrenchy just orchestrates), and paying a pro out is a separate
Payouts API call to their bank account, later. Peach has no native
marketplace/escrow product — this two-step pattern is the whole design, and
it's exactly what the existing `payments` / `payouts` / `ledger_entries`
schema already models.

**Confirmed** (from Peach's docs/search, trustworthy):
- Auth: OAuth2 client-credentials — POST `clientId` + `clientSecret` +
  `merchantId`, get a Bearer `access_token`, reuse it for Checkout/Payouts.
- Webhook signing: HMAC-SHA256 over `${timestamp}.${url}.${rawBody}`, headers
  `x-webhook-signature`, `x-webhook-timestamp`, `x-webhook-signature-algorithm`.
  `verifyWebhookSignature()` in `src/lib/peach.ts` implements this and is the
  one part of that file you can trust.

**NOT verified — flagged `TODO(verify)` in `src/lib/peach.ts`, both webhook
routes, and the auth token endpoint/API base URLs in `.env.local.example`**:
this sandbox couldn't reach `developer.peachpayments.com` (network egress
policy), so the exact request/response field names for creating a Checkout
session and creating a Payout, and the exact webhook payload shape, are
best-guess REST-payment-gateway conventions — not confirmed from Peach's real
reference. `isSuccessResultCode()` in the checkout webhook assumes Peach's
Checkout is built on the OPPWA platform (a reasonably well-known lineage) and
uses OPPWA's result-code convention — plausible, not confirmed for Peach
specifically. **Before this goes anywhere near real money**: get Peach
sandbox credentials, register the two webhook URLs above in their dashboard,
and walk one real Checkout + one real Payout end to end, fixing up the
field names in `src/lib/peach.ts` and the two webhook routes as needed.

**The flow as built:**
1. Customer accepts a quote (`acceptQuote`) → job status `accepted`.
2. Customer clicks "Pay into the Vault" (`initiatePayment`) → creates a
   `payments` row (`pending`), calls Peach Checkout, redirects to Peach's
   hosted page. `merchantTransactionId` is set to the `payments.id` so the
   webhook can find the row back without depending on Peach's own
   provider-reference field name.
3. Peach calls `/api/webhooks/peach/checkout` → on success: `payments` →
   `held`, a `ledger_entries` `hold` row, job status → `in_progress`.
4. Customer clicks "Confirm & release payment" (`releasePayment`) → looks up
   the held payment and the pro's `payout_details`, splits off Wrenchy's
   10% commission (`src/lib/money.ts`), creates a `payouts` row, and calls
   Peach's Payouts API **before** touching the ledger — if Peach rejects the
   payout, nothing else changes state. On success: `ledger_entries` gets
   `release` + `commission` + `payout` rows, `payments` → `released`, job
   status → `released`.
5. Peach calls `/api/webhooks/peach/payout` → `payouts` → `paid` or `failed`.

All of this writes to `payments`/`payouts`/`ledger_entries`, which have zero
RLS write policies for the publishable key by design — every write above goes
through `src/lib/supabase-admin.ts` (the service-role client), and only after
checking the caller is actually the job's customer with a normal session
client first. That admin client should never be imported anywhere else.

There's no dispute-handling UI yet, so a bad release currently has no
recovery path beyond going into the database by hand. The `disputes` table
exists but nothing writes to it yet.

## Environment

| Variable | Browser? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes, by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes, by design |
| `NEXT_PUBLIC_SITE_URL` | yes — used to build the auth-email redirect link |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** — server only. Bypasses all RLS; used only by `src/lib/supabase-admin.ts` |
| `PEACH_CLIENT_ID` / `PEACH_CLIENT_SECRET` / `PEACH_MERCHANT_ID` / `PEACH_ENTITY_ID` | never |
| `PEACH_AUTH_URL` / `PEACH_API_URL` | never — sandbox defaults baked in, unverified (see above) |
| `PEACH_WEBHOOK_SECRET` | never — used to verify inbound webhook signatures |

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
- No refund flow — `payments.status` has a `refunded` value and nothing ever
  sets it.
- No dispute handling — see the Payments section above.

## A note on verification

Queries were checked against the staging database as the `anon` role: 8 trades
readable, 0 rows from `ledger_entries` and `audit_log`. Two migrations were
added because the tables had no write path at all for what the UI needs:

- `pro_trades_owner_write` — a pro can attach their own trades.
- `jobs_quotes_roles_rls` — adds `has_role()`, lets approved pros browse open
  jobs in their trade, lets a customer accept/decline quotes on their own job,
  lets a pro insert a quote (only if approved and the job is still open), and
  lets an admin grant roles / bump `verification_tier`.

A third migration, `pro_payout_details`, adds the `payout_details` jsonb
column to `pro_profiles` — no new RLS needed since it's covered by the
existing owner/admin update policies.

`npm run build` passes and route protection (redirects to `/login`) was
checked with curl for every new route, including confirming the two Peach
webhook routes are reachable *without* a session and correctly reject a bad
HMAC signature (401) before touching the database. The full signup → confirm
→ post a job → apply as pro → get approved → quote → accept → pay → release
loop has **not** been exercised against real data or a real Peach account —
this dev sandbox's outbound network can't reach either directly. Run it
locally before trusting it end to end, and see the Payments section above
before going near real money.
