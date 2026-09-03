# Blockers requiring a human

Everything not listed here was built and verified. These are the only items I cannot
resolve without account-level access.

---

## 1. RocketRide - RESOLVED, but the key still must be rotated

**Status:** NOT BLOCKING. Connected and verified.

The earlier failure was my endpoint, not your key. The hackathon runs on **staging**:

```
endpoint : https://staging.rocketride.ai      <-- correct
           https://api.rocketride.ai          <-- SDK default, 403 for this key
           https://cloud.rocketride.ai        <-- docs value, wrong host entirely
SDK      : rocketride@1.3.0
result   : connected=true authenticated=true
org      : df58d291-287a-4c9f-b1b2-e472846bf958
credits  : granted 5000 tokens / consumed 0   (billing.getCreditBalance, real value)
```

**Still required from you:** the key was pasted into a chat transcript, so it is
compromised regardless of validity. Rotate it after judging. `pnpm exec rocketride login`
regenerates it into `.env.local` without anyone having to handle the literal value.

---

## 2. Privy credentials

**Status:** BLOCKING production auth.

No `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` exists in this environment.

Server-side token verification is implemented (`src/auth/privy.ts`) using
`@privy-io/server-auth`, and every `/api/v1/*` route goes through it. With no app
credentials the server runs in dev-identity mode, which:

- is gated behind `LEVERAGE_DEV_AUTH=1`,
- **hard-refuses to start when `NODE_ENV=production`** (`src/auth/privy.ts` throws),
- is labelled in the UI.

**What you need to do:** create a Privy app, paste the three values into `.env.local`,
set `LEVERAGE_DEV_AUTH=0`. No code change.

---

## 3. Supabase project

**Status:** BLOCKING durable persistence. Does not block the demo.

No Supabase project credentials exist here. Persistence is behind a repository
interface with two implementations:

- `src/db/memory.ts` — process-local + JSON snapshot, used now.
- `src/db/supabase.ts` — server-only client, used when `SUPABASE_SECRET_KEY` is set.

Migrations are committed at `supabase/migrations/0001_init.sql` including RLS.

**What you need to do:** create the project, run
`supabase db push`, paste `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` into `.env.local`.

---

## 4. Supademo

**Status:** BLOCKING the interactive walkthrough only.

The Supademo MCP server in this session is unauthenticated, and this session is
non-interactive so the OAuth flow cannot run here. Authorise it from an interactive
`claude` session (`/mcp`) or from claude.ai connector settings, then the walkthrough
can be generated from the screenshots already captured under `demo/screenshots/`.

## 5. Vercel deployment protection — RESOLVED

The site is live and public at **https://useleverage.vercel.app**.

Vercel Authentication is still enabled on this project, so the auto-generated
deployment URLs (`leverage-<hash>-<team>.vercel.app`) still answer `302` to
`vercel.com/sso-api`. That protection applies to those URLs, not to a domain
assigned to the project as its production domain — so adding one both gave the
product a real name and routed around the wall without weakening anything.

`leverage.vercel.app`, `leverage-app.vercel.app` and `leverage-ai.vercel.app`
are all taken by other accounts; `useleverage.vercel.app` was free and follows
the usual convention for a product whose name is a common word.

If you would rather the deployment URLs were public too, the toggle is
Vercel -> project **leverage** -> Settings -> Deployment Protection ->
Vercel Authentication -> Disabled. It is not required for the submission.

Exposure is safe: production runs with `LEVERAGE_PUBLIC_DEMO=1`, a read-only
identity. Verified against the live site — create, start, cancel and the host
channel's POST all answer `403`.
