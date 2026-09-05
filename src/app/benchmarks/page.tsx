import fs from 'node:fs/promises';
import path from 'node:path';
import type { Metadata } from 'next';
import { Callout, Code, ContentPage, H2, Prose } from '@/components/marketing/page-shell';
import { Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Benchmarks · Leverage',
  description:
    'Measured results from recorded Leverage missions, the methodology behind them, and the comparisons we deliberately do not make.',
};

async function loadRun(file: string): Promise<MissionSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(path.resolve('demo', file), 'utf8')) as MissionSnapshot;
  } catch {
    return null;
  }
}

/**
 * RocketRide evidence, read from the file the verification script wrote.
 *
 * This page is about measurement, and until now it did not mention the execution
 * fabric once — in a RocketRide buildathon. The numbers below are credit deltas
 * against the real staging org, not a description of an integration.
 */
async function loadRocketRide(): Promise<{
  run: { latencyMs: number; engineTokens: number; creditsConsumed: number; workerOutput: string };
  before: { credits: number; granted: number };
  after: { credits: number; granted: number };
  endpoint: string;
  pipeline: { lane: string; credentialField: string; note: string };
} | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.resolve('demo/evidence/rocketride-run.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

async function loadRocketRideMission(): Promise<{
  missionId: string;
  status: string;
  elapsedSeconds: number;
  tasks: { total: number; passed: number };
  proofChecks: number;
  workers: { total: number; viaRocketRide: number; local: number };
  actualPaidInferenceUsd: number;
} | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.resolve('demo/evidence/rocketride-mission-summary.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

async function loadProbe(): Promise<{ results: { model: string; passed: number; total: number; note: string }[] } | null> {
  try {
    return JSON.parse(
      await fs.readFile(path.resolve('demo/proof/capability-probe.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

export default async function BenchmarksPage() {
  const [forge, arcade, probe, rr, rrMission] = await Promise.all([
    loadRun('canonical-run.json'),
    loadRun('arcade-run.json'),
    loadProbe(),
    loadRocketRide(),
    loadRocketRideMission(),
  ]);
  const runs = [
    { label: 'forge-app', sub: 'receipt-splitting library', run: forge },
    { label: 'arcade', sub: 'gravity-arena prototype', run: arcade },
  ].filter((r) => r.run) as { label: string; sub: string; run: MissionSnapshot }[];

  const probePass = probe?.results.filter((r) => r.passed === r.total).length ?? 0;

  return (
    <ContentPage
      eyebrow="Benchmarks"
      title="Measured, or not claimed."
      intro="Every number on this page was produced by a command in the repository. Where a figure is an estimate it says so, and where a comparison would be dishonest it is simply absent."
    >
      <H2>Recorded missions</H2>
      <Prose>
        <p>
          Two fixtures, both built the same way: the tests exist, the implementation does not,
          and the test files sit in each task&rsquo;s <em>reference</em> scope rather than its
          write scope. A worker can read what it must satisfy and cannot edit it, so the only
          route to a green suite is code that is actually correct.
        </p>
      </Prose>

      {runs.length > 0 ? (
        <div className="mt-8 grid gap-4 lg:grid-cols-2">
          {runs.map(({ label, sub, run }, i) => {
            const checks = run.proofs.flatMap((p) => p.checks);
            return (
              <Reveal key={label} delay={i * 80} className="min-w-0">
                <div className="surface-card h-full p-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <div className="text-[18px] text-[var(--color-quartz)]">{label}</div>
                      <div className="mt-0.5 text-[13px] text-[var(--color-ash)]">{sub}</div>
                    </div>
                    <span className="mono text-[11px] text-[var(--color-frosted-lilac)]">
                      {run.mission.id}
                    </span>
                  </div>

                  <dl className="mono mt-6 space-y-2.5 text-[12.5px]">
                    {[
                      ['tasks verified', `${run.tasks.filter((t) => t.state === 'PASSED').length} / ${run.tasks.length}`],
                      ['proof checks', `${checks.filter((c) => c.status === 'pass').length} / ${checks.length}`],
                      ['workers hired', String(run.workers.length)],
                      ['cognitive handoffs', String(run.checkpoints.length)],
                      ['elapsed', `${(run.mission.elapsedMs / 1000).toFixed(1)}s`],
                      ['local / free calls', `${run.usage.localCalls} / ${run.usage.freeCalls}`],
                    ].map(([k, v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <dt className="text-[var(--color-ash)]">{k}</dt>
                        <dd className="tabular-nums text-[var(--color-mist)]">{v}</dd>
                      </div>
                    ))}
                    <div className="flex justify-between gap-4 border-t border-[var(--color-obsidian-edge)] pt-2.5">
                      <dt className="text-[var(--color-ash)]">actual paid inference</dt>
                      <dd className="tabular-nums text-[var(--color-state-pass)]">
                        ${run.usage.paidSpendUsd.toFixed(2)}
                      </dd>
                    </div>
                  </dl>

                  {run.checkpoints.length > 0 && (
                    <div className="mt-5 border-t border-[var(--color-obsidian-edge)] pt-4">
                      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                        Handoffs
                      </div>
                      <ul className="mono mt-2 space-y-1 text-[12px] text-[var(--color-mist)]">
                        {run.checkpoints.map((c) => (
                          <li key={c.id}>
                            {c.reason} · {c.originalContextTokens} → {c.checkpointTokens} tokens (
                            <span className="text-[var(--color-state-pass)]">
                              {c.reductionPct}% smaller
                            </span>
                            )
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </Reveal>
            );
          })}
        </div>
      ) : (
        <Callout title="No recorded runs">
          Run <code className="mono">npm run mission</code> to produce one. This page will not
          show numbers nobody measured.
        </Callout>
      )}

      {rr ? (
        <>
          <H2>RocketRide executed the cloud workers</H2>
          <Prose>
            <p>
              Leverage decides which intelligence deserves a job. RocketRide runs it. A worker whose
              cost class is not <code className="mono">local</code> or <code className="mono">host</code>{' '}
              executes as a RocketRide pipeline, so the sponsor is on the critical path rather than
              beside it.
            </p>
            <p>
              These are credit deltas against the real staging organisation, written by{' '}
              <code className="mono">npm run verify:rocketride</code> to{' '}
              <code className="mono">demo/evidence/rocketride-run.json</code>. A health check would
              prove nothing, so the figure that matters is the one at the bottom: the worker inside
              the pipeline returned output.
            </p>
          </Prose>

          <Reveal className="min-w-0">
            <div className="surface-card mt-8 min-w-0 overflow-x-auto">
              <table className="w-full min-w-0 border-collapse text-left">
                <caption className="sr-only">RocketRide staging execution evidence</caption>
                <tbody>
                  {([
                    ['Endpoint', rr.endpoint],
                    ['Balance before the script', `${rr.before.credits} / ${rr.before.granted}`],
                    ['Balance after the script', `${rr.after.credits} / ${rr.after.granted}`],
                    ['Balance moved', (rr.before.credits - rr.after.credits).toFixed(2)],
                    // Two measurements, two figures: the balance rows bracket the whole
                    // script, this row is what the pipeline run reported for itself.
                    ['Reported by the pipeline run', rr.run.creditsConsumed.toFixed(2)],
                    ['Round trip', `${(rr.run.latencyMs / 1000).toFixed(1)}s`],
                    ['Engine tokens', String(rr.run.engineTokens)],
                    ['Worker output', `"${rr.run.workerOutput}"`],
                  ] as [string, string][]).map(([k, v]) => (
                    <tr key={k} className="border-b border-[var(--color-inkline)] last:border-0">
                      <th
                        scope="row"
                        className="mono w-[190px] px-5 py-3 text-left text-[11px] font-normal uppercase tracking-[0.08em] text-[var(--color-ash)]"
                      >
                        {k}
                      </th>
                      <td className="mono px-5 py-3 text-[13px] text-[var(--color-mist)]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>

          {rrMission ? (
            <Prose>
              <p>
                One full mission ran this way. Mission{' '}
                <code className="mono">{rrMission.missionId}</code> was started through the MCP tool{' '}
                <code className="mono">leverage_run</code>, not a script:{' '}
                <strong className="font-normal text-[var(--color-quartz)]">
                  {rrMission.tasks.passed}/{rrMission.tasks.total} tasks verified
                </strong>{' '}
                across {rrMission.proofChecks} proof checks in {rrMission.elapsedSeconds}s, with{' '}
                {rrMission.workers.viaRocketRide} of {rrMission.workers.total} workers executing as
                RocketRide pipelines and{' '}
                <strong className="font-normal text-[var(--color-state-pass)]">
                  ${rrMission.actualPaidInferenceUsd.toFixed(2)}
                </strong>{' '}
                of paid inference.
              </p>
            </Prose>
          ) : null}

          <Callout title="Three things RocketRide's own docs get wrong">
            An LLM component wired to the control lane runs, consumes credits, and returns its input
            unchanged; the worker has to sit in the data lane. The credential field is{' '}
            <code className="mono">{rr.pipeline.credentialField}</code>, though the server error asks
            for <code className="mono">api_key</code>. And the hackathon runs on staging, not the host
            the SDK defaults to. All three cost us a day and are written up in{' '}
            <code className="mono">docs/ROCKETRIDE_FINDINGS.md</code>.
          </Callout>
        </>
      ) : null}

      <H2>Capability probe</H2>
      <Prose>
        <p>
          A cold-start auction is blind: with no observations every candidate scores the prior,
          so the winner is effectively arbitrary. On the first real run the auction hired two
          models that return an <em>empty response</em> to any structured request, then burned
          three attempts discovering it.
        </p>
        <p>
          So every reachable model is probed with small, real, executable tasks, verified by
          running what it wrote rather than reading it.
        </p>
      </Prose>

      {probe && (
        <div className="surface-card mt-8 overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <caption className="sr-only">Capability probe results per model</caption>
            <thead>
              <tr className="border-b border-[var(--color-obsidian-edge)]">
                {['Model', 'Result', 'Note'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="mono px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {probe.results.map((r) => (
                <tr key={r.model} className="border-b border-[var(--color-inkline)] last:border-0">
                  <td className="mono px-5 py-3 text-[12.5px] text-[var(--color-quartz)]">
                    {r.model}
                  </td>
                  <td className="mono px-5 py-3 text-[12px] tabular-nums">
                    <span
                      style={{
                        color:
                          r.passed === r.total
                            ? 'var(--color-state-pass)'
                            : r.passed > 0
                              ? 'var(--color-state-warn)'
                              : 'var(--color-state-fail)',
                      }}
                    >
                      {r.passed}/{r.total}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[12px] text-[var(--color-ash)]">
                    {r.note || '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Prose>
        <p className="mt-6">
          {probePass} of {probe?.results.length ?? 0} models completed every probe. The failure
          modes were not subtle: timeouts, HTTP 500 from the local runtime, malformed output, and
          one genuine HTTP 429.
        </p>
      </Prose>

      <Callout title="The probe is unstable between runs" tone="warn">
        Run twice against the same models, minutes apart, the results disagreed:
        <span className="mono"> qwen2.5-coder</span> went 2/2 then 1/2,
        <span className="mono"> gemma3:4b</span> went 2/2 then 0/2,
        <span className="mono"> kodro-fast</span> went 0/2 then 2/2. That is what small models on
        free routes actually behave like, and it is the strongest argument for the architecture: a
        system that picks one model up front and trusts it is betting on a coin flip. Leverage
        assumes any worker may fail, verifies every result, and keeps the understanding when one
        does.
      </Callout>

      <H2>Estimated frontier-equivalent cost</H2>
      <Prose>
        <p>
          The one derived number, and the one most likely to be abused. What it means, precisely:
          take the prompt and completion tokens <em>actually observed during the run</em>, price
          them at published frontier API rates, report the result.
        </p>
      </Prose>
      <Code label="src/core/budget.ts · FRONTIER_BASELINE">{`baseline   Claude Sonnet 4.5 published pricing
           $3.00 / 1M input · $15.00 / 1M output

${runs.map((r) => `${r.label.padEnd(10)} $${r.run.usage.estimatedFrontierEquivalentUsd.toFixed(4)}`).join('\n')}`}</Code>
      <Prose>
        <p>
          It is <strong className="font-normal text-[var(--color-mist)]">not</strong> a saving,
          not a charge, and not a claim about what a frontier agent would have spent solving the
          problem. That agent would plausibly have used a different number of tokens and far
          fewer attempts. It prices this workload at those rates and nothing more.
        </p>
      </Prose>

      <H2>What is deliberately absent</H2>
      <Prose>
        <p>
          <strong className="font-normal text-[var(--color-mist)]">No baseline comparison.</strong>{' '}
          Running the same mission on a single frontier model needs a paid API key this build does
          not have. Rather than invent one, there isn&rsquo;t one: no speedup multiple, no
          cost-reduction percentage, no &ldquo;N× faster&rdquo; anywhere in this repository.
        </p>
        <p>
          <strong className="font-normal text-[var(--color-mist)]">One language, two fixtures.</strong>{' '}
          Nothing here generalises to a large polyglot repository and no such claim is made.
        </p>
        <p>
          <strong className="font-normal text-[var(--color-mist)]">
            The benchmark plans are committed, not planner-generated.
          </strong>{' '}
          A benchmark whose task graph changes between runs measures the planner, not the
          workforce.
        </p>
        <p>
          <strong className="font-normal text-[var(--color-mist)]">
            The rate limit in the canonical run is injected.
          </strong>{' '}
          It is deterministic, and labelled INJECTED in the event stream, the UI and here. What
          is being demonstrated is the recovery, not the coincidence.
        </p>
      </Prose>

      <H2>Reproduce it</H2>
      <Code>{`npm run fixture:reset
npm run mission -- --inject-429

npm run fixture:reset:arcade
npm run mission -- --arcade`}</Code>
      <Prose>
        <p>
          It will not reproduce identically. These are stochastic models on free routes and the
          number of attempts and handoffs varies. What is stable is the shape: every task is
          verified before it is accepted, and paid spend is $0.00 every time, because that part
          is policy rather than luck.
        </p>
      </Prose>
    </ContentPage>
  );
}
