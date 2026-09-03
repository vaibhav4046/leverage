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
RocketRide credits used   30.40
```

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

### The probe is not stable, and that is the point

The probe was run twice against the same 22 models. The results disagreed:

| Model | Run 1 | Run 2 |
|---|---|---|
| `ollama:qwen2.5-coder:3b` | 2/2 | 1/2 (timeout) |
| `ollama:gemma3:4b` | 2/2 | 0/2 (wrong behaviour) |
| `ollama:kodro-fast` | 0/2 | 2/2 |
| `ollama:kodro-tutor` | 1/2 | 0/2 |
| `pool:auto/best-coding` | 2/2 | 1/2 (timeout) |

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
| Full 4-task benchmark mission | 14.6 - 30.4 |

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
