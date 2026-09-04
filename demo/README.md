# Demo evidence

Everything in this directory came out of a real run. Nothing here is illustrative.

```
demo/
├── canonical-run.json          the mission the site and the film both use
├── proof/
│   ├── capability-probe.json   what each model can actually do, measured
│   └── model-observations.json every observation behind the reputation numbers
├── screenshots/
│   ├── 01-landing-desktop.png
│   └── 02-mission-control.png
└── README.md
```

## The canonical mission

`LVR-f8f72d56`. One record, used by the landing page, Mission Control and the demo film,
so the three cannot disagree with each other.

```
status                   COMPLETED
tasks                    4 / 4 verified
proof checks             8 / 8 pass
full suite               17 / 17, exit 0
elapsed                  149.6 s
workers hired            7
cognitive handoffs       3
events                   129
actual paid inference    $0.00
```

Reproduce:

```bash
npm run fixture:reset
npm run mission -- --inject-429 --out=demo/canonical-run.json
```

It will not reproduce identically. These are stochastic models on free routes, and the
number of attempts and handoffs varies run to run. What is stable is the shape: tasks get
hired, verified, and where a worker fails its understanding is transferred rather than
discarded — and paid spend is `$0.00` every time, because that part is not stochastic.

## About the 429

**The rate limit in the canonical run is injected, and it is labelled INJECTED
everywhere** — in the event message itself, in the UI, in BENCHMARKS.md, in JUDGE_GUIDE.md
and in the film's narration.

Recovery is the claim. A demo that waits for a real provider to fail on camera is
demonstrating luck, not engineering. The injector is deterministic
(`src/core/faults.ts`), fires at dispatch so it lands on whichever worker the auction
actually hired, and raises the fault through exactly the same path a real 429 would take.

A genuine rate limit does appear in the evidence independently:
`pool:auto/coding:free` returned a real HTTP 429 during the capability probe, recorded in
`proof/capability-probe.json`.

## The other two handoffs are not injected

Both `TEST_FAILURE` handoffs are real. Local models wrote code that did not satisfy the
committed tests, verification caught it, and the work moved to a stronger worker carrying
a checkpoint. That is the machinery doing its job on an ordinary failure.

## Screenshots

Captured with Playwright at 1440×900 against the running app, full-page. Every value in
them is read from the backend — there is no fixture data in the UI layer.

## Before recording anything

```bash
git status                       # nothing untracked that shouldn't be
grep -rn "rr_\|sk-\|sb_secret" --include="*.ts" --include="*.tsx" src/ mcp/ scripts/
npm run test                     # includes the secret-leakage regression test
```

Then check the obvious human things: no `.env.local` open in the editor, no terminal
scrollback with a key in it, no network tab, no devtools console.
