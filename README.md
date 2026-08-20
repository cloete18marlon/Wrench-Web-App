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
| `/directory` | Pro directory from `pro_profiles`. Empty until pros are seeded. |
| `/status` | Live diagnostics: env vars, reads, and RLS lockout on the money tables. |

Start at `/status`. If every row is green, the whole chain works: env vars →
publishable key → PostgREST → RLS policy → data.

## The two checks that matter

`/status` asserts that `ledger_entries` and `audit_log` return **zero rows** to the
publishable key. They have RLS enabled with no policies, so only the service role
reaches them. If either ever shows rows on that page, stop and check RLS.

It also fails loudly if any `NEXT_PUBLIC_` variable contains `SERVICE_ROLE` — that
prefix compiles the value into the browser bundle, and the service-role key
bypasses all 25 policies.

## Environment

| Variable | Browser? |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes, by design |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | yes, by design |
| `SUPABASE_SERVICE_ROLE_KEY` | **never** — server only, not needed yet |

## Deploying to Netlify

- Build command `npm run build`, publish directory `.next`
- Install the Netlify Next.js plugin when prompted
- Set the two `NEXT_PUBLIC_` variables in Site settings → Environment variables
- Point the first site at **Wrency-Staging**; add production as a second site later
- Choose a **Europe** region — both Supabase projects are in `eu-west-1`, and a
  server-rendered page makes several database round trips

## What is deliberately not here

- No auth UI. Email sign-in is enabled on the project but nothing signs in here yet.
- No pro seed data, so `/directory` shows its empty state by design.
- No radius search. That lands with PostGIS in Week 11.
- No service-role client. Nothing in this app needs to bypass RLS yet, and the
  fewer places that key exists, the better.

## A note on verification

This app compiles cleanly and its queries were checked against the staging
database as the `anon` role: 8 trades readable, 0 rows from `ledger_entries` and
`audit_log`. The live HTTP connection has not been exercised — run `/status`
locally to confirm it end to end.
