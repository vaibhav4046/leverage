/**
 * RocketRide connectivity check.
 *
 * Run this after rotating the key. It proves the whole execution path, not just
 * that a socket opened: connect, authenticate, deploy the worker pipeline, execute
 * a real inference through it, and read the credit delta the run actually cost.
 *
 *   npm run verify:rocketride
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import { RocketRideExecutor } from '../src/rocketride/executor';
import type { ContextBundle } from '../src/core/types';

async function main() {
  const apiKey = process.env.ROCKETRIDE_APIKEY;
  const uri = process.env.ROCKETRIDE_URI ?? 'https://staging.rocketride.ai';
  const pool = process.env.LEVERAGE_POOL_URL ?? process.env.OMNIROUTE_BASE_URL;

  if (!apiKey) fail('ROCKETRIDE_APIKEY is not set. Run: pnpm exec rocketride login');
  if (!pool) fail('Set LEVERAGE_POOL_URL to a publicly reachable OpenAI-compatible endpoint.');

  console.log(`endpoint  ${uri}`);
  console.log(`pool      ${redactHost(pool!)}`);

  const executor = new RocketRideExecutor({
    apiKey: apiKey!,
    uri,
    poolBaseUrl: pool!,
    poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
  });

  const health = await executor.health();
  if (!health.ok) fail(`authentication failed: ${health.detail ?? 'unknown'}`);
  console.log(`auth      ok (org ${health.orgId?.slice(0, 8)}...)`);

  const before = await executor.credits();
  console.log(`credits   ${before ? `${before.balance} / ${before.granted}` : 'unavailable'}`);

  const bundle: ContextBundle = {
    taskSummary: 'Connectivity check',
    constraints: [],
    files: [],
    dependencyResults: [],
    failures: [],
    approximateTokens: 64,
    availableRepoTokens: 0,
  };

  console.log('running   one inference through the worker pipeline...');
  const started = Date.now();
  const result = await executor.runWorker({
    modelId: process.env.POOL_MODEL ?? 'auto/best-free',
    role: 'Connectivity check',
    bundle,
    ask: 'Reply with exactly the word READY and nothing else.',
  });

  const after = await executor.credits();
  await executor.close();

  console.log(`answer    ${JSON.stringify(result.text.trim().slice(0, 80))}`);
  console.log(`latency   ${Date.now() - started}ms`);
  if (result.engineTokens !== undefined) console.log(`engine    ${result.engineTokens} tokens`);
  if (before && after) {
    console.log(`consumed  ${(before.balance - after.balance).toFixed(2)} credits`);
  }

  const answer = result.text.trim();
  if (!answer) fail('pipeline returned an empty answer — the LLM node is not wired');

  // A pipeline that runs, bills us, and hands back the provider's error string is
  // not a verified execution path. Reporting it as one would put a fabricated
  // success into the evidence file, which is the exact failure this project spends
  // most of its effort avoiding.
  if (/^\*\*LLM error\*\*|ValueError|An error occurred with the API/i.test(answer)) {
    fail(
      `the pipeline executed and consumed credits, but the worker returned a provider error: ` +
        `${answer.slice(0, 120)}. The pool endpoint is probably not reachable from RocketRide's cloud.`,
    );
  }
  console.log('\nRocketRide execution path verified.');
}

function fail(message: string): never {
  console.error(`\nFAILED: ${message}`);
  process.exit(1);
}

/** Never print a full endpoint that might carry a token in its path. */
function redactHost(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return '(unparseable)';
  }
}

main().catch((err) => fail(err?.message ?? String(err)));
