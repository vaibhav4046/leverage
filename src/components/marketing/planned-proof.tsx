import Link from 'next/link';
import type { MissionSnapshot } from '@/core/mission';
import { IconArrowRight, IconVerified, IconModels } from '@/components/icons';

/**
 * The question after "does it work on the benchmark" is "does it work on mine".
 *
 * The benchmarks carry committed plans on purpose, so they measure the workforce
 * and not the planner; that leaves the planner unproven unless a run with no
 * committed plan is on the record. This section is that run. Every figure is read
 * from the recorded mission at render time, the planner's own record comes from
 * the mission.compiled event it wrote, and if the recording is missing the
 * section does not render rather than describe something that did not happen.
 */
export function PlannedProof({ run }: { run: MissionSnapshot | null }) {
  if (!run) return null;
  const compiled = run.events.find(
    (e) => e.type === 'mission.compiled' && (e.data as { planner?: unknown } | undefined)?.planner,
  );
  const planner = (compiled?.data as { planner?: { displayName?: string; costClass?: string; durationMs?: number } } | undefined)?.planner;
  if (!planner?.displayName) return null;

  const passed = run.tasks.filter((t) => t.state === 'PASSED').length;
  const suites = run.proofs.flatMap((p) => p.checks).filter((c) => c.id === 'suite');
  const wholeSuite = run.events.find((e) => e.type === 'proof.check' && e.message.startsWith('Whole test suite'));
  const wholeGreen = wholeSuite?.message.includes(': PASS:') ?? false;
  const credits = run.usage.rocketRideCredits;

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Your repository
        </div>
        <h2 className="heading mt-3 max-w-[46rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          Point it at a repository and a model writes the plan.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          The benchmarks run committed plans so they measure the workforce, not the planner. This
          mission had none: a planner model read the repository and its tests, proposed the task
          graph, the compiler validated it, and every task was held to the test file that covers
          it, then the whole suite was run once more.
        </p>

        <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            icon={<IconModels size={17} />}
            label="Planned by"
            value={planner.displayName}
            sub={`${planner.costClass ?? 'free'} route · ${((planner.durationMs ?? 0) / 1000).toFixed(1)}s to a validated graph`}
            accent
          />
          <Figure
            icon={<IconVerified size={17} />}
            label="Tasks verified"
            value={`${passed} of ${run.tasks.length}`}
            sub={`${suites.length} test commands the plan named, all real runs`}
            tone={passed === run.tasks.length ? 'var(--color-state-pass)' : undefined}
          />
          <Figure
            icon={<IconVerified size={17} />}
            label="Whole suite"
            value={wholeSuite ? (wholeGreen ? 'Green' : 'Red') : 'Not run'}
            sub="npm test after the last task passed"
            tone={wholeGreen ? 'var(--color-state-pass)' : undefined}
          />
          <Figure
            icon={<IconVerified size={17} />}
            label="Cost"
            value={`$${run.usage.paidSpendUsd.toFixed(2)}`}
            sub={credits ? `${credits.used} RocketRide credits, read from billing` : 'paid inference'}
            tone={run.usage.paidSpendUsd === 0 ? 'var(--color-state-pass)' : undefined}
          />
        </div>

        <div className="surface-highlight mt-6 flex flex-wrap items-center justify-between gap-5 p-6">
          <p className="max-w-[46rem] text-[14.5px] leading-relaxed text-[var(--color-mist)]">
            Mission <span className="mono text-[var(--color-frosted-lilac)]">{run.mission.id}</span>{' '}
            keeps the proposal exactly as the model wrote it, in the Plan panel, next to what each
            task was held to. The code the workers produced is committed under{' '}
            <span className="mono">demo/output/greeter</span> and reproduces the hash in every proof.
            On your machine it is one command:{' '}
            <span className="mono">npm run mission -- --repo=/your/repo --goal=&quot;...&quot;</span>
          </p>
          <div className="flex shrink-0 flex-col items-start gap-3">
            <Link href={`/app/missions/${run.mission.id}`} className="btn-primary inline-flex items-center gap-2">
              Open the planned mission
              <IconArrowRight size={15} />
            </Link>
            <Link
              href="/benchmarks"
              className="mono inline-flex min-h-[44px] items-center gap-2 text-[12.5px] text-[var(--color-frosted-lilac)]"
            >
              Or read how it was measured
              <IconArrowRight size={13} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

function Figure({
  icon,
  label,
  value,
  sub,
  tone,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone?: string;
  accent?: boolean;
}) {
  return (
    <div className="surface-card relative min-w-0 overflow-hidden p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{
          background: accent ? 'var(--color-frosted-lilac)' : 'var(--color-sapphire-hairline)',
          opacity: accent ? 0.9 : 0.5,
        }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">{label}</div>
        <span className="shrink-0 text-[var(--color-ash)] opacity-70">{icon}</span>
      </div>
      <div
        className="mt-2 break-words text-[22px] leading-tight tracking-[-0.02em]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: tone ?? 'var(--color-quartz)' }}
      >
        {value}
      </div>
      <div className="mt-2 text-[12.5px] leading-snug text-[var(--color-ash)]">{sub}</div>
    </div>
  );
}
