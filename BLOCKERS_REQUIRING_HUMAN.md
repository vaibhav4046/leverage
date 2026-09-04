# Blockers requiring a human

The only items that cannot be resolved from this machine without an account, a
credential, or a decision that is yours to make. Everything else was either done
or is recorded here as not done.

This is the only blockers document. An earlier pass left two of them that
contradicted each other about whether RocketRide worked; they have been merged
here and the loser deleted.

---

## 1. RocketRide — works, with one caveat that matters

**Status:** connected and verified. The caveat is reachability, not the integration.

```
endpoint : https://staging.rocketride.ai      <-- correct, the hackathon runs on staging
           https://api.rocketride.ai          <-- SDK default, 403 for this key
           https://cloud.rocketride.ai        <-- the value in the docs, wrong host entirely
SDK      : rocketride@1.3.0
org      : df58d291-287a-4c9f-b1b2-e472846bf958
```

Mission `LVR-bda3ba68` completed 4/4 tasks with **three of its six workers executing
as RocketRide pipelines**, and their output passed verification. See
`demo/rocketride-mission.json` and the section in `BENCHMARKS.md`.

**The caveat.** RocketRide executes workers in its own cloud, so the
OpenAI-compatible model router has to be reachable from the public internet. A
router on `127.0.0.1` is not: the pipeline still runs and still bills, and the
worker inside it returns a provider error. `npm run verify:rocketride` now fails
loudly on exactly that case rather than reporting success.

**The tunnel is no longer part of this.** The deployment now hosts the endpoint
itself, at a permanent address:

```
https://useleverage.vercel.app/api/v1/pool/v1/chat/completions
```

`src/app/api/v1/pool/[...path]/route.ts` forwards to whatever OpenAI-compatible
provider the deployment is configured with. With nothing configured it answers 503
and says why, rather than serving a canned completion.

**What you need to do — and why I could not do it for you.**

You told me to set these and I tried. There is nothing on this machine to set them
*to*. I checked the router's credential store directly:

```
provider        auth_type   token stored
agentrouter     apikey      no
github-models   apikey      no
nvidia          apikey      no
ollama-cloud    apikey      no
openrouter      apikey      no
tokenrouter     apikey      no
agy             oauth       yes, expired 2026-09-04T08:26Z
grok-cli        oauth       yes, expired 2026-09-04T09:56Z
```

Every plain-API-key provider has no key stored, and `registered_keys` is empty.
The only two credentials that exist are OAuth sessions tied to your Google
accounts, and both access tokens expired a day ago. The router keeps working
locally because it refreshes them on demand with the paired refresh tokens; a
static copy pasted into Vercel would be an already-dead token, so the endpoint
would answer 502 and the "live cloud path" would be a worse lie than the honest
503 it returns today.

So this is not me declining. There is no transferable credential here.

**To turn the live path on, you need one API key from any OpenAI-compatible
provider** — OpenRouter's free tier is enough:

```
vercel env add POOL_UPSTREAM_URL production     # https://openrouter.ai/api
vercel env add POOL_UPSTREAM_KEY production     # sk-or-v1-...
```

Then redeploy. Nothing else changes: the route, the pipeline and
`OMNIROUTE_BASE_URL=https://useleverage.vercel.app/api/v1/pool` are already in
place and verified end to end against a live upstream.

**None of this affects the recorded proof.** Mission `LVR-bda3ba68` is browsable
now, with no credentials, and it is the artifact that shows RocketRide executing
load-bearing workers.

## 2. Rotate the RocketRide key

The key was pasted into a chat transcript, so it is compromised regardless of
validity. It is **not** in git history — the only key-shaped string ever committed
is the synthetic fixture `rr_0000…1234`. Rotation is hygiene, not incident
response. `pnpm exec rocketride login` regenerates it into `.env.local` without
anyone handling the literal value.

---

## 3. Privy credentials

**Status:** blocks production auth. Does not block the demo.

No `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` exists here. Server-side token
verification is implemented in `src/auth/identity.ts` and every `/api/v1/*` route
goes through it. Without credentials the server runs a dev identity that is gated
behind `LEVERAGE_DEV_AUTH=1`, **throws on any authenticated request when
`NODE_ENV=production`**, and is labelled in the UI and in `/api/v1/health`.

**What you need to do:** create a Privy app, set the three values, set
`LEVERAGE_DEV_AUTH=0`, and `npm i @privy-io/server-auth`.

That package is deliberately not installed: it pulls a transitive `uuid < 11.1.1`
that takes this project from 0 vulnerabilities to 5 moderate, which is a bad trade
for a package that does nothing until the credentials exist.

---

## 4. Supabase project

**Status:** blocks durable persistence. Does not block the demo.

Persistence sits behind `MissionRepository` (`src/db/types.ts`) with two
implementations: `src/db/memory.ts`, which produced every recorded run and is
covered by tests, and `src/db/supabase.ts`, which matches the committed migrations
column for column and **has never been executed against a live database**. It says
so in the file.

**What you need to do:** create the project, `supabase db push`, set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and
`SUPABASE_SECRET_KEY`.

---

## 5. ElevenLabs narration

**Status:** blocks the narrated film only.

No `ELEVENLABS_API_KEY` exists in `.env.local` or the environment, so narration,
forced alignment and the aligned SRT/VTT could not be produced. The script is
written and locked at `demo/audio/narration-script.txt`, with pronunciation notes
beside it. Generation is one command once a key exists.

The 9-second teaser at `public/motion/handoff.mp4` is real, rendered from the
HyperFrames composition in `motion/`, and is embedded on the landing page.

---

## 6. Supademo

**Status:** blocks the interactive walkthrough only.

The Supademo MCP server is unauthenticated and this session is non-interactive, so
the OAuth flow cannot run here. Authorise it from an interactive `claude` session
(`/mcp`) or from claude.ai connector settings.

---

## 7. Vercel deployment protection

**Status:** resolved, no action needed.

The site is public at <https://useleverage.vercel.app>. Vercel Authentication is
still enabled, so the auto-generated deployment URLs answer 302 to the SSO login —
but that protection does not apply to a domain assigned to the project as its
production domain, which is why the site is reachable without weakening anything.

`leverage.vercel.app`, `leverage-app` and `leverage-ai` are all taken by other
accounts.
