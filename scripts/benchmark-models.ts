/**
 * Capability probe — "benchmark on connect".
 *
 * Cold-start auctions are blind: with no observations every candidate scores the
 * prior, so the winner is effectively arbitrary. That is not a hypothetical — on the
 * first real run the auction hired two models that return an empty response to any
 * structured request, and burned three attempts discovering it.
 *
 * This runs one small, real, verifiable job against every discovered model and
 * records the outcome as genuine observations. It is a synthetic benchmark and is
 * labelled as such: it seeds reputation, it does not replace the record a model
 * earns on actual mission work.
 *
 *   npx tsx scripts/benchmark-models.ts
 */
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
dotenv.config();

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildRegistry } from '../src/providers/registry';
import { ReputationStore } from '../src/core/reputation';
import { parseWorkerOutput, WORKER_OUTPUT_CONTRACT } from '../src/core/worker-output';
import type { TaskCategory } from '../src/core/types';

const STATE_DIR = path.resolve('.leverage-state');
const PROBE_TIMEOUT_MS = 25_000;

/**
 * One probe per capability family. Each is checked by *executing* what the model
 * wrote, not by reading it — a model that emits plausible-looking code that throws
 * has not demonstrated the capability.
 */
const PROBES: {
  category: TaskCategory;
  ask: string;
  verify: (code: string) => Promise<boolean>;
}[] = [
  {
    category: 'backend',
    ask:
      'Create src/probe.js as an ES module exporting a single function `add(a, b)` that returns the sum of two numbers.',
    verify: async (code) => {
      const mod = await importInline(code);
      return typeof mod.add === 'function' && mod.add(2, 3) === 5 && mod.add(-1, 1) === 0;
    },
  },
  {
    category: 'tests',
    ask:
      'Create src/probe.js as an ES module exporting `clamp(n, lo, hi)` which returns n limited to the inclusive range [lo, hi].',
    verify: async (code) => {
      const mod = await importInline(code);
      return (
        typeof mod.clamp === 'function' &&
        mod.clamp(5, 0, 10) === 5 &&
        mod.clamp(-3, 0, 10) === 0 &&
        mod.clamp(99, 0, 10) === 10
      );
    },
  },
];

async function main() {
  const registry = buildRegistry({
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL,
    poolBaseUrl: process.env.OMNIROUTE_BASE_URL,
    poolApiKey: process.env.OMNIROUTE_API_KEY ?? 'sk-leverage-pool',
  });
  await registry.sweep(true);

  const models = registry.allModels();
  console.log(`Probing ${models.length} models across ${PROBES.length} capability probes.\n`);

  const store = await loadReputation();
  const results: { model: string; passed: number; total: number; ms: number; note: string }[] = [];

  for (const model of models) {
    const adapter = registry.adapterFor(model)!;
    let passed = 0;
    let totalMs = 0;
    let note = '';

    for (const probe of PROBES) {
      const started = Date.now();
      let ok = false;
      try {
        const res = await adapter.invoke(
          model,
          {
            system:
              'You are a precise software engineer.',
            user: `${probe.ask}

${WORKER_OUTPUT_CONTRACT}`,
            maxOutputTokens: 900,
            temperature: 0.1,
            timeoutMs: PROBE_TIMEOUT_MS,
          },
          AbortSignal.timeout(PROBE_TIMEOUT_MS + 5_000),
        );

        if (!res.text.trim()) {
          note = note || 'returned an empty response';
        } else {
          const out = parseWorkerOutput(res.text);
          const file = out.files[0];
          if (!file) {
            note = note || 'no file in output';
          } else {
            ok = await probe.verify(file.content).catch(() => false);
            if (!ok) note = note || 'code did not behave correctly';
          }
        }
      } catch (err) {
        note = note || describe(err);
      }

      const ms = Date.now() - started;
      totalMs += ms;
      if (ok) passed += 1;

      store.record({
        modelKey: model.key,
        providerId: model.providerId,
        category: probe.category,
        verified: ok,
        qualityScore: ok ? 100 : 0,
        durationMs: ms,
        costUsd: 0,
        handedOff: false,
        at: new Date().toISOString(),
      });
    }

    const verdict = passed === PROBES.length ? 'PASS' : passed > 0 ? 'PARTIAL' : 'FAIL';
    results.push({ model: model.key, passed, total: PROBES.length, ms: totalMs, note });
    console.log(
      `  ${verdict.padEnd(8)} ${model.key.padEnd(34)} ${passed}/${PROBES.length}  ` +
        `${String(Math.round(totalMs / PROBES.length)).padStart(6)}ms avg  ${note}`,
    );
  }

  await fs.mkdir(STATE_DIR, { recursive: true });
  await fs.writeFile(
    path.join(STATE_DIR, 'reputation.json'),
    JSON.stringify(store.toJSON(), null, 2),
  );
  await fs.writeFile(
    path.join(STATE_DIR, 'capability-probe.json'),
    JSON.stringify({ at: new Date().toISOString(), probes: PROBES.length, results }, null, 2),
  );

  const usable = results.filter((r) => r.passed === r.total);
  console.log(
    `\n${usable.length}/${results.length} models completed every probe. ` +
      `Reputation seeded at ${path.join(STATE_DIR, 'reputation.json')}.`,
  );
  if (usable.length === 0) {
    console.log('No model passed. The mission would have nothing to hire.');
    process.exit(1);
  }
}

/**
 * Execute the model's module in-process via a data: URL.
 *
 * This is benchmark-only and the input is code we asked a model to write, which is
 * still untrusted — it runs with a hard timeout and never touches the repository.
 * The mission path never does this; there, generated code is written to a scoped
 * file and exercised by a separate process.
 */
async function importInline(code: string): Promise<Record<string, unknown>> {
  const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
  return (await import(url)) as Record<string, unknown>;
}

function describe(err: unknown): string {
  if (err instanceof Error) return err.message.slice(0, 60);
  return String(err).slice(0, 60);
}

async function loadReputation(): Promise<ReputationStore> {
  try {
    const raw = await fs.readFile(path.join(STATE_DIR, 'reputation.json'), 'utf8');
    return ReputationStore.fromJSON(JSON.parse(raw));
  } catch {
    return new ReputationStore();
  }
}

main().catch((err) => {
  console.error('probe aborted:', err?.message ?? err);
  process.exit(1);
});
