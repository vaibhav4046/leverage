# Overnight baseline

Established 4 September 2026, before any change in this pass. Every line is a
command that was run, not a recollection.

## Repository

| | |
|---|---|
| Branch | `master` |
| Commit at start | `d782974` |
| Working tree | clean (0 modified) |
| Remote | https://github.com/vaibhav4046/leverage (public) |
| Node | v24.12.0 |
| npm | 11.6.2 |
| Package manager | npm (`package-lock.json`, no pnpm/yarn lockfile) |

## Verification

| Command | Exit | Result |
|---|---|---|
| `npx tsc --noEmit` | 0 | clean |
| `npm run test` | 0 | 1 file, **47 passed** |
| `npm audit --omit=dev` | 0 | **0 vulnerabilities** |
| `npx next build` | 0 | compiled successfully |

## Environment actually available

Checked by name only; no value was read or printed.

| Credential | Present | Consequence |
|---|---|---|
| `ROCKETRIDE_APIKEY` / `ROCKETRIDE_URI` | yes | staging execution possible |
| `OLLAMA_BASE_URL` | yes | local models reachable once the daemon runs |
| `OMNIROUTE_BASE_URL` | yes | free pool reachable once the router runs |
| `ENCRYPTION_MASTER_KEY` | yes | BYOK envelope available |
| `LEVERAGE_DEV_AUTH` | yes | full execution mode locally |
| `ELEVENLABS_API_KEY` | **no** | narration cannot be generated |
| `NEXT_PUBLIC_PRIVY_APP_ID` / `PRIVY_APP_SECRET` | **no** | production auth cannot be claimed |
| `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SECRET_KEY` | **no** | Postgres repository stays unexercised |

## Provider state at start

| Provider | State at baseline | After this pass |
|---|---|---|
| ollama | `UNAVAILABLE` (daemon not running) | started; **15 local models** |
| pool (OmniRoute) | `UNAVAILABLE` (router not running) | started; healthy, then dropped again |
| host (MCP sampling) | `UNAVAILABLE` (no host attached) | unchanged |
| agent-cli | `HEALTHY` | `claude` and `opencode` signed in; `codex` and `gemini` absent |

Both the local runtime and the free pool were **down at the start of this pass**.
That is the single most important baseline fact: the recorded canonical run was
produced when they were up, and a fresh run is only comparable once they are
running again.

## Tooling gaps found at baseline

- **`npm run mcp` was broken.** It ran `tsx mcp/server.ts`, and tsx compiles the
  file to CJS, which cannot hold the server's top-level `await`
  (`ERROR: Top-level await is currently not supported with the "cjs" output
  format`). Node 24 strips types natively, so the script is now
  `node mcp/server.ts`. Nothing had exercised this path before.
- **No Playwright installed**, so no browser capture harness existed.
- **No `demo/evidence/` directory**, so no MCP or RocketRide artifacts were being
  written anywhere a judge could read them.
