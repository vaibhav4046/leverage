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

**Status:** BLOCKING verified identity. Does not block the deployed demo.

No `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` exists in this environment.

Server-side token verification is implemented in `src/auth/identity.ts` and every
`/api/v1/*` route goes through it. The rule that matters is that the server *verifies*
the token rather than decoding it: a decoded JWT is a claim, not an authentication.

With no credentials the server resolves identity as one of:

- **dev** — gated behind `LEVERAGE_DEV_AUTH=1`, and it throws on any authenticated
  request when `NODE_ENV=production`, so it cannot ship by accident;
- **public demo** — `LEVERAGE_PUBLIC_DEMO=1`, read-only and labelled as unverified
  wherever it surfaces. This is what the live site runs. Every mutating route answers
  `403`.

**What you need to do:**

```bash
npm i @privy-io/server-auth      # deliberately NOT installed — see below
# .env.local
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_VERIFICATION_KEY=...
LEVERAGE_DEV_AUTH=0
LEVERAGE_PUBLIC_DEMO=0
```

The package is imported lazily (`src/auth/identity.ts`) precisely so the app builds and
runs without it. It is left uninstalled on purpose: installing it pulls a transitive
`uuid < 11.1.1` and takes this project from **0 vulnerabilities to 5 moderate**, which
is a bad trade for a dependency that does nothing until credentials exist. Install it at
the same time as the keys.

---

## 3. Supabase project

**Status:** BLOCKING durable multi-instance persistence. Does not block the demo.

No Supabase project credentials exist here. Persistence is behind
`MissionRepository` (`src/db/types.ts`) with two implementations:

- `src/db/memory.ts` — a JSON snapshot per mission, one directory per workspace. This is
  what runs now and what produced every recorded run on the site. Covered by tests,
  including the cross-tenant read and the path-escape cases.
- `src/db/supabase.ts` — Postgres over the committed migrations, decomposing a snapshot
  across `missions`, `mission_tasks`, `worker_runs`, `checkpoints`, `proof_packs`,
  `proof_checks`, `mission_events` and `auctions`. **It has never been executed against a
  live database.** It type-checks and matches the schema column for column; treat the
  first run as a first run.

`src/db/index.ts` picks between them from the environment, and nothing above that file
can tell which one it got.

Migrations are committed at `supabase/migrations/` — `0001_init.sql` (schema + RLS) and
`0002_auctions.sql`, which adds the auction table plus the two `proof_packs` columns the
initial schema was missing, so a snapshot survives a round trip without losing its
reasoning or its caveats.

**What you need to do:** create the project, run `supabase db push`, then put
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY` into `.env.local`. Note that in-flight missions still live in the
process — the repository persists completed runs, not live scheduler state.

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
