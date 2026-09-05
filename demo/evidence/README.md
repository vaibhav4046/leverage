# Evidence files

Every file here was produced by a command in the repository against a real
service; none is hand-written. Two generations coexist, and the newer does not
delete the older, because a record that was true when it was made stays true.

| File | What it records | Generation |
|---|---|---|
| `rocketride-run.json` | `npm run verify:rocketride`: one worker executed as a RocketRide pipeline, with the org and credit balances read from billing before and after | tunnel era |
| `rocketride-mission-summary.json` | the first whole mission executed through RocketRide, when the pool was reached through a temporary public tunnel to a local router | tunnel era |
| `live-run-LVR-783bade5.sse` | the SSE transcript of the first live run on the deployed site: every event, credits before and after | hosted pool |
| `pool-sweep.json` | `node scripts/pool-sweep.mjs`: every candidate id on each upstream asked for one completion, with status and latency | hosted pool |
| `mcp-*.json`, `mcp-*.jsonl` | `scripts/mcp-harness.ts`: a mission driven end to end through the MCP server, request by request | both |

The tunnel era is superseded. Since 5 September the pool is the deployment's own
`/api/v1/pool`, token gated, with no tunnel anywhere; `demo/hosted-pool-mission.json`
and the live run are the current proof. The tunnel files stay because they are the
first time RocketRide executed a worker for this project, and because the findings
in `docs/ROCKETRIDE_FINDINGS.md` were made while they were being produced.
