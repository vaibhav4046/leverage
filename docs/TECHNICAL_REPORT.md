# Leverage: technical report

RocketRide x SCU Buildathon, September 2026. Live at https://useleverage.vercel.app.
Repository: https://github.com/vaibhav4046/leverage. Demo film: https://youtu.be/TQJ_neL7gFY.

Every number in this report comes from a file in the repository, a recorded mission, or
a command whose output is quoted. Where a figure was reported to the author rather than
measured by the system, the report says so in the same sentence.

## 1. What Leverage is

Leverage is an intelligence resource manager: an MCP server with five tools that sits
underneath the model you already pay for. The host model (Claude, Codex, Cursor, any
MCP client) keeps the strategy. Leverage recruits an elastic workforce of local, free and
subscription models, gives each one the smallest job it can verify, executes cloud-class
workers as RocketRide pipelines, and refuses to call anything done until the repository's
own tests say so. When a worker fails, its understanding is checkpointed and handed to a
replacement, so the work continues instead of restarting.

The five tools: `leverage_run`, `leverage_status`, `leverage_cancel`, `leverage_proof`,
`leverage_models`. `leverage_run` returns a mission id immediately; a mission takes
minutes, and a synchronous MCP call held open that long would be unusable.

## 2. The harness

Four layers, each with one job (full detail in [ARCHITECTURE.md](../ARCHITECTURE.md)):

| Layer | Job | Where |
|---|---|---|
| Host model | strategy: the goal, the budget, the quality bar | any MCP client |
| Leverage control plane | what work exists, who does it, what it may cost, whether the output is true | `src/core`, `src/server` |
| RocketRide | execution fabric: pipelines, traces, token accounting | `src/providers/pool.ts`, `docs/ROCKETRIDE_FINDINGS.md` |
| Compute pool | Ollama locally, free hosted routes, the user's own agent CLI seat | `src/providers` |

The loop a mission runs:

1. **Compile.** A planner model reads the repository (scripts, test file heads) and
   proposes a task graph. The compiler refuses cycles, dangling edges, paths that escape
   the repository, and any task without a verify command in one of four accepted shapes
   (`node --test <files>`, `npm test`, `npm run <script>`, `npx vitest run <files>`).
   A task no test can prove is rejected, not scheduled.
2. **Auction.** Every reachable model is scored on task fit, verified track record,
   context fit, availability, cost and privacy. The winner's utility and rationale are
   written into the mission log; ineligible candidates are struck out with a reason.
3. **Hire.** Under a zero-dollar budget the policy filter runs before scoring, so a paid
   route never enters the auction. Zero means zero, not "cheapest wins".
4. **Execute.** Cloud-class workers run as RocketRide pipelines
   (`webhook -> llm_openai_api -> response`) through a token-gated pool. Credits are read
   from billing before and after and recorded on the mission.
5. **Verify.** The task's own tests run as a real process with a real exit code. The
   failure excerpt quotes the assertion line, including the input that failed. After the
   last task passes, the whole suite runs once more; a mission is COMPLETED only if it is green.
6. **Proof.** Every completion carries a ProofPack: the checks that ran, what they
   returned, files changed, a patch hash, quality as the pass rate of what actually ran,
   and the real spend. The whole-suite run is listed with the task checks.
7. **Handoff.** On a 429, a timeout, an invalid output or a red test, the worker is
   released, a compact checkpoint of what it understood is written, and a replacement
   resumes from it. Context reduction at handoff is measured and recorded.

## 3. Evidence: the missions that ran

All missions below are in the repository or reproduced in the film. None is a mock.

| Mission | What it proves | Result |
|---|---|---|
| `LVR-f8f72d56` (`demo/canonical-run.json`) | the full loop with an injected 429 | 4/4 tasks verified, 8/8 proof checks, full suite 17/17 exit 0, 7 workers, 3 handoffs, context reduction 57%, 48%, 30%, $0.00 paid |
| `LVR-31eacf88` (`demo/planned-run.json`) | a plan written by a model, not a committed one | whole suite green, 24.6 RocketRide credits, output at `demo/output/greeter` with a matching patch hash |
| `LVR-2d4d56e0` (`demo/evidence/live-planned-run-LVR-2d4d56e0.sse`) | the live page's second button, planned by a model inside the deployment | verified in 121 s, 15.8 credits, transcript recorded |
| `LVR-e6443739` (film, act 5) | a mission driven from a Claude chat through the connector, on a real repository | planned by Nemotron 3 Nano 30B via NVIDIA in 45.7 s, 3 tasks, 2 handoffs from checkpoints, whole suite green, quality 100, $0.00 paid, frontier-equivalent workload $0.087 |

The last mission deserves detail because it is the one a judge can watch. The repository
was `webguard`: three security guards that sit at the top of the OWASP Top 10, an open
redirect check, an SSRF check and a sliding-window rate limiter, specified only by their
test files. From one chat message, Leverage planned three tasks, hired free-tier workers,
saw `implement-ssrf` fail its tests on attempt one, replaced the MiniMax M2.7 worker with a
MiniMax M3 worker resumed from checkpoint `cp_b2074cda83dd`, saw `implement-redirect`
produce an invalid output and recover the same way, passed every task on attempt two, ran
the whole suite green, and returned the proof pack into the chat. Elapsed 453.9 s. Paid
spend $0.00, zero blocked paid attempts.

RocketRide credits are measured, not estimated. A verified chat round trip through a
worker pipeline costs 2.0 credits (`docs/ROCKETRIDE_FINDINGS.md`); the balance over the
evening of 5 September moved from 4045.9 to 3977.7 across the recorded runs. The site's
health endpoint reports the live balance.

## 4. Verification of the system itself

| Check | Result |
|---|---|
| `npm run verify` | typecheck 0 errors, lint 0 warnings, 88 tests passing (63 invariants, 7 pool guards, 18 planner and verification), production build |
| `npm run verify:rocketride` | real inference through a real pipeline with a real credit delta |
| Layout audit | 40/40 viewport and console combinations clean across the site |
| Accessibility audit (axe) | 0 violations on 12 pages |
| Film composition check (HyperFrames) | lint clean, runtime clean, layout clean, 45/45 text checks pass WCAG AA contrast |

Two defects found and fixed during the final evening are worth recording, because both
were only visible under real use:

- **A timed-out health probe emptied a provider's catalogue.** The registry sweep wiped
  the free pool's model list whenever its 20-second probe timed out, so the planner saw
  zero hosted models and fell to local models that were out of GPU memory. Four missions
  failed to plan this way. Fix: a failed probe keeps the last catalogue (only an
  authentication error clears it), planner ranking excludes only authentication errors,
  and transient refusals (502, 503, 504, resource exhausted) are retried twice with a
  pause. The failure event now keeps the whole list of what was tried. A test pins the
  behaviour.
- **The whole-suite run was missing from the proof pack.** Claude, reading the proof in
  the chat, correctly noted it could not see a full-suite run and asked the user to run
  one. The run had happened; it lived only in the event log. `leverage_proof` and the
  console's proof panel now list it beside the task checks.

## 5. Evaluation

### 5.1 Simulated persona panel

Before external testing, the product was put through two rounds of a simulated
evaluation panel: model-driven personas playing three judges, three users and one agent,
each working through the live site and the MCP tools with a script of questions and
tasks. These are simulations run by the author, not user research, and they were used as
a defect-finding method, not as a score to publish.

Round two, before the fixes it prompted, scored the product 9, 7 and 6.5 from the three
judge personas and 6 from a user persona. The findings it produced were all acted on:
per-worker "via" stamps in the three older recordings, RocketRide credits recorded by the
scheduler, every unbacked credit figure removed from the docs, a Plan panel in Mission
Control showing the planner, the per-task checks and the plan text, a quality score that
excludes unevaluated acceptance criteria, a greeter output preserved with a matching patch
hash, and page titles across the app.

### 5.2 External testers

Two people outside the project, contacted by the author, tested Leverage on their own
machines with models served locally through Ollama. As reported to the author, they
rated it 9 out of 10 and 8 out of 10. These ratings were reported by the testers to the
author; the repository did not instrument their sessions, and no claim beyond their
reported scores is made here.

### 5.3 What the film shows

The demo film (2:22) is rendered with HyperFrames from `motion/compositions/demo.html`
over untouched browser sessions: the live site running a mission that a model plans
inside the deployment, the mission console with the plan, the auction, the log and the
proof, and the claude.ai chat that started mission `LVR-e6443739` and received its proof.
Captions and the voice track are in the repository.

## 6. RocketRide: what the docs say and what the engine does

Reverse-engineered against staging and recorded in
[docs/ROCKETRIDE_FINDINGS.md](ROCKETRIDE_FINDINGS.md), verified by execution:

- The documented endpoint (`cloud.rocketride.ai`) and the SDK default
  (`api.rocketride.ai`) both return 403 for a hackathon key; `staging.rocketride.ai` is
  the working host.
- `validate()` passes a pipeline that `use()` rejects for lacking a `source` field, so
  validate-passing is not run-ready.
- A `control` wire to `llm_openai_api` produces a pipeline that runs, reports no errors,
  consumes credits and returns the input unchanged, because nothing invokes the model.
  The LLM must sit in the data lane. A ~340 ms echo versus a ~4.8 s answer is the tell.
- The credential field is `apikey`, although the server's own error message asks for
  `api_key`.

## 7. Using it

```bash
git clone https://github.com/vaibhav4046/leverage && cd leverage && npm install
npm run verify                    # 88 tests, typecheck, lint, build
npm run mission -- --inject-429 --out=demo/canonical-run.json   # reproduce the recorded run
claude mcp add leverage -- node /abs/path/to/leverage/mcp/server.ts   # stdio host
npm run mcp:http                  # Streamable HTTP host for chat connectors, :3200/mcp
```

Then, in the host:

> Use Leverage. Finish this application. Budget $0. Quality production.

## 8. Scope and next steps

Validated in this build: JavaScript and TypeScript repositories with their own test
suites, missions planned by a model or from a committed plan, RocketRide execution with
measured credits, zero-dollar policy, checkpointed handoffs, proof packs, and a chat
connector. Next: task graphs with edges rendered in the console, permalinks for live runs,
a larger fixture family, and a paid-baseline comparison once a paid key is available.

## Appendix: files worth opening

| File | What it is |
|---|---|
| `demo/canonical-run.json` | the recorded mission with the injected 429 and three handoffs |
| `demo/evidence/*.sse` | server-sent event transcripts of live runs |
| `docs/ROCKETRIDE_FINDINGS.md` | the RocketRide integration as it actually behaves |
| `docs/EXECUTION_LEDGER.md` | what was executed, when, and what it cost |
| `tests/invariants.test.ts` | 63 invariants the control plane must hold |
| `motion/compositions/demo.html` | the film, as a HyperFrames composition |
| `docs/supademo/` | stills and the step script for the interactive demo |
