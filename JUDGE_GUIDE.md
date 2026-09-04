# Judge Leverage in three minutes

Everything below is checkable. Nothing on this page is a claim you have to take on trust.

---

## If you have three minutes and no terminal

Everything below can be checked without cloning anything. These are live and
read-only; every mutating route answers 403 by design.

| What | Where |
|---|---|
| The recorded mission, event by event | <https://useleverage.vercel.app/app/missions/LVR-f8f72d56> |
| The handoff, scrubbable | <https://useleverage.vercel.app/demo> |
| Every measured number and its methodology | <https://useleverage.vercel.app/benchmarks> |
| What the deployment thinks of itself | <https://useleverage.vercel.app/api/v1/health> |
| Source | <https://github.com/vaibhav4046/leverage> |

The public deployment has no local runtime and no provider keys, so it replays
recorded runs rather than executing new ones. It says so on the pages themselves.

---

## 0 · The idea, in ten seconds

Your best model should decide the architecture. It should not spend the same premium
compute writing the fortieth boilerplate test.

Leverage sits under a frontier host model and gives it a workforce: it decomposes the
mission, hires the cheapest *capable* model for each task, verifies every result, and when
a worker fails it transfers that worker's understanding to a replacement instead of
starting over.

---

## 1 · See a real mission (60 seconds)

```bash
npm install
npm run dev
```

Open <http://localhost:3000/app/missions> and open the recorded run, **or** run one live:

```bash
npm run fixture:reset
npm run mission -- --inject-429
```

The benchmark fixture is a receipt-splitting library where **the tests exist and the
implementation does not**. Test files are outside every task's write scope, so a worker
physically cannot pass by weakening an assertion.

What you should see in the timeline:

```
auction.completed   Winner: Pool · best-free — 72 task fit · 70 verified success over 28 prior jobs · free route, no spend
worker.hired        Hired Pool · best-free as Backend Engineer
provider.rate_limit Pool · best-free: INJECTED 429 rate limit
checkpoint.created  Checkpoint cp_e79faf1d95be: 196 tokens captured from 453 of context (57% smaller)
worker.hired        Hired kodro-tutor as Backend Engineer
verification.passed "Implement money helpers" verified — quality 100
mission.completed   Mission verified: 4/4 tasks passed
```

The 429 is **injected and labelled as injected**, everywhere: in the event stream, in the
UI and in this document. We are demonstrating recovery, not luck. A genuine 429 also
occurs in the recorded probe data (`pool:auto/coding:free`).

---

## 2 · Check the proof (30 seconds)

The Proof panel at the bottom of Mission Control, or:

```bash
cd benchmark/forge-app && npm test
```

```
ℹ tests 17
ℹ pass 17
ℹ fail 0
```

Those tests were failing on a clean checkout. The code that makes them pass was written by
free and local models, and Leverage refused to mark any task done until `node --test`
returned zero.

---

## 3 · Check the economics (20 seconds)

Mission Control's Usage panel, or `demo/canonical-run.json`:

```
actual paid spend        $0.00
blocked paid attempts    0
local calls              3
free cloud calls         3
```

The one derived number, "estimated frontier-equivalent cost", is labelled *estimated*
everywhere it appears and prices only the tokens actually observed. Methodology and its
limits are in [BENCHMARKS.md](BENCHMARKS.md).

Try to break it: set a `$0` budget and watch a paid model appear in the auction drawer
struck out with `Zero-Dollar Mode: hard budget $0.00 blocks all paid routes`. Policy runs
*before* scoring, so it never competes.

---

## 4 · Check RocketRide is load-bearing (20 seconds)

```bash
npm run verify:rocketride
```

```
endpoint  https://staging.rocketride.ai
auth      ok (org df58d291...)
credits   4690.2 / 5000
answer    "READY"
latency   25452ms
engine    2.4 tokens
consumed  2.9 credits
```

Every cloud worker's inference is a real RocketRide pipeline execution —
`validate → use → chat → getTaskStatus → terminate` — using
`webhook → llm_openai_api → response` with the auction's chosen model patched into the LLM
node at deploy time. That is the mechanism by which model *selection* becomes model
*execution*. The pipeline is committed at `rocketride/leverage-worker.pipe`.

Credit consumption is read from `billing.getCreditBalance`, so the cost-per-run figures are
measured. When that API cannot answer, the UI shows `unavailable` rather than a guess.

Three things in the RocketRide docs are wrong and cost real time to discover; they are
written up in [docs/ROCKETRIDE_FINDINGS.md](docs/ROCKETRIDE_FINDINGS.md).

---

## 5 · Try it from your own host (30 seconds)

```bash
claude mcp add leverage -- node /abs/path/to/leverage/mcp/server.ts
```

> Use Leverage. Finish this application. Budget $0. Quality production.

---

## 6 · Check the invariants

```bash
npm run verify
```

53 tests. The ones that matter:

- a hard budget cannot be overshot, including by concurrent reservations
- a paid model is *ineligible* at `$0`, not merely out-ranked
- no task runs before every dependency has PASSED
- a failed dependency blocks permanently rather than being retried forever
- a checkpoint is materially smaller than the context it replaces
- a credential never reaches the event log, in text or by key name
- a path that escapes the repository is refused
- a model with one observation never reports a confident success rate

---

## What is honest about the limits

- **The task graph for the benchmark is committed, not planner-generated.** A benchmark
  whose plan changes per run measures the planner, not the workforce. Arbitrary missions go
  through `parseTaskPlan`, which rejects cycles, dangling edges and escaping paths.
- **No baseline comparison is claimed.** Running the same mission on one frontier model
  would need a paid key this build does not have, so BENCHMARKS.md reports Leverage's own
  numbers and no speedup multiple.
- **Privy and Supabase have no credentials here.** Auth runs in a dev identity that
  *refuses to start in production*, or — on the deployed instance — an explicit read-only
  public demo. Persistence goes through `MissionRepository` (`src/db/`): the filesystem
  implementation is what produced every recorded run, and the Postgres one matches the
  committed migrations but **has never been executed against a live database**. Both are in
  [BLOCKERS_REQUIRING_HUMAN.md](BLOCKERS_REQUIRING_HUMAN.md) with what is needed.
- **Small local models fail often.** That is visible in the run rather than hidden: the
  capability probe found 5 of 14 local models usable, and the failures are what the handoff
  machinery exists for.
