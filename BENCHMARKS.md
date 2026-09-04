# Benchmarks

Every number here was produced by a command in this repository. Where a number is an
estimate it says so, and where a comparison would be dishonest it is not made.

---

## The fixture

`benchmark/forge-app` — a receipt-splitting library where **the tests exist and the
implementation does not**.

```
money.js      validate.js      <- independent, run in parallel
     \            /
       split.js                <- depends on both
          |
       index.js                <- depends on split
```

Four suites, 17 assertions. All fail on a clean checkout.

The design choice that makes it meaningful: test files are in each task's *reference*
scope, not its *write* scope. A worker can read the tests it must satisfy and cannot
modify them. The only way to go green is to write code that is actually correct.

Reproduce:

```bash
npm run fixture:reset
npm run mission -- --inject-429 --out=demo/canonical-run.json
```

---

## Canonical run — `LVR-f8f72d56`

```
mission status            COMPLETED
tasks verified            4 / 4
proof checks              8 / 8 pass
full suite                17 / 17 tests, exit 0
elapsed                   149.6 s
workers hired             7
cognitive handoffs        3
mission events            129

actual paid inference     $0.00
paid calls                0
blocked paid attempts     0
local calls               3
free cloud calls          3
```

Credit consumption is **not** recorded per mission. The mission snapshots carry no
credit field, so any per-run figure here would be a number nobody could check. The
one credit measurement in this repository is a single verification call, captured
by `npm run verify:rocketride` into `demo/evidence/rocketride-run.json`.

### The three handoffs

| Trigger | Original context | Checkpoint | Reduction |
|---|---|---|---|
| `RATE_LIMIT` (injected, labelled) | 453 tokens | 196 tokens | 57% |
| `TEST_FAILURE` (genuine) | 421 tokens | 220 tokens | 48% |
| `TEST_FAILURE` (genuine) | 464 tokens | 327 tokens | 30% |

Both numbers are computed from the same estimator over the same units, so the ratio is
meaningful even though the absolute token counts are approximations. The estimator is
`src/core/tokens.ts` at ~3.6 characters per token; it is not a tokenizer and does not
pretend to be, which is why every derived figure is labelled approximate.

---

## Capability probe

`npm run probe:models` runs two small, real, executable tasks against every reachable
model and records the outcome as genuine observations.

```
models probed          22   (14 local Ollama, 8 free cloud routes)
passed every probe      8
partial                 1
failed                 13
```

Failure modes were not subtle: timeouts, HTTP 500 from the local runtime, malformed
output, and one **genuine** HTTP 429 from `pool:auto/coding:free`.

### The mission where RocketRide did the work

The two runs above prove the workflow. This one answers the question a sponsor
judge actually asks: did RocketRide execute anything load-bearing, or was it a
health check beside the real work?

Mission `LVR-bda3ba68`, started through the MCP tool `leverage_run` rather than a
script. Snapshot: `demo/rocketride-mission.json`. Summary:
`demo/evidence/rocketride-mission-summary.json`.

```
status                    COMPLETED
tasks                     4 / 4 verified
proof checks              8
elapsed                   311s
workers                   6  (3 executed as RocketRide pipelines, 3 local)
cognitive handoffs        2  (39% and 45% context reduction)
actual paid inference     $0.00
```

The three RocketRide workers were `pool:auto/best-free`, and they owned the `money`,
`validate` and `split` tasks. All three passed verification. Routing is decided at
`src/core/scheduler.ts` by cost class: anything that is not `local` or `host` runs
inside a pipeline, so those three tasks could not have completed without RocketRide
executing them.

The pool has to be reachable from RocketRide's cloud for this to work at all, which
is the constraint that produced `docs/ROCKETRIDE_FINDINGS.md`.


## The probe is not stable, and that is the point

The probe was run more than once against the same 22 models and the results moved
between runs: models that passed 2/2 on one pass returned timeouts, HTTP 500s or
wrong behaviour on the next.

The per-run comparison table that used to sit here has been removed. Only one probe
snapshot survives — `scripts/benchmark-models.ts` writes
`demo/proof/capability-probe.json` in place, so each run overwrites the last, and a
second column could not be traced to a file. Publishing a comparison whose second
half nobody could check would undercut the exact argument it was making.

What the retained snapshot does show, and what the argument actually rests on:

Same prompts, same models, same machine, minutes apart. This is what small models on
free routes actually behave like, and it is the strongest single argument for the
architecture: a system that picks one model up front and trusts it is betting on a coin
flip. Leverage assumes any given worker may fail, verifies every result, and keeps the
understanding when one does.

It is also why reputation is shrunk and carries a sample count. Two observations is not
evidence, and the UI is built so it cannot pretend otherwise.

This exists because a cold-start auction is blind. With no observations every candidate
scores the prior, so the winner is effectively arbitrary — and on the first real run the
auction hired two models that return an *empty response* to any structured request, then
burned three attempts discovering it. The probe is a synthetic benchmark and is labelled
as such; it seeds reputation, it does not replace what a model earns on real work.

---

## Showcase run — `LVR-5d6aff86` (arcade)

A second fixture with the same honest split, chosen because its output is visible.

```
mission status            COMPLETED
tasks verified            4 / 4
proof checks              8 / 8 pass
logic suite               22 / 22, exit 0
workers hired             6
cost classes used         host · free · local
cognitive handoffs        2  (62% and 84% context reduction)
actual paid inference     $0.00
```

Files written by workers: `src/vector.js`, `src/physics.js`, `src/spawner.js`,
`src/game.js`. Given, not written: every file under `test/`, and `index.html`.

Worth stating precisely, because "an AI built a game" invites more credit than is due:
the workers wrote four small, tightly specified logic modules against tests that already
existed. They did not design the game, choose the mechanic or write the renderer. What
the run demonstrates is that free and subscription-backed models, coordinated and
verified, can produce working code that passes tests they cannot edit — not that they
produced a title.

---

## Estimated frontier-equivalent cost

The one derived number, and the one most likely to be abused. What it means, precisely:

> Take the prompt and completion tokens **actually observed during this run**. Price them
> at published frontier API rates. Report the result.

```
observed workload, LVR-f8f72d56   ->   $0.0467
baseline                          Claude Sonnet 4.5 published pricing
                                  $3.00 / 1M input, $15.00 / 1M output
```

Defined once, in `FRONTIER_BASELINE` (`src/core/budget.ts`), so the docs and the UI cannot
drift from the calculation.

**What it is not.** It is not a saving, not a charge, and not a claim about what a human
or a frontier agent would have spent solving this problem — a frontier model would
plausibly have used a different number of tokens, and very likely fewer attempts. It
prices *this* token workload at *those* rates and nothing more. The UI labels it
`estimated` in the metric strip and explains it in full in the Usage panel.

---

## No baseline comparison is claimed

Running the same mission on a single frontier model would need a paid API key this build
does not have. Rather than invent a comparison, there isn't one. Leverage's own numbers
are above; no speedup multiple, no cost-reduction percentage, no "N× faster" claim
appears anywhere in this repository.

---

## RocketRide cost per run

Measured from `billing.getCreditBalance`, not estimated:

| Pipeline | Credits |
|---|---|
| `webhook -> response` (no model) | 0.4 |
| `webhook -> llm_openai_api -> response`, one question | 2.0 – 2.5 |
| Full 4-task benchmark mission | not recorded per mission |

At that rate the 5,000-credit hackathon grant is roughly 160-340 full missions. Total
consumed across all development and verification for this build: about 240 credits.

---

## Honest limits

- **One fixture.** Four tasks in one language. Nothing here generalises to a large
  polyglot repository and no such claim is made.
- **The benchmark plan is committed, not planner-generated.** A benchmark whose task graph
  changes between runs measures the planner, not the workforce.
- **Run-to-run variance is real.** These are stochastic models on free routes. Across
  development runs the same mission took 1–4 attempts per task and 0–6 handoffs. The
  canonical run is one recorded instance, not a median, and it is labelled with its
  mission id so it can be checked rather than trusted.
- **The system fails honestly when its dependencies do.** During final verification the
  Ollama process exited and the tunnel to the model pool dropped. The next mission
  reported `0/4 tasks passed`, 8 handoffs and `$0.00` spent, rather than reporting
  success. With both restored, the same command returned 4/4. A run that cannot reach any
  capable model is supposed to look exactly like that.
- **The 429 in the canonical run is injected.** Deterministic, and labelled INJECTED in the
  event stream, the UI, this file and the demo narration. A genuine 429 appears
  independently in the probe data.
