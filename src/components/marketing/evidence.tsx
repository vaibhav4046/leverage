import Link from 'next/link';
import { Reveal } from '@/components/visual/motion';
import { StatsBand } from '@/components/marketing/surfaces';
import type { MissionSnapshot } from '@/core/mission';
import type {
  LiveRun,
  PoolSweep,
  Probe,
  RocketRideRun,
  ScaleRun,
} from '@/components/marketing/evidence-data';

/**
 * Built in the open.
 *
 * The section a product site usually fills with subscriber counts and a revenue
 * chart. Leverage has neither, and inventing an analogue would break the one
 * argument the page makes. What it has instead is a record: the recorded
 * missions, the test suite, the scale harness, the capability probe, the hosted
 * pool sweep, and RocketRide credit balances read from billing before and after
 * each run. Every figure is read from its file at render time, and a card whose
 * file is missing is not drawn.
 */
export function Evidence({
  runs,
  tests,
  scale,
  probe,
  rocketRide,
  pool,
  live,
  planned,
}: {
  runs: MissionSnapshot[];
  tests: number | null;
  scale: ScaleRun | null;
  probe: Probe | null;
  rocketRide: RocketRideRun | null;
  pool: PoolSweep | null;
  live: LiveRun[];
  planned: MissionSnapshot | null;
}) {
  const cards: Card[] = [];
  if (tests) {
    cards.push({
      label: 'Tests',
      value: String(tests),
      sub: 'cases in tests/, counted from the files · npm run test',
      file: 'tests/*.test.ts',
    });
  }
  if (scale) {
    cards.push({
      label: 'Control plane at volume',
      value: `${scale.completed}/${scale.tasks}`,
      sub: `tasks · ${scale.duplicateClaims} duplicate claims · ${scale.budgetOvershoots} budget overshoots · ${scale.handoffs} handoffs for ${scale.outagesScripted} scripted outages · the paid candidate struck on all ${scale.paidCandidatesStruckOut} auctions`,
      file: 'demo/scale-run.json',
      tone: scale.duplicateClaims === 0 && scale.budgetOvershoots === 0 ? 'var(--color-state-pass)' : undefined,
    });
  }
  if (probe) {
    cards.push({
      label: 'Capability probe',
      value: `${probe.passedAll} of ${probe.models}`,
      sub: `models passed every probe · ${probe.partial} partial · ${probe.failed} failed · the failures are why handoffs exist`,
      file: 'demo/proof/capability-probe.json',
    });
  }
  if (pool) {
    cards.push({
      label: 'Hosted pool',
      value: String(pool.allowlist),
      sub: `model ids on the allowlist, each answered a real completion · ${pool.answered} of ${pool.listed} listed ids did`,
      file: 'demo/evidence/pool-sweep.json',
    });
  }
  if (rocketRide) {
    cards.push({
      label: 'RocketRide pipeline',
      value: rocketRide.output || 'READY',
      sub: `one worker through ${rocketRide.endpoint.replace(/^https?:\/\//, '')} · ${(rocketRide.latencyMs / 1000).toFixed(1)}s · ${rocketRide.creditsConsumed} credits`,
      file: 'demo/evidence/rocketride-run.json',
      tone: 'var(--color-state-pass)',
    });
  }

  const bills: Bill[] = [];
  if (rocketRide) {
    bills.push({
      label: 'One inference, one pipeline',
      credits: rocketRide.creditsConsumed,
      before: rocketRide.before,
      after: rocketRide.after,
      meta: `${rocketRide.modelId} · ${(rocketRide.latencyMs / 1000).toFixed(1)}s`,
      file: 'demo/evidence/rocketride-run.json',
    });
  }
  for (const l of live) {
    bills.push({
      label: l.planned ? 'Live run, plan written by a model' : 'Live run on the deployed site',
      credits: l.creditsUsed,
      before: l.creditsBefore,
      after: l.creditsAfter,
      meta: `${l.missionId} · ${l.passed}/${l.total} verified · ${(l.elapsedMs / 1000).toFixed(0)}s${
        l.plannedAtMs ? ` · planned at ${(l.plannedAtMs / 1000).toFixed(0)}s` : ''
      }`,
      file: `demo/evidence/${l.file}`,
    });
  }
  const credits = planned?.usage.rocketRideCredits;
  if (planned && credits) {
    bills.push({
      label: 'Recorded run, plan written by a model',
      credits: credits.used,
      before: credits.before,
      after: credits.after,
      meta: `${planned.mission.id} · ${planned.tasks.filter((t) => t.state === 'PASSED').length}/${planned.tasks.length} verified · ${(planned.mission.elapsedMs / 1000).toFixed(0)}s`,
      file: 'demo/planned-run.json',
      href: `/app/missions/${planned.mission.id}`,
    });
  }

  return (
    <section
      id="proof"
      className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Built in the open
          </div>
          <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            Every number on this page has a file.
          </h2>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            No subscriber count, no revenue chart, no logo wall. What this repository has is a
            record: the missions it ran, the tests that hold its claims, a scale harness, a
            capability probe, and a RocketRide bill read from billing. Each figure below is read
            from its file when the page renders, and the file is named so you can open it.
          </p>
        </Reveal>

        {runs.length > 0 && (
          <div className="mt-12">
            <StatsBand runs={runs} bare />
          </div>
        )}

        {cards.length > 0 && (
          <div className="mt-12 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
            {cards.map((c, i) => (
              <Reveal key={c.label} delay={i * 50} className="min-w-0">
                <div className="surface-card flex h-full min-w-0 flex-col p-5">
                  <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                    {c.label}
                  </div>
                  <div
                    className="mt-2 break-words text-[26px] leading-none tracking-[-0.02em]"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontWeight: 500,
                      color: c.tone ?? 'var(--color-quartz)',
                    }}
                  >
                    {c.value}
                  </div>
                  <div className="mt-2 flex-1 text-[12px] leading-snug text-[var(--color-ash)]">{c.sub}</div>
                  <div className="mono mt-3 truncate text-[10.5px] text-[var(--color-ash)] opacity-70">{c.file}</div>
                </div>
              </Reveal>
            ))}
          </div>
        )}

        {bills.length > 0 && (
          <div className="mt-16">
            <Reveal>
              <h3 className="heading text-[clamp(1.375rem,2.6vw,1.75rem)] text-[var(--color-quartz)]">
                The bill, read from billing.
              </h3>
              <p className="mt-3 max-w-[46rem] text-[15px] font-light leading-relaxed text-[var(--color-ash)]">
                Cloud workers run as RocketRide pipelines, and pipelines consume credits. Each run
                reads <span className="mono">billing.getCreditBalance</span> before and after, so
                the cost is measured rather than estimated. When billing cannot answer, the UI
                shows <span className="mono">unavailable</span> instead of a guess.
              </p>
            </Reveal>
            <div className="mt-8 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              {bills.map((b, i) => (
                <Reveal key={b.file + b.label} delay={i * 60} className="min-w-0">
                  <div className="surface-card relative flex h-full min-w-0 flex-col overflow-hidden p-5">
                    <span
                      aria-hidden
                      className="absolute inset-y-0 left-0 w-[2px]"
                      style={{ background: 'var(--color-frosted-lilac)', opacity: 0.8 }}
                    />
                    <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                      {b.label}
                    </div>
                    <div
                      className="mt-2 text-[28px] leading-none tracking-[-0.02em] text-[var(--color-quartz)]"
                      style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
                    >
                      {b.credits.toFixed(1)}
                      <span className="ml-1.5 text-[13px] text-[var(--color-ash)]">credits</span>
                    </div>
                    <div className="mono mt-2 text-[11.5px] tabular-nums text-[var(--color-mist)]">
                      {b.before.toFixed(1)} → {b.after.toFixed(1)}
                    </div>
                    <div className="mt-2 flex-1 break-words text-[12px] leading-snug text-[var(--color-ash)]">
                      {b.meta}
                    </div>
                    {b.href ? (
                      <Link
                        href={b.href}
                        className="mono mt-3 inline-flex min-h-[44px] max-w-full items-center truncate text-[10.5px] text-[var(--color-frosted-lilac)]"
                      >
                        {b.file}
                      </Link>
                    ) : (
                      <div className="mono mt-3 truncate text-[10.5px] text-[var(--color-ash)] opacity-70">{b.file}</div>
                    )}
                  </div>
                </Reveal>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

interface Card {
  label: string;
  value: string;
  sub: string;
  file: string;
  tone?: string;
}

interface Bill {
  label: string;
  credits: number;
  before: number;
  after: number;
  meta: string;
  file: string;
  href?: string;
}
