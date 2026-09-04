# Leverage Overnight Full-Product Winner Pass

Run 4 September 2026. Every number here came from a command in this pass. Where
something was not done, it says so.

## Live

| | |
|---|---|
| URL | https://useleverage.vercel.app |
| Deployment identity | `LEVERAGE_PUBLIC_DEMO=1`, read-only |
| Repository | https://github.com/vaibhav4046/leverage (public) |

## Git

| | |
|---|---|
| Branch | `master` |
| Commit at start | `d782974` |
| Working tree at start | clean |

## Product — what materially changed

1. **`npm run mcp` was broken and is now fixed.** It ran `tsx mcp/server.ts`;
   tsx compiles to CJS, which cannot hold the server's top-level `await`. Node 24
   strips types natively, so the script is `node mcp/server.ts`. Nothing had ever
   exercised this path.
2. **An MCP judge harness now exists** (`npm run mcp:harness`). It drives the real
   server over stdio with a real MCP client and writes a redacted transcript.
3. **A control-plane stress harness now exists** (`npm run scale`), with a
   deterministic seeded graph and no external spend.
4. **Evidence is written where a judge can read it**: `demo/evidence/`.

## Fresh verification

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | clean |
| `npm run test` | 0 | **47 passed** |
| `npm audit --omit=dev` | 0 | **0 vulnerabilities** |
| `npx next build` | 0 | compiled successfully |

## Canonical run — unchanged, still the published evidence

`demo/canonical-run.json`, mission `LVR-f8f72d56`: 4/4 tasks verified, 8/8 proof
checks, 3 cognitive handoffs, 129 events, 149s elapsed, **$0.00** actual paid
inference. Not regenerated in this pass, and not modified.

## MCP — real, and it works

```
server     leverage 1.0.0
tools      leverage_run, leverage_status, leverage_cancel, leverage_proof, leverage_models
schemas    0 problems (every tool exposes a valid object schema)
malformed  input refused (missionId "../../etc/passwd")
transcript demo/evidence/mcp-transcript.jsonl
summary    demo/evidence/mcp-summary.json
mission    demo/evidence/mcp-live-mission.json  (full snapshot of LVR-e95ef2c8)
```

Two missions were initiated **through MCP**, not through a script shortcut.

| Mission | Admitted | Workers | Checkpoints | Events | Paid | Result |
|---|---|---|---|---|---|---|
| `LVR-3eee5ff5` | 4,319 ms | 8 | 8 | 122 | $0.00 | **FAILED** |
| `LVR-e95ef2c8` | 34,722 ms | 8 | 7 | 125 | $0.00 | **FAILED** (1/4 tasks passed) |

**Both fresh runs failed to complete the fixture.** They are real: real workers,
real handoffs, real `$0.00` enforcement. They did not finish the work.

Cause is provider availability, not a code regression. Both the Ollama daemon and
the OmniRoute router were **down when this pass started**. Ollama was started
mid-pass (15 local models); the pool came up and dropped out again. The canonical
run was produced with both healthy.

The harness writes the transcript in place, so the second run overwrote the
first. The file currently holds **4 entries** from run two, which ended early for
the reason below; the 107-entry transcript from run one was lost. The harness
should timestamp its output, and does not yet.

**Second finding: `leverage_run` is not returning immediately.** It took 34.7s on
the second run. Its own contract says it returns as soon as the mission is
admitted, and the design note in the file gives the reason. 34s is not admission
latency, it is the registry sweep blocking the call. Recorded, not fixed.

## RocketRide — executed, but not load-bearing

Fresh run this pass:

```
endpoint  https://staging.rocketride.ai
auth      ok (org df58d291…)
credits   4690.2 / 5000
latency   16,367 ms
consumed  1.40 credits
result    worker returned "**LLM error** — ValueError: An error occurred with the API."
```

RocketRide authenticated, accepted the pipeline, executed it, and billed 1.40
credits. The worker inside the pipeline could not reach a model, because the
pipeline points at `http://127.0.0.1:20128`, which RocketRide's cloud cannot
route to. `cloudflared` is not installed here.

The truthful claim today is **"RocketRide executes our pipelines and bills us for
them"**, not "RocketRide ran a worker that produced verified output". See
`docs/BLOCKERS_REQUIRING_OPERATOR.md` §6.

## Scale — synthetic control-plane stress test

`npm run scale`, written to `demo/scale-run.json`:

```
tasks              100 (diamond dependencies, 4 per layer)
completed          100
blocked            0
handoffs           15
events             229
elapsed            577 ms
peak concurrent    4
duplicate claims   0
budget overshoots  0
ordering violations 0
settled             $0.00
```

Deterministic stub workers on a seeded PRNG. **No provider is called and no
credit is spent.** This measures the control plane under load. It is not cloud
throughput and must never be presented as such.

## Security

| Check | Result |
|---|---|
| Secret scan, tracked files | no live-looking credentials |
| Secret scan, all 21 commits | only the synthetic fixture `rr_0000…1234` |
| `.env.local` tracked | no (`.env.example` only) |
| Public mutation | `403` on create / start / cancel / host POST |
| Cross-workspace read | `404` |
| Path traversal | `404` |
| MCP transcript redaction | applied on write, not after the fact |

## UI/UX

Unchanged in this pass except the fixes already committed before it:
12 pages audited, **0 contrast failures**, every control named, one `h1` each;
48 page/width combinations at 390/768/1024/1440 with zero overflow and zero
clipped content.

## Things intentionally not claimed

- No fresh successful end-to-end mission. Two were attempted; both failed.
- No load-bearing RocketRide cloud worker result.
- No ElevenLabs narration, alignment, SRT or VTT — no API key exists here.
- No 60-second master film. The 9-second teaser from the previous pass stands.
- No Supademo — the connector is unauthenticated and this session cannot OAuth.
- No browser capture harness. Playwright is not installed and I did not add a
  large dependency and a recording pipeline in the time left.
- No approval flow work, no Capability Mesh, no artifact foundry, no scheduler,
  no Evidence Memory, no browser worker. The "Leverage Everywhere" expansion was
  not started.
- The Postgres repository remains unexecuted against a live database.

## Operator actions

See `docs/BLOCKERS_REQUIRING_OPERATOR.md`. The one that matters for judging is
§6: give the pool a publicly reachable endpoint so a RocketRide worker can
actually produce output.
