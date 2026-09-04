# Blockers requiring the operator

Only items that cannot be resolved from this machine without an account,
a credential, or a decision that is yours to make. Everything else in this pass
was either done or is recorded in `docs/OVERNIGHT_RESULT.md` as not done.

---

## 1. ElevenLabs narration — BLOCKED, no credential

**Action:** add `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` to `.env.local`.

Still the top remaining blocker: it is the only thing standing between the
current state and a narrated 60-second master film.

`.env.local` contains no ElevenLabs key, and no ElevenLabs variable exists in the
shell environment. Narration, forced alignment, and therefore the aligned SRT/VTT
subtitles could not be produced. The 60-second script is written and locked at
`demo/audio/narration-script.txt`; generation is one command once the key exists.

**Blocks the core product:** no. It blocks the narrated master film only.

---

## 2. Supademo — BLOCKED, unauthenticated MCP server

**Action:** authorise the Supademo connector from an interactive `claude` session
(`/mcp`) or from claude.ai connector settings.

This session is non-interactive, so the OAuth flow cannot run here. The
walkthrough asset package can be assembled from `docs/shots/` once there is
somewhere to upload it.

**Blocks the core product:** no.

---

## 3. Privy — BLOCKED, no application

**Action:** create a Privy app, then set `NEXT_PUBLIC_PRIVY_APP_ID`,
`PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY`, and `LEVERAGE_DEV_AUTH=0`.

Install `@privy-io/server-auth` at the same time. It is deliberately not
installed: it pulls a transitive `uuid < 11.1.1` that takes this project from
0 vulnerabilities to 5 moderate, which is a bad trade for a package that does
nothing without credentials.

**Blocks the core product:** no. The deployment runs an explicit read-only public
demo identity, and every mutating route returns 403.

---

## 4. Supabase — BLOCKED, no project

**Action:** create the project, run `supabase db push`, set
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`.

`src/db/supabase.ts` matches the committed migrations column for column and has
**never been executed against a live database**. Until it has, it stays labelled
that way in the README, the judge guide and the file itself.

**Blocks the core product:** no. The filesystem repository is what produced every
recorded run.

---

## 5. RocketRide credential rotation — RECOMMENDED

**Action:** rotate the staging key after judging.

The key was pasted into a chat transcript, so it is compromised regardless of
validity. It is **not** in git history: the only key-shaped string ever committed
is the synthetic test fixture `rr_0000…1234`, confirmed by scanning all 21
commits. Rotation is hygiene, not incident response.

---

## 6. A load-bearing RocketRide cloud task — RESOLVED

`cloudflared` was installed and the local OpenAI-compatible router exposed over a
public HTTPS tunnel. RocketRide then executed workers that produced verified
output: mission `LVR-bda3ba68`, 4/4 tasks passed, 3 of 6 workers run as
RocketRide pipelines, $0.00 paid. Evidence in `demo/rocketride-mission.json` and
`demo/evidence/rocketride-run.json`.

**One caveat that is yours to decide:** the tunnel is a `trycloudflare.com`
quick tunnel. It is ephemeral and dies with the process. For judging, either keep
the tunnel process alive, or put the router on a stable host and set
`OMNIROUTE_BASE_URL` to it. The tunnel URL is deliberately not committed.

## 6b. Original diagnosis, kept for the record — NEEDED A PUBLIC POOL ENDPOINT

**Action:** either expose the local pool over a tunnel, or point
`OMNIROUTE_BASE_URL` at a publicly reachable OpenAI-compatible endpoint.

This is the one item that genuinely limits the strongest possible submission.

A fresh RocketRide pipeline ran during this pass and consumed real credits:

```
endpoint  https://staging.rocketride.ai
auth      ok (org df58d291…)
credits   4690.2 / 5000 before, 1.40 consumed
latency   16,367 ms
result    worker returned: "**LLM error** — ValueError: An error occurred with the API."
```

So RocketRide **executed** the pipeline, but the worker inside it could not reach
the model: the pipeline points at `http://127.0.0.1:20128`, which RocketRide's
cloud cannot route to. `cloudflared` is not installed on this machine and I did
not install a tunnelling binary without asking.

Until that is fixed, the honest claim is "RocketRide executes our pipelines and
bills us for them", not "RocketRide ran a worker that produced verified output".

**Blocks the core product:** no, but it weakens the RocketRide half of the pitch,
which is a judging criterion.

---

## 7. A fresh end-to-end successful mission — RESOLVED

`LVR-bda3ba68` completed 4/4 with both providers up and the pool publicly
reachable. The two earlier failures below were provider availability, and the
record is kept because it shows what the handoff machinery absorbs.

## 7b. The two earlier failures, kept for the record

**Action:** keep both the Ollama daemon and the OmniRoute router running, then
re-run `npm run mcp:harness`.

Two MCP-initiated missions were run in this pass. Both were real, both enforced
`$0.00`, both produced real cognitive handoffs, and **both failed to complete the
fixture**:

| Mission | Workers | Checkpoints | Result |
|---|---|---|---|
| `LVR-3eee5ff5` | 8 | 8 | FAILED — `INVALID_OUTPUT`, `PROVIDER_5XX` |
| `LVR-e95ef2c8` | 8 | 7 | FAILED — 1 of 4 tasks passed |

Both providers were **down when this pass started**. Ollama was started mid-pass
(15 local models) and the OmniRoute router was started and then dropped out
again. The recorded canonical run `LVR-f8f72d56` was produced when both were up
and healthy.

This is a provider-availability problem, not a regression: 47/47 invariant tests
still pass, and the failures are the ones the handoff machinery exists to absorb.
It is recorded here rather than hidden because "the demo run reproduces" is a
claim a judge may test.
