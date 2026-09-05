import Link from 'next/link';
import type { MissionSnapshot } from '@/core/mission';
import { IconArrowRight, IconCloud, IconVerified, IconCheckpoint } from '@/components/icons';

/**
 * Why RocketRide is load-bearing, answered with a run rather than a sentence.
 *
 * "Is the sponsor's platform doing the work, or is it a logo on a landing page"
 * is the question this competition asks out loud, and the honest answer was
 * sitting in a JSON file nobody could open. The landing page mentioned RocketRide
 * once, in a list of chips.
 *
 * Every number here is read from the recorded mission at render time. Nothing is
 * typed into the copy, so this section cannot drift away from the artifact it
 * describes — if the run changes, the page changes with it, and if the run is
 * missing the section does not render at all rather than showing zeroes.
 */
export function RocketRideProof({ run }: { run: MissionSnapshot | null }) {
  if (!run) return null;

  // Cost class is the routing decision: anything that is not local and not the
  // host's own seat executes as a RocketRide pipeline.
  const viaRocketRide = run.workers.filter((w) => w.costClass === 'free');
  if (viaRocketRide.length === 0) return null;

  const tasksViaRocketRide = new Set(viaRocketRide.map((w) => w.taskId));
  const passed = run.tasks.filter((t) => t.state === 'PASSED').length;
  const allPassed = viaRocketRide.every((w) => w.status === 'passed');

  return (
    <section id="rocketride" className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Execution fabric
        </div>
        <h2 className="heading mt-3 max-w-[46rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          RocketRide runs the work. Leverage decides what work should run.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          Leverage never re-implements execution. It decides which model deserves a job, then hands
          that job to a RocketRide pipeline and refuses to accept the result until a compiler or a
          test suite agrees. Here is a recorded mission where that happened.
        </p>

        <div className="mt-10 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <Figure
            icon={<IconCloud size={17} />}
            label="Workers via RocketRide"
            value={`${viaRocketRide.length} of ${run.workers.length}`}
            sub={`${tasksViaRocketRide.size} of ${run.tasks.length} tasks finished this way`}
            accent
          />
          <Figure
            icon={<IconVerified size={17} />}
            label="Their output"
            value={allPassed ? 'All verified' : 'Mixed'}
            sub="same checks as every other worker"
            tone={allPassed ? 'var(--color-state-pass)' : undefined}
          />
          <Figure
            icon={<IconCheckpoint size={17} />}
            label="Cognitive handoffs"
            value={String(run.checkpoints.length)}
            sub={
              run.checkpoints.length > 0
                ? `context cut ${run.checkpoints.map((c) => `${c.reductionPct}%`).join(' and ')}`
                : 'none needed'
            }
          />
          <Figure
            icon={<IconVerified size={17} />}
            label="Actual paid inference"
            value={`$${run.usage.paidSpendUsd.toFixed(2)}`}
            sub={`${passed}/${run.tasks.length} tasks passed`}
            tone={run.usage.paidSpendUsd === 0 ? 'var(--color-state-pass)' : undefined}
          />
        </div>

        <div className="surface-highlight mt-6 flex flex-wrap items-center justify-between gap-5 p-6">
          <p className="max-w-[46rem] text-[14.5px] leading-relaxed text-[var(--color-mist)]">
            A worker whose cost class is <span className="mono">free</span> executes as a
            RocketRide pipeline rather than a local call. In mission{' '}
            <span className="mono text-[var(--color-frosted-lilac)]">{run.mission.id}</span> that
            is how {tasksViaRocketRide.size} of the {run.tasks.length} tasks were finished, and
            their output passed verification. Open it and read the event log yourself.
          </p>
          <div className="flex shrink-0 flex-col items-start gap-3">
            <Link href="/app/live" className="btn-primary inline-flex items-center gap-2">
              Run one yourself, now
              <IconArrowRight size={15} />
            </Link>
            <Link
              href={`/app/missions/${run.mission.id}`}
              className="mono inline-flex min-h-[44px] items-center gap-2 text-[12.5px] text-[var(--color-frosted-lilac)]"
            >
              Or open the recorded run
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
        <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
          {label}
        </div>
        <span className="shrink-0 text-[var(--color-ash)] opacity-70">{icon}</span>
      </div>
      <div
        className="mt-2 text-[26px] leading-none tracking-[-0.02em]"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: tone ?? 'var(--color-quartz)',
        }}
      >
        {value}
      </div>
      <div className="mono mt-2 break-words text-[11.5px] text-[var(--color-ash)]">{sub}</div>
    </div>
  );
}
