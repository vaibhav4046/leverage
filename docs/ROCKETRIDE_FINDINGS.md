# RocketRide integration — what is actually true

Reverse-engineered against the live staging engine, because the published docs
disagree with the running system in three places. Every line here was verified by
executing it.

## Endpoint

| Source | Value | Result |
|---|---|---|
| `docs.rocketride.org/develop/typescript` | `https://cloud.rocketride.ai` | **wrong host**, 403 |
| SDK `CONST_DEFAULT_WEB_CLOUD` | `https://api.rocketride.ai` | 403 for a hackathon key |
| Hackathon handbook | `https://staging.rocketride.ai` | **correct** |

## Pipeline shape

`use()` rejects a pipeline without a `source` field naming the entry component.
`validate()` does **not** catch this, so validate-passing is not run-ready.

## The two wire types are not interchangeable

A `control` connection is a capability, not a call. Wiring `llm_openai_api` to a
`response` node via `control` produces a pipeline that runs, reports no errors,
consumes credits and returns the input unchanged — because nothing ever invokes the
model. This is the single most expensive failure mode to debug, since it looks like
success. The LLM must sit **in the data lane**.

## Working worker pipeline

```
webhook --questions--> llm_openai_api --answers--> response
```

Valid lanes on `llm_openai_api`: `text`, `questions`, `answers`. `data`, `message`,
`response`, `completion`, `result` are all rejected.

## Config field names

The credential field is **`apikey`**, not `api_key` — even though the server's own
error message asks for `api_key`:

```
Missing credentials. Please pass an `api_key`, ...
```

Passing `api_key` reproduces that error verbatim. Passing `apikey` works.

```json
{
  "model": "auto/best-free",
  "base_url": "https://<host>/",
  "apikey": "<key>",
  "modelTotalTokens": 32768,
  "openai_api.profile": "custom"
}
```

## Driving it

`send()` pushes a raw object down the data lane. For a `questions` lane you want
`chat({ token, question })` with a `Question` from the SDK schema — it carries
`role`, `instructions`, `examples`, `context`, `goals`, `questions`, `documents`
and `expectJson`, which is a near-exact fit for a compiled worker context bundle.

Verified round trip:

```
chat -> {"answers":["4"]}   4823 ms
task tokens  -> 1.6
credits      -> 4993.5 to 4991.5   (delta 2.0)
```

A `send()` on the same pipeline returns in ~340 ms with the input echoed — that
latency gap is the reliable tell that no inference happened.

## Cost per run

Measured, not estimated:

| Pipeline | Credits |
|---|---|
| `webhook -> response` (no model) | 0.4 |
| `webhook -> llm_openai_api -> response`, one question | 2.0 |

`billing.getCreditBalance(orgId)` returns real balances, so Leverage reports
consumption rather than guessing it.

## base_url means what it means to an OpenAI client

`llm_openai_api` appends `chat/completions` to `base_url`, the way the OpenAI SDK
does when `base_url` already ends in `/v1`. It does not append `v1/chat/completions`.
A router mounted at the root of a host hides this, because most routers answer both
spellings. A pool mounted at a sub-path does not: with the pool at
`https://host/api/v1/pool` and a route that only knew `v1/chat/completions`, the
pipeline ran, billed 1.50 credits, and the worker reported
`**LLM error** — ValueError: An error occurred with the API.` with nothing more
specific. The pool now accepts both spellings. If a worker returns that error and
the pool is reachable, check the path before anything else.

## terminate() is not optional

`disconnect()` drops the socket; the pipeline keeps running server-side. Every
Leverage worker run terminates its task in a `finally`.
