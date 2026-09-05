import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { HeroConsole } from '@/components/marketing/hero-console';
import { ConnectSources } from '@/components/marketing/connect-sources';
import { ExecutionSurface, WorkforceLedger } from '@/components/marketing/surfaces';
import type { HandoffStep } from '@/components/marketing/handoff-player';
import { RocketRideProof } from '@/components/marketing/rocketride-proof';
import { PlannedProof } from '@/components/marketing/planned-proof';
import { ProductModes, pickMarket } from '@/components/marketing/product-modes';
import { Evidence } from '@/components/marketing/evidence';
import { WorkforceMarquee, plannerOf } from '@/components/marketing/workforce-marquee';
import { Faq } from '@/components/marketing/faq';
import { Install } from '@/components/marketing/install';
import { LandingFooter, LandingNav } from '@/components/marketing/landing-chrome';
import {
  countTests,
  loadLedger,
  loadLiveRuns,
  loadPoolSweep,
  loadProbe,
  loadRocketRideRun,
  loadRun,
  loadScale,
} from '@/components/marketing/evidence-data';
import { AuroraField, WorkforceOrbit } from '@/components/visual/lazy';
import type { OrbitNode } from '@/components/visual/workforce-orbit';
import { Counter, Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';

export const dynamic = 'force-dynamic';

// The three interactive sections below the fold are server-rendered as usual
// but code-split, so their hydration lands in separate short tasks after the
// first paint instead of inside the one long task that hydrates the page.
const HandoffPlayer = nextDynamic(() => import('@/components/marketing/handoff-player').then((m) => m.HandoffPlayer));
const HandoffFilm = nextDynamic(() => import('@/components/marketing/handoff-film').then((m) => m.HandoffFilm));
const MasterFilm = nextDynamic(() => import('@/components/marketing/master-film').then((m) => m.MasterFilm));

/**
 * Landing page.
 *
 * Every number here comes from a recorded mission or another file in the
 * repository, read when the page renders, or the panel says it has nothing to
 * show. There is no placeholder metric anywhere. A product whose argument is
 * "check the evidence, don't trust the model" cannot have an invented hero.
 *
 * The shape follows what a product landing page is expected to have (product,
 * live preview, capabilities, community proof, pricing, FAQ, install, footer)
 * with every slot filled by something this repository can actually show.
 */
export default async function Home() {
  const [run, arcade, rocketRide, hosted, planned, ledger, tests, scale, probe, rocketRideRun, pool, liveRuns] =
    await Promise.all([
      loadRun('canonical-run.json'),
      loadRun('arcade-run.json'),
      // The run RocketRide executed gets its own section because it answers a
      // question the competition asks out loud; it still counts in the totals,
      // so the band and Mission Control agree on how many missions there are.
      loadRun('rocketride-mission.json'),
      loadRun('hosted-pool-mission.json'),
      // The mission whose plan a model wrote, so the totals count it too.
      loadRun('planned-run.json'),
      loadLedger(),
      countTests(),
      loadScale(),
      loadProbe(),
      loadRocketRideRun(),
      loadPoolSweep(),
      loadLiveRuns(),
    ]);
  const allRuns = [run, arcade, rocketRide, hosted, planned].filter((r): r is MissionSnapshot => r !== null);
  const market = pickMarket(allRuns);

  const handoff = run?.checkpoints[0];
  const proofChecks = run?.proofs.flatMap((p) => p.checks) ?? [];
  const passedChecks = proofChecks.filter((c) => c.status === 'pass').length;
  const passedTasks = run?.tasks.filter((t) => t.state === 'PASSED').length ?? 0;

  /**
   * The replay window: the real events around the first failure, which is the only
   * part worth watching. A green stretch proves nothing.
   */
  const REPLAY_TYPES = new Set([
    'worker.hired',
    'worker.started',
    'provider.rate_limit',
    'worker.failed',
    'checkpoint.created',
    'worker.released',
    'handoff.started',
    'verification.passed',
    'task.completed',
  ]);
  const replayAll = (run?.events ?? []).filter((e) => REPLAY_TYPES.has(e.type));
  const failAt = replayAll.findIndex((e) => e.type === 'provider.rate_limit' || e.type === 'worker.failed');
  const replaySteps: HandoffStep[] = replayAll
    .slice(Math.max(0, failAt - 2), Math.max(0, failAt - 2) + 10)
    .map((e) => ({
      seq: e.seq,
      type: e.type,
      message: e.message,
      elapsedMs: e.elapsedMs,
      worker: run?.workers.find((w) => w.id === e.workerRunId)?.displayName,
    }));

  // The orbit is the workforce that actually ran, replacements included.
  const orbitNodes: OrbitNode[] =
    run?.workers.map((w) => ({
      label: w.displayName,
      state:
        w.status === 'passed'
          ? 'passed'
          : w.status === 'replaced' || w.status === 'failed'
            ? 'replaced'
            : w.status === 'running' || w.status === 'verifying'
              ? 'running'
              : 'idle',
    })) ?? [];

  // Footer evidence links, from the runs that loaded, so a link can never point
  // at a mission the page does not know about.
  const footerMissions = (
    [
      [run, 'Recorded run'],
      [rocketRide, 'RocketRide run'],
      [hosted, 'Hosted pool run'],
      [planned, 'Model-planned run'],
      [arcade, 'Arcade run'],
    ] as [MissionSnapshot | null, string][]
  )
    .filter((x): x is [MissionSnapshot, string] => x[0] !== null)
    .map(([r, label]) => ({ label: `${label} · ${r.mission.id}`, id: r.mission.id }));

  return (
    <>
      <LandingNav />
      <main id="main">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="aurora relative isolate overflow-hidden border-b border-[var(--color-obsidian-edge)]">
          <AuroraField />

          <div className="relative mx-auto max-w-[1200px] px-6 pb-20 pt-20 lg:pb-24 lg:pt-24">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-16">
              <div className="min-w-0">
                <Reveal y={12}>
                  <div className="mono mb-7 inline-flex items-center gap-2 rounded-full border border-[var(--color-sapphire-hairline)] bg-[rgba(13,23,43,0.6)] px-3.5 py-1.5 text-[11px] text-[var(--color-frosted-lilac)] backdrop-blur">
                    <span className="relative flex h-2 w-2">
                      <span className="dot-live-halo absolute inline-flex h-full w-full animate-ping rounded-full" />
                      <span className="dot-live relative inline-flex h-2 w-2 rounded-full" />
                    </span>
                    An MCP server for Claude Code, Codex and Cursor. No API key.
                  </div>
                </Reveal>

                <Reveal delay={60}>
                  <h1 className="display text-[clamp(2.75rem,7vw,4.25rem)] text-[var(--color-quartz)]">
                    One frontier brain.
                    <br />
                    <em className="not-italic">
                      An <span className="italic text-[var(--color-frosted-lilac)]">elastic</span>{' '}
                      workforce.
                    </em>
                  </h1>
                </Reveal>

                <Reveal delay={130}>
                  <p className="mt-6 max-w-[34rem] text-[18px] font-light leading-[1.55] text-[var(--color-ash)]">
                    Keep your best model as the strategist. Leverage recruits local, free and
                    connected models underneath it, runs independent work in parallel, replaces
                    workers that fail and verifies every result.
                  </p>
                </Reveal>

                <Reveal delay={200}>
                  <div className="mt-9 flex flex-wrap items-center gap-3">
                    <Link href="/app/live" className="btn-primary inline-flex min-h-[44px] items-center">
                      Run a real mission now
                    </Link>
                    <Link href="#film" className="btn-ghost inline-flex min-h-[44px] items-center">
                      See it in action
                    </Link>
                  </div>
                  <p className="mt-4 max-w-[34rem] text-[12.5px] leading-relaxed text-[var(--color-ash)] opacity-90">
                    No account, no key. The live page runs one bounded mission per visitor every ten
                    minutes; every other run on this site is a recording, and each page says which
                    it is.
                  </p>
                </Reveal>

                <Reveal delay={260}>
                  <div className="mono mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[var(--color-ash)]">
                    <span>MCP-native</span>
                    <Dot />
                    <span>Local-first</span>
                    <Dot />
                    <span>Zero-dollar mode</span>
                    <Dot />
                    <span>RocketRide execution</span>
                  </div>
                </Reveal>
              </div>

              <Reveal delay={180} y={26} className="min-w-0">
                <HeroConsole run={run} />
              </Reveal>
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------- Metric ribbon */}
        {run && (
          <section className="border-b border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
            <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-px bg-[var(--color-obsidian-edge)] md:grid-cols-4">
              <Ribbon label="Tasks verified" node={<><Counter value={passedTasks} />/{run.tasks.length}</>} />
              <Ribbon label="Proof checks" node={<><Counter value={passedChecks} />/{proofChecks.length}</>} />
              <Ribbon label="Cognitive handoffs" node={<Counter value={run.checkpoints.length} />} />
              <Ribbon
                label="Actual paid inference"
                accent
                node={<Counter value={run.usage.paidSpendUsd} decimals={2} prefix="$" />}
              />
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------ Product */}
        <ProductModes run={run} market={market} />

        {/* ---------------------------------------------------------- See it run */}
        <MasterFilm />
        <HandoffFilm />

        {/* ------------------------------------------------------------- Handoff */}
        <Section eyebrow="Cognitive handoff" title="Replace the worker, not the project." border>
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            When a model hits a quota, times out or cannot solve the job, Leverage captures a compact
            checkpoint of what it understood: decisions, files touched, checks already passing,
            what is left. It hands that to a replacement. The work continues instead of restarting.
          </p>

          {handoff ? (
            <Reveal>
              <div className="surface-card mt-10 overflow-hidden">
                <div className="grid divide-y divide-[var(--color-obsidian-edge)] md:grid-cols-3 md:divide-x md:divide-y-0">
                  <HandoffCell
                    label="Worker released"
                    value={handoff.fromModelKey.split(':').slice(1).join(':')}
                    detail={`stopped with ${handoff.reason}`}
                  />
                  <HandoffCell
                    label="Checkpoint"
                    value={`${handoff.checkpointTokens} tokens`}
                    detail={`from ${handoff.originalContextTokens} of context`}
                    accent
                  />
                  <HandoffCell
                    label="Context reduction"
                    value={`${handoff.reductionPct}%`}
                    detail="counted from the text, 3.6 characters per token"
                  />
                </div>
              </div>
            </Reveal>
          ) : (
            <EmptyEvidence what="handoff" />
          )}
        </Section>

        {replaySteps.length > 3 && <HandoffPlayer steps={replaySteps} />}

        <ExecutionSurface run={run} />

        {/* --------------------------------------------------------------- Proof */}
        <Evidence
          runs={allRuns}
          tests={tests}
          scale={scale}
          probe={probe}
          rocketRide={rocketRideRun}
          pool={pool}
          live={liveRuns}
          planned={planned}
        />

        <RocketRideProof run={rocketRide} />

        <PlannedProof run={planned} />

        {/* ----------------------------------------------------------- Workforce */}
        <WorkforceMarquee runs={allRuns} planner={plannerOf(planned)} />

        {orbitNodes.length > 0 && (
          <section className="relative border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
            <div className="mx-auto max-w-[1200px] px-6 py-20">
              <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <Reveal className="min-w-0">
                  <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                    One mission
                  </div>
                  <h2 className="heading mt-3 text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
                    One strategist. {run?.workers.length ?? 0} workers. Nothing paid for.
                  </h2>
                  <p className="mt-5 max-w-[34rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
                    This is the workforce from mission{' '}
                    <span className="mono text-[var(--color-frosted-lilac)]">{run?.mission.id}</span>,
                    the recorded run in this repository. Green passed verification, amber was
                    replaced mid-task and handed its understanding to a successor.
                  </p>
                  <dl className="mono mt-8 grid grid-cols-2 gap-5 text-[12px]">
                    <div>
                      <dt className="text-[var(--color-ash)]">Local runtime calls</dt>
                      <dd className="mt-1 text-[20px] text-[var(--color-quartz)]">
                        <Counter value={run?.usage.localCalls ?? 0} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[var(--color-ash)]">Free cloud calls</dt>
                      <dd className="mt-1 text-[20px] text-[var(--color-quartz)]">
                        <Counter value={run?.usage.freeCalls ?? 0} />
                      </dd>
                    </div>
                  </dl>
                </Reveal>

                <div className="relative hidden aspect-square w-full max-w-[520px] justify-self-center md:block">
                  <WorkforceOrbit nodes={orbitNodes} />
                </div>
              </div>
            </div>
          </section>
        )}

        <WorkforceLedger models={ledger} />

        {/* --------------------------------------------------------- Connect */}
        <ConnectSources />

        <MidCta
          heading="See it build something you can play."
          body="A gravity-arena prototype whose entire logic was written by free and subscription-backed models under a hard $0 budget, shipped beside the ProofPack that produced it."
          href="/demo"
          label="Open the demo"
        />

        {/* --------------------------------------------------------- Zero dollar */}
        <Section eyebrow="Zero-dollar mode" title="When the budget says zero, zero means zero." border>
          <div className="mt-2 grid items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <Reveal className="min-w-0">
              <div>
                <div className="display text-[clamp(3.5rem,9vw,5rem)] text-[var(--color-quartz)]">
                  <Counter value={run?.usage.paidSpendUsd ?? 0} decimals={2} prefix="$" />
                </div>
                <div className="mono mt-3 text-[11px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                  {run ? 'Actual paid inference, recorded run' : 'Hard spending limit'}
                </div>
                <ul className="mt-6 space-y-2 text-[14px] text-[var(--color-mist)]">
                  {[
                    'MIT licence. No account, no API key, nothing to download.',
                    'Five MCP tools. Your host stays the strategist.',
                    'Paid providers struck before scoring, asserted in the tests.',
                    'RocketRide credits read from billing, per run, never estimated.',
                  ].map((x) => (
                    <li key={x} className="flex gap-3">
                      <span aria-hidden className="mono text-[var(--color-state-pass)]">
                        ✓
                      </span>
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>

            <Reveal delay={90} className="min-w-0">
              <div className="surface-card divide-y divide-[var(--color-obsidian-edge)]">
                {[
                  ['Paid providers', 'BLOCKED', 'fail'],
                  ['Your host seat', 'READY', 'pass'],
                  ['Local runtime', 'READY', 'pass'],
                  ['Free cloud routes', 'READY', 'pass'],
                  ['Blocked paid attempts', run ? String(run.usage.blockedPaidAttempts) : '–', 'neutral'],
                ].map(([label, value, tone]) => (
                  <div key={label} className="flex items-center justify-between px-6 py-3.5">
                    <span className="text-[15px] text-[var(--color-mist)]">{label}</span>
                    <span
                      className="mono text-[12px]"
                      style={{
                        color:
                          tone === 'pass'
                            ? 'var(--color-state-pass)'
                            : tone === 'fail'
                              ? 'var(--color-state-fail)'
                              : 'var(--color-ash)',
                      }}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </Section>

        {/* ----------------------------------------------------------------- FAQ */}
        <Faq rocketRide={rocketRide} hosted={hosted} planned={planned} />

        {/* ------------------------------------------------------------- Install */}
        <Install />

        {/* ----------------------------------------------------------- Final CTA */}
        <section className="aurora relative isolate overflow-hidden border-t border-[var(--color-obsidian-edge)]">
          <AuroraField />
          <div className="relative mx-auto max-w-[1200px] px-6 py-28 text-center">
            <Reveal>
              <h2 className="display text-[clamp(2.25rem,5.5vw,3.25rem)] text-[var(--color-quartz)]">
                Give your best model a workforce.
              </h2>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/app/live" className="btn-primary inline-flex min-h-[44px] items-center">
                  Run a real mission now
                </Link>
                <Link href="/docs/mcp" className="btn-ghost inline-flex min-h-[44px] items-center">
                  Install the MCP server
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <LandingFooter missions={footerMissions} />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function MidCta({
  heading,
  body,
  href,
  label,
}: {
  heading: string;
  body: string;
  href: string;
  label: string;
}) {
  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 py-16">
        <Reveal>
          <div className="surface-highlight flex flex-col gap-6 p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div className="max-w-[42rem]">
              <h2 className="heading text-[clamp(1.375rem,2.6vw,1.75rem)] text-[var(--color-quartz)]">
                {heading}
              </h2>
              <p className="mt-3 text-[15px] font-light leading-relaxed text-[var(--color-mist)]">
                {body}
              </p>
            </div>
            <Link href={href} className="btn-primary inline-flex min-h-[44px] shrink-0 items-center self-start md:self-auto">
              {label}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Ribbon({ label, node, accent }: { label: string; node: React.ReactNode; accent?: boolean }) {
  return (
    <div className="min-w-0 bg-[var(--color-void)] px-6 py-6">
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className={`mt-1.5 text-[28px] ${accent ? 'grad-text-pass' : ''}`}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: accent ? undefined : 'var(--color-quartz)',
        }}
      >
        {node}
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  children,
  border,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  border?: boolean;
}) {
  return (
    <section
      className={`bg-[var(--color-abyss)] ${border ? 'border-t border-[var(--color-obsidian-edge)]' : ''}`}
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            {eyebrow}
          </div>
          <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            {title}
          </h2>
        </Reveal>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

function HandoffCell({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className="min-w-0 p-6">
      <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className="mt-2 break-words text-[22px] tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: accent ? 'var(--color-frosted-lilac)' : 'var(--color-quartz)',
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[13px] text-[var(--color-ash)]">{detail}</div>
    </div>
  );
}

function EmptyEvidence({ what }: { what: string }) {
  return (
    <div className="surface-card mt-10 p-6">
      <div className="text-[15px] text-[var(--color-mist)]">No recorded {what} yet.</div>
      <p className="mt-2 max-w-[36rem] text-[13px] text-[var(--color-ash)]">
        This panel renders a real mission from{' '}
        <code className="mono text-[var(--color-frosted-lilac)]">demo/canonical-run.json</code>. Run{' '}
        <code className="mono text-[var(--color-frosted-lilac)]">
          npm run mission -- --inject-429 --out=demo/canonical-run.json
        </code>{' '}
        to populate it. It will not show invented numbers in the meantime.
      </p>
    </div>
  );
}

function Dot() {
  return <span className="text-[var(--color-ash)] opacity-70">·</span>;
}
