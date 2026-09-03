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
