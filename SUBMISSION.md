# Leverage

**One frontier brain. An elastic workforce.**

Live: https://useleverage.vercel.app · Repo: https://github.com/vaibhav4046/leverage
Category: intelligence resource manager for MCP hosts · RocketRide × SCU Buildathon

---

Your strongest model should decide the architecture. It should not need to write the
fortieth boilerplate test.

Leverage is an intelligence resource manager for MCP hosts. Claude Code, Codex or Cursor
stays the strategist. Leverage compiles the mission into a validated task graph,
hard-filters workers against budget and privacy policy, hires the best eligible model
for each task, executes cloud workers as RocketRide pipelines, verifies every result
with a compiler or a test suite, and replaces any worker that fails without restarting
the work.

In the recorded canonical run, Leverage completed and verified 4 of 4 tasks, passed
8 proof checks and 17 fixture assertions, survived 3 cognitive handoffs, and recorded
**$0.00** of paid inference. In a second recorded run, RocketRide executed 3 of the
6 workers and they finished 3 of the 4 tasks, all verified. In a third, on the
permanent hosted pool with no tunnel anywhere, RocketRide executed all 4 workers,
all 4 tasks passed, 13.6 credits, $0.00, 84 seconds.

---

## The five things that make it a product, not a router

**Hard policy runs before scoring.** A paid model under a $0 budget is not ranked
lower. It is removed from the pool, struck out with the reason. If policy were a
weight, a good enough score could buy past it, and "zero means zero" would be a
preference rather than a guarantee. The budget governor reserves headroom atomically
before a call, so four concurrent workers cannot each see "$0.05 left" and all
proceed.

**The worker failed. The work did not.** When a worker hits a rate limit or fails its
tests, Leverage writes a checkpoint of what it understood: decisions, files touched,
checks already passing, what is left. It hands that to a replacement. In the
RocketRide run the two checkpoints cut context by 39% and 45%. The transcript is not
carried. The understanding is.

**A model saying "done" is not proof.** A task completes only when a compiler, a test
runner or the filesystem agrees. Worker self-confidence is recorded and weighted least.
Every mission produces a ProofPack a judge can open.

**RocketRide runs the work.** Every cloud worker is a real pipeline:
`webhook → llm_openai_api → response`, with the auction's chosen model patched into
the LLM node at deploy time. That is the mechanism by which model *selection* becomes
model *execution*. Credit consumption is read from `billing.getCreditBalance`, so
cost-per-run is measured, not estimated. Three things in the RocketRide docs are wrong
and cost real time; they are written up in `docs/ROCKETRIDE_FINDINGS.md`.

**Reputation is measured and shrunk.** Success rates are pulled toward a neutral prior
and shipped with a sample count, so a model that went one-for-one never reads as a
hundred-percent model.

## Judge it in three minutes

| Seconds | Open | You will see |
|---|---|---|
| 0–20 | https://useleverage.vercel.app | `$0.00` actual paid inference, from a recorded run |
| 20–60 | `/app/missions/LVR-f8f72d56` | 4/4 verified · 3 handoffs · 129 events |
| 60–90 | scrub to `worker.failed` → `checkpoint.created` → `handoff.completed` | the model failed; the work did not restart |
| 90–120 | `/app/missions/LVR-bda3ba68` | RocketRide executed 3 of 6 workers · 3 of 4 tasks · all verified |
| 120–140 | `/app/missions/LVR-719a8c22` | RocketRide executed 4 of 4 workers through the hosted pool · 4 of 4 verified · $0.00 |
| 120–150 | `/benchmarks` | the control plane holding 100 tasks with 0 duplicate claims, 0 budget overshoots |

Full path with commands: [JUDGE_GUIDE.md](JUDGE_GUIDE.md).

## What holds at volume

`npm run scale` runs a 100-task diamond-dependency graph against deterministic stub
workers on a seeded PRNG. 100 completed, **0 duplicate claims, 0 budget overshoots,
0 ordering violations**, in 499 ms. It is labelled a synthetic control-plane test in
the file itself. It measures whether the scheduler keeps its own promises under load.
It is not cloud throughput and is never presented as such.

## Human in the loop

A high-risk task enters `AWAITING_APPROVAL`. That branch pauses. Independent branches
keep running. A read-only identity cannot approve. Asserted in `tests/invariants.test.ts`
alongside the other 50 invariants: no task runs before every dependency passed, a hard
budget cannot be overshot under concurrency, a credential never reaches the event log
by key or by value shape, a path that escapes the repository is refused.

## What is honest about the limits

The public deployment is deliberately read-only. It replays real recorded missions;
every mutation answers 403. Executing a mission needs a local repository to write into
and a local model pool to hire from.

The hosted pool endpoint at `/api/v1/pool` forwards to OpenRouter and NVIDIA behind
an access token and a 13-model allowlist in which every id answered a real completion
(`demo/evidence/pool-sweep.json` is the sweep). `npm run verify:rocketride` ran
against that permanent URL on 5 Sep 2026: a RocketRide pipeline on
staging.rocketride.ai, `READY`, 14.40 credits. The endpoint refuses anything outside
the allowlist and never fabricates a completion, because a fabricated result here
would end up inside a ProofPack.

Privy is wired at the application boundary; production authentication is claimed only
once real credentials have been verified server-side. The Postgres repository matches
the committed migrations column for column and has never been executed against a live
database. Free compute is not infinite compute; quota is a scheduling condition, not a
promise.

Leverage does not automate a logged-in consumer browser session to borrow a
subscription. It uses MCP sampling, local runtimes, provider APIs and agent CLIs.

## Run it

```bash
git clone https://github.com/vaibhav4046/leverage && cd leverage
npm install
cp .env.example .env.local          # add ROCKETRIDE_APIKEY for the cloud path
npm run stack:up                    # local models + router, checked, in one command
npm run dev
```

Then from Claude Code:

```bash
claude mcp add leverage -- node /abs/path/to/leverage/mcp/server.ts
```

> Use Leverage. Finish this application. Budget $0. Quality production.

53 invariant tests: `npm run test`. Full verification: `npm run verify`.
