# Execution ledger

State, evidence, test. Anything marked NOT BUILT is genuinely not built — see
[BLOCKERS_REQUIRING_HUMAN.md](../BLOCKERS_REQUIRING_HUMAN.md).

| Feature | State | Evidence | Test |
|---|---|---|---|
| Mission compiler | **done** | `$0` inferred as hard, constraints extracted | `invariants.test.ts` · mission compiler |
| Task DAG | **done** | cycle + dangling-edge rejection, readiness, legal transitions | `invariants.test.ts` · task graph |
| Model job market | **done** | auction drawer shows utilities and exclusion reasons | `invariants.test.ts` · job market |
| Hard policy filter | **done** | paid model struck out at `$0` before ranking | `invariants.test.ts` · job market |
| Budget governor | **done** | `paidSpendUsd: 0` across every run | `invariants.test.ts` · budget governor, incl. concurrency |
| Zero-Dollar Mode | **done** | `blockedPaidAttempts` counted; paid routes never entered | budget + policy tests |
| Context compiler | **done** | 57% / 48% / 30% measured reductions at handoff | reduction asserted in checkpoint tests |
| Cognitive checkpoint | **done** | 3 in canonical run, with both token counts | `invariants.test.ts` · cognitive handoff |
| Worker hot-swap | **done** | `resumed from cp_…` in Mission Control | canonical run, 3 handoffs |
| Failure taxonomy | **done** | RATE_LIMIT vs TEST_FAILURE routed differently | cooldown vs exclusion in scheduler |
| Fault injection | **done** | `--inject-429`, labelled INJECTED | `invariants.test.ts` · fault injection |
| Verification engine | **done** | real `node --test` exit codes | 8/8 proof checks, suite exit 0 |
| Quality score | **done** | evidence-weighted, renormalised without AI review | `invariants.test.ts` · quality score |
| Proof-carrying work | **done** | ProofPack per task in canonical run | canonical run |
| Reputation + shrinkage | **done** | `demo/proof/model-observations.json` | `invariants.test.ts` · reputation |
| Capability probe | **done** | 22 models probed, 8 fully usable | `demo/proof/capability-probe.json` |
| RocketRide execution | **done** | every cloud worker is a pipeline run; credits consumed | `npm run verify:rocketride` |
| RocketRide credit meter | **done** | real `billing.getCreditBalance`, `unavailable` when absent | `/api/v1/health` |
| MCP server | **done** | 5 tools over stdio | `mcp/server.ts` |
| Host seat via MCP sampling | **done** | queue + bridge; UNAVAILABLE until a host connects | `src/providers/host.ts` |
| Host seat via agent CLI | **done** | detected `opencode` signed in, excluded `claude` (OAuth revoked) | `src/providers/agent-cli.ts` |
| 3D hero (WebGL) | **done** | hand-written shader, reduced-motion + no-WebGL fallbacks | `src/components/visual/aurora-field.tsx` |
| Workforce orbit | **done** | perspective projection fed by the canonical run | `src/components/visual/workforce-orbit.tsx` |
| REST API | **done** | missions, start, cancel, events, models, providers, health | live via curl |
| SSE event stream | **done** | resumable by `Last-Event-ID` | Mission Control live view |
| Mission Control | **done** | every value from backend state | `demo/screenshots/02` |
| Landing page | **done** | every number from `canonical-run.json` | `demo/screenshots/01` |
| Design system | **done** | one token source, no raw hex in components | `DESIGN.md` |
| Secret redaction | **done** | by value shape and key name | `invariants.test.ts` · security |
| Tenancy | **done** | workspace from identity; 404 not 403 cross-tenant | `src/server/missions.ts` |
| Shell safety | **done** | argv arrays, allowlist, no shell | `invariants.test.ts` · security |
| Path traversal | **done** | `safeJoin` refuses escapes | `invariants.test.ts` · security |
| Idempotency | **done** | same key returns the same mission | `createMission` |
| Cancellation | **done** | AbortSignal propagates; no new hires | `scheduler.cancel()` |
| Benchmark fixture | **done** | 17 assertions, all failing on clean checkout | `benchmark/forge-app` |
| Production build | **done** | 16 routes | `npm run build` |
| Supabase schema | **written, not applied** | migration + RLS committed | — |
| Privy auth | **NOT BUILT** | verification path written; no credentials | dev identity refuses production |
| Baseline comparison | **NOT RUN** | needs a paid key | no claim made |
| HyperFrames film | **NOT BUILT** | — | — |
| Supademo walkthrough | **NOT BUILT** | MCP unauthenticated in this session | — |

## Bugs found and fixed during the build

Recorded because each one changed the design, not just the code.

1. **Local models routed to the cloud pipeline.** The RocketRide executor always used the
   pool `base_url`, so an Ollama model was requested from a host that did not have it.
   Fixed by choosing the execution path from the model's cost class.

2. **Fault injection sat on a code path the demo never used.** It wrapped a provider
   adapter, but cloud workers execute inside a RocketRide pipeline and never reach
   `adapter.invoke`. Moved to dispatch (`src/core/faults.ts`).

3. **Workers could not see the tests they had to satisfy.** `fileScope` is write scope and
   was the only context source, so every model was guessing the API contract. Adding
   read-only reference files took the benchmark from 0/4 to 2/4.

4. **Downstream tasks could not see upstream output.** `split.js` was written against a
   one-line summary of `money.js` rather than its real signatures. Adding dependency
   outputs to context took it from 2/4 to 4/4.

5. **The JSON output contract was unsatisfiable for small models.** Embedding a multi-line
   source file in a JSON string requires hand-escaping every newline and quote; the
   observed failures were raw newlines and backtick template literals. Replaced with a
   fenced-block protocol, JSON kept as a fallback with a repair pass.

6. **A rate limit permanently benched the best model.** Any failure excluded a model from
   the task, so one injected 429 pushed the strongest candidate out and the task failed on
   weaker workers. Split into attributable failures (excluded) and infrastructure failures
   (one-auction cooldown).

7. **A cold-start auction is blind.** With no observations every candidate scored the
   prior, and the auction hired two models that return an empty response to any structured
   request. Added the capability probe, plus a penalty for models with observations and no
   successes.

8. **The in-memory mission registry was duplicated across Next module graphs.** A mission
   created through the API 404'd on the page that renders it. Pinned to `globalThis`, and
   completed missions now load from their persisted snapshot.

9. **`spawn EINVAL` on Windows.** `npm` is a `.cmd` shim that `CreateProcess` cannot run.
   Routed through the command interpreter with arguments still passed as an array.

10. **Scroll-reveal shipped the page invisible.** The first motion primitive rendered
    `opacity: 0` from the server and revealed on intersect, so the entire landing page was
    blank until hydration — and would have stayed blank forever if the observer never
    fired, which is exactly what happened. Rewritten to render visible and only hide
    below-the-fold elements client-side, with a failsafe timer. Invisible content is never
    an acceptable resting state.

11. **The fixture's own test script was wrong.** `node --test test/` resolves as a module
    path on Node 24, so the suite reported a failure while every individual file passed.
