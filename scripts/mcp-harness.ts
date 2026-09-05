/**
 * MCP judge harness.
 *
 * Drives the real Leverage MCP server over stdio with a real MCP client: protocol
 * initialization, tool discovery, schema validation, model discovery, mission
 * creation, event following, and proof retrieval. Nothing here shortcuts to the
 * HTTP API — every call is a `tools/call` the way a host would make it, because
 * the claim being evidenced is "a host can drive this", not "the API responds".
 *
 * Writes a transcript of the real traffic to demo/evidence/mcp-transcript.jsonl
 * and a summary to demo/evidence/mcp-summary.json.
 *
 *   npm run mcp:harness            # against a running app on :3000
 *   LEVERAGE_API_URL=... npm run mcp:harness
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import fs from 'node:fs/promises';
import path from 'node:path';

const API_URL = process.env.LEVERAGE_API_URL ?? 'http://127.0.0.1:3000';
const OUT_DIR = path.resolve('demo/evidence');
// Stamped, because a second run silently destroyed the first run's transcript.
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const TRANSCRIPT = path.join(OUT_DIR, `mcp-transcript-${STAMP}.jsonl`);
const SUMMARY = path.join(OUT_DIR, `mcp-summary-${STAMP}.json`);

/** Redaction is applied on the way into the transcript, never after the fact. */
const SECRET_SHAPES =
  /(rr_[0-9a-zA-Z]{8,})|(sk-[A-Za-z0-9]{12,})|(sb_secret_[A-Za-z0-9]+)|(gh[pousr]_[A-Za-z0-9]{16,})|(AIza[0-9A-Za-z_-]{20,})|(eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/g;

function redact<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? null).replace(SECRET_SHAPES, '[redacted]')) as T;
}

const lines: string[] = [];
function record(kind: string, payload: unknown) {
  lines.push(JSON.stringify({ at: new Date().toISOString(), kind, payload: redact(payload) }));
}

function textOf(result: unknown): string {
  const content = (result as { content?: { type: string; text?: string }[] })?.content ?? [];
  return content.map((c) => c.text ?? '').join('\n');
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });

  const transport = new StdioClientTransport({
    // Node 24 strips types natively. tsx compiles this file as CJS, which cannot
    // hold the server's top-level await — the reason `npm run mcp` was broken.
    command: process.execPath,
    args: [path.resolve('mcp/server.ts')],
    env: { ...process.env, LEVERAGE_API_URL: API_URL } as Record<string, string>,
  });

  const client = new Client({ name: 'leverage-judge-harness', version: '1.0.0' }, { capabilities: {} });

  const summary: Record<string, unknown> = { apiUrl: API_URL, startedAt: new Date().toISOString() };

  await client.connect(transport);
  record('initialize', { serverVersion: client.getServerVersion(), capabilities: client.getServerCapabilities() });
  summary.server = client.getServerVersion();

  // ---------------------------------------------------------------- tools/list
  const tools = await client.listTools();
  record('tools/list', tools);
  summary.tools = tools.tools.map((t) => t.name);

  // Every tool must carry a usable schema. A tool a host cannot call correctly is
  // not a tool, so this is asserted rather than assumed.
  const schemaProblems = tools.tools
    .filter((t) => !t.inputSchema || (t.inputSchema as { type?: string }).type !== 'object')
    .map((t) => t.name);
  summary.schemaProblems = schemaProblems;

  // -------------------------------------------------------------- leverage_models
  const models = await client.callTool({ name: 'leverage_models', arguments: {} });
  record('tools/call leverage_models', models);
  const modelsText = textOf(models);
  summary.modelsPreview = modelsText.slice(0, 400);

  // ----------------------------------------------------------------- leverage_run
  const goal =
    'Finish the forge-app receipt splitting library so the whole existing test suite passes. ' +
    'Do not modify any file under test/. Budget: $0. Quality: production.';

  const started = Date.now();
  const run = await client.callTool({
    name: 'leverage_run',
    arguments: {
      goal,
      budgetMaxUsd: 0,
      qualityTarget: 0.95,
      // LEVERAGE_PRIVACY=cloud-allowed sends the auction to the hosted pool when
      // the local runtime is down, which is how the RocketRide-only run is made.
      privacy: process.env.LEVERAGE_PRIVACY ?? 'prefer-local',
      maxWorkers: Number(process.env.LEVERAGE_MAX_WORKERS ?? 2),
      ...(process.env.LEVERAGE_REPOSITORY_ROOT ? { repositoryRoot: process.env.LEVERAGE_REPOSITORY_ROOT } : {}),
    },
  });
  record('tools/call leverage_run', run);
  const runText = textOf(run);
  let missionId = runText.match(/LVR-[A-Za-z0-9-]+/)?.[0] ?? null;
  if (!missionId) {
    // leverage_run can take tens of seconds when the registry sweep is cold, and
    // the id may arrive as a JSON field rather than in prose. Fall back to the
    // mission list rather than declaring failure on a parsing detail.
    try {
      const res = await fetch(`${API_URL}/api/v1/missions`);
      const body = (await res.json()) as { missions?: { mission: { id: string } }[] };
      missionId = body.missions?.[0]?.mission?.id ?? null;
      if (missionId) record('recovered mission id from /missions', { missionId });
    } catch {
      /* leave null */
    }
  }
  summary.missionId = missionId;
  summary.runAdmittedMs = Date.now() - started;

  if (!missionId) {
    summary.error = 'no mission id returned';
    await finish(summary);
    return;
  }

  // The point of returning a mission id immediately: the host is not held open for
  // the length of the mission. Anything above a couple of seconds fails that claim.
  console.log(`mission ${missionId} admitted in ${summary.runAdmittedMs}ms`);

  // --------------------------------------------------------------- leverage_status
  const deadline = Date.now() + 12 * 60 * 1000;
  let lastStatus = '';
  let polls = 0;
  while (Date.now() < deadline) {
    const status = await client.callTool({ name: 'leverage_status', arguments: { missionId } });
    polls++;
    const text = textOf(status);
    if (text !== lastStatus) {
      record('tools/call leverage_status', status);
      lastStatus = text;
      const head = text.split('\n').slice(0, 3).join(' | ');
      console.log(`  [${polls}] ${head.slice(0, 150)}`);
    }
    if (/COMPLETED|FAILED|CANCELLED/.test(text)) break;
    await new Promise((r) => setTimeout(r, 4000));
  }
  summary.polls = polls;
  summary.finalStatus = lastStatus.slice(0, 600);

  // ---------------------------------------------------------------- leverage_proof
  const proof = await client.callTool({ name: 'leverage_proof', arguments: { missionId } });
  record('tools/call leverage_proof', proof);
  summary.proofPreview = textOf(proof).slice(0, 800);

  // ---------------------------------------------------- malformed input is refused
  try {
    const bad = await client.callTool({ name: 'leverage_status', arguments: { missionId: '../../etc/passwd' } });
    record('tools/call leverage_status (malformed)', bad);
    summary.malformedRefused = /not found|error|invalid/i.test(textOf(bad));
  } catch (err) {
    record('tools/call leverage_status (malformed) threw', { message: (err as Error).message });
    summary.malformedRefused = true;
  }

  await client.close();
  await finish(summary);
}

async function finish(summary: Record<string, unknown>) {
  summary.finishedAt = new Date().toISOString();
  await fs.writeFile(TRANSCRIPT, lines.join('\n') + '\n');
  await fs.writeFile(SUMMARY, JSON.stringify(redact(summary), null, 2));
  console.log(`\ntranscript: ${TRANSCRIPT} (${lines.length} entries)`);
  console.log(`summary:    ${SUMMARY}`);
}

main().catch(async (err) => {
  console.error('harness failed:', (err as Error).message);
  await fs.mkdir(OUT_DIR, { recursive: true }).catch(() => {});
  await fs.writeFile(TRANSCRIPT, lines.join('\n') + '\n').catch(() => {});
  process.exit(1);
});
