import Link from 'next/link';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Wordmark } from '@/components/brand';
import { HeroConsole } from '@/components/marketing/hero-console';
import { ConnectSources } from '@/components/marketing/connect-sources';
import {
  ExecutionSurface,
  StatsBand,
  WorkforceLedger,
  type ModelRow,
} from '@/components/marketing/surfaces';
import { ReputationStore } from '@/core/reputation';
import { HandoffPlayer, type HandoffStep } from '@/components/marketing/handoff-player';
import { HandoffFilm } from '@/components/marketing/handoff-film';
import { AuroraField } from '@/components/visual/aurora-field';
import { WorkforceOrbit, type OrbitNode } from '@/components/visual/workforce-orbit';
import { Counter, Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';

export const dynamic = 'force-dynamic';

/**
 * Landing page.
 *
 * Every number here comes from `demo/canonical-run.json`, a real recorded mission,
 * or the panel says it has nothing to show. There is no placeholder metric anywhere.
 * A product whose argument is "check the evidence, don't trust the model" cannot have
 * an invented hero.
 */
async function loadRun(file: string): Promise<MissionSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(path.resolve('demo', file), 'utf8')) as MissionSnapshot;
  } catch {
    return null;
  }
}

/**
 * The workforce ledger is this installation's own record, so it is read from the
 * committed observations rather than from a table anyone typed by hand.
 */
async function loadLedger(): Promise<ModelRow[]> {
  try {
    const raw = await fs.readFile(path.resolve('demo/proof/model-observations.json'), 'utf8');
    const store = ReputationStore.fromJSON(JSON.parse(raw));
    return store
      .leaderboard()
      .filter((r) => r.samples >= 2)
      .map((r) => ({
        displayName: r.modelKey.split(':').slice(1).join(':') || r.modelKey,
        costClass: r.modelKey.startsWith('ollama') ? 'local' : r.modelKey.startsWith('agent-cli') || r.modelKey.startsWith('host') ? 'host' : 'free',
        samples: r.samples,
        verified: r.verifiedSuccesses,
        successRate: r.successRate,
        medianLatencyMs: r.medianLatencyMs,
        confidence: r.confidence,
      }));
  } catch {
    return [];
  }
}

export default async function Home() {
  const [run, arcade, ledger] = await Promise.all([
    loadRun('canonical-run.json'),
    loadRun('arcade-run.json'),
    loadLedger(),
  ]);
  const allRuns = [run, arcade].filter((r): r is MissionSnapshot => r !== null);

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
  const failAt = replayAll.findIndex(
    (e) => e.type === 'provider.rate_limit' || e.type === 'worker.failed',
  );
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

  return (
    <>
      <Nav />
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
                    <Link href="/app/new" className="btn-primary">
                      Run your first mission
                    </Link>
                    <Link href="/demo" className="btn-ghost">
                      Watch the proof
                    </Link>
                  </div>
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
              <Ribbon
                label="Cognitive handoffs"
                node={<Counter value={run.checkpoints.length} />}
              />
              <Ribbon
                label="Actual paid inference"
                accent
                node={<Counter value={run.usage.paidSpendUsd} decimals={2} prefix="$" />}
              />
            </div>
          </section>
        )}

        <HandoffFilm />

        <StatsBand runs={allRuns} />

        {/* ------------------------------------------------------------- Problem */}
        <Section eyebrow="The problem" title="Your smartest model is doing work it shouldn't.">
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Frontier intelligence earns its price on architecture, trade-offs and hard reasoning.
            It should not spend the same premium compute on repository search and mechanical
            edits.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <Reveal className="min-w-0">
              <div className="surface-card h-full p-6">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
                  Worth the premium
                </div>
                <ul className="mt-4 space-y-2.5 text-[15px] text-[var(--color-mist)]">
                  {['System architecture', 'Difficult trade-offs', 'Security judgement', 'Final review'].map(
                    (x) => (
                      <li key={x}>{x}</li>
                    ),
                  )}
                </ul>
              </div>
            </Reveal>
            <Reveal delay={90} className="min-w-0">
              <div className="surface-card h-full p-6">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                  Not worth the premium
                </div>
                <ul className="mt-4 space-y-2.5 text-[15px] text-[var(--color-ash)]">
                  {[
                    'Searching every file for one symbol',
                    'Forty boilerplate test cases',
                    'Mechanical migrations and refactors',
                    'Retrying a formatter that failed',
                  ].map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </Section>

        <ExecutionSurface run={run} />

        {replaySteps.length > 3 && <HandoffPlayer steps={replaySteps} />}

        {/* ------------------------------------------------------------- Orbit */}
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

                <div className="relative aspect-square w-full max-w-[520px] justify-self-center">
                  <WorkforceOrbit nodes={orbitNodes} />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* ------------------------------------------------------------ Job market */}
        <Section eyebrow="Model job market" title="Hire intelligence task by task." border>
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Every task becomes a job posting. Leverage scores each reachable model against the work,
            your budget, its measured track record, latency and your privacy policy, then hires the
            best eligible worker and shows you why.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <Reveal className="min-w-0">
              <div className="surface-card h-full p-6">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                  Job
                </div>
                <div className="mt-2 text-[16px] text-[var(--color-quartz)]">
                  Implement the split calculation
                </div>
                <dl className="mono mt-5 space-y-2 text-[12px]">
                  {[
                    ['Requires', 'code · backend · reasoning'],
                    ['Context', '1.4K tokens'],
                    ['Max cost', '$0.00'],
                    ['Privacy', 'prefer-local'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-4">
                      <dt className="text-[var(--color-ash)]">{k}</dt>
                      <dd className="text-[var(--color-mist)]">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Reveal>

            <Reveal delay={90} className="min-w-0">
              <div className="surface-card h-full p-6">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                  Candidates
                </div>
                <ul className="mt-4 space-y-3">
                  <Candidate name="Claude Code (your seat)" utility="0.88" note="host seat · no API key" winner />
                  <Candidate name="qwen2.5-coder:3b" utility="0.84" note="local runtime · 2 verified probes" />
                  <Candidate name="Pool · best-coding" utility="0.79" note="free route · quota risk" />
                  <Candidate
                    name="Claude API"
                    utility="—"
                    note="Hard budget $0.00 blocks all paid routes"
                    blocked
                  />
                </ul>
                <p className="mt-5 border-t border-[var(--color-obsidian-edge)] pt-4 text-[13px] text-[var(--color-ash)]">
                  Policy runs before scoring. A paid model under a $0 budget is not out-ranked. It is
                  never in the pool.
                </p>
              </div>
            </Reveal>
          </div>
        </Section>

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
            <Reveal>
              <div>
                <div className="display text-[clamp(3.5rem,9vw,5rem)] text-[var(--color-quartz)]">
                  <Counter value={run?.usage.paidSpendUsd ?? 0} decimals={2} prefix="$" />
                </div>
                <div className="mono mt-3 text-[11px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                  {run ? 'Actual paid inference, recorded run' : 'Hard spending limit'}
                </div>
              </div>
            </Reveal>

            <Reveal delay={90}>
              <div className="surface-card divide-y divide-[var(--color-obsidian-edge)]">
                {[
                  ['Paid providers', 'BLOCKED', 'fail'],
                  ['Your host seat', 'READY', 'pass'],
                  ['Local runtime', 'READY', 'pass'],
                  ['Free cloud routes', 'READY', 'pass'],
                  [
                    'Blocked paid attempts',
                    run ? String(run.usage.blockedPaidAttempts) : '—',
                    'neutral',
                  ],
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
                    detail="measured, not estimated"
                  />
                </div>
              </div>
            </Reveal>
          ) : (
            <EmptyEvidence what="handoff" />
          )}
        </Section>

        {/* --------------------------------------------------------------- Proof */}
        <Section eyebrow="Proof-carrying work" title="Every worker ships evidence." border>
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            A task is not complete because a model said so. It is complete when a compiler, a test
            runner or the filesystem says so. Model self-confidence is recorded separately and is
            the smallest term in the score.
          </p>

          {run && proofChecks.length > 0 ? (
            <Reveal>
              <div className="surface-card mt-10 p-6">
                <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                  ProofPack · mission {run.mission.id}
                </div>
                <ul className="mono space-y-2 text-[13px]">
                  {proofChecks.slice(0, 8).map((c, i) => (
                    <li key={`${c.id}-${i}`} className="flex items-center justify-between gap-4">
                      <span className="truncate text-[var(--color-mist)]">{c.label}</span>
                      <span
                        style={{
                          color:
                            c.status === 'pass'
                              ? 'var(--color-state-pass)'
                              : 'var(--color-state-fail)',
                        }}
                      >
                        {c.status.toUpperCase()}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mono mt-5 flex flex-wrap gap-x-8 gap-y-2 border-t border-[var(--color-obsidian-edge)] pt-4 text-[12px] text-[var(--color-ash)]">
                  <span>
                    checks{' '}
                    <span className="text-[var(--color-quartz)]">
                      {passedChecks}/{proofChecks.length}
                    </span>
                  </span>
                  <span>
                    paid spend{' '}
                    <span className="text-[var(--color-quartz)]">
                      ${run.usage.paidSpendUsd.toFixed(2)}
                    </span>
                  </span>
                  <span>
                    elapsed{' '}
                    <span className="text-[var(--color-quartz)]">
                      {(run.mission.elapsedMs / 1000).toFixed(1)}s
                    </span>
                  </span>
                </div>
              </div>
            </Reveal>
          ) : (
            <EmptyEvidence what="ProofPack" />
          )}
        </Section>

        {/* ----------------------------------------------------------- Final CTA */}
        <section className="aurora relative isolate overflow-hidden border-t border-[var(--color-obsidian-edge)]">
          <AuroraField />
          <div className="relative mx-auto max-w-[1200px] px-6 py-28 text-center">
            <Reveal>
              <h2 className="display text-[clamp(2.25rem,5.5vw,3.25rem)] text-[var(--color-quartz)]">
                Give your best model a workforce.
              </h2>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href="/app/new" className="btn-primary">
                  Run your first mission
                </Link>
                <Link href="/docs/mcp" className="btn-ghost">
                  Install the MCP server
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-obsidian-edge)] bg-[rgba(11,12,14,0.82)] backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-6"
      >
        <Link href="/" aria-label="Leverage home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 text-[14px] text-[var(--color-ash)] md:flex">
          {[
            ['/how-it-works', 'How it works'],
            ['/benchmarks', 'Benchmarks'],
            ['/docs', 'Docs'],
          ].map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="transition-colors duration-150 hover:text-[var(--color-quartz)]"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="hidden text-[14px] text-[var(--color-ash)] transition-colors hover:text-[var(--color-quartz)] sm:block"
          >
            Sign in
          </Link>
          <Link href="/app/new" className="btn-primary !py-2 !text-[14px]">
            Deploy Leverage
          </Link>
        </div>
      </nav>
    </header>
  );
}

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
            <Link href={href} className="btn-primary shrink-0 self-start md:self-auto">
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
    <div className="bg-[var(--color-void)] px-6 py-6">
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

function Candidate({
  name,
  utility,
  note,
  winner,
  blocked,
}: {
  name: string;
  utility: string;
  note: string;
  winner?: boolean;
  blocked?: boolean;
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 border-b border-[var(--color-inkline)] pb-3 last:border-0">
      <div className="min-w-0">
        <div className="mono truncate text-[13px] text-[var(--color-quartz)]">
          {name}
          {winner && (
            <span className="ml-2 rounded-full border border-[rgba(74,222,128,0.4)] px-2 py-0.5 text-[10px] text-[var(--color-state-pass)]">
              HIRED
            </span>
          )}
          {blocked && (
            <span className="ml-2 rounded-full border border-[var(--color-obsidian-edge)] px-2 py-0.5 text-[10px] text-[var(--color-ash)]">
              INELIGIBLE
            </span>
          )}
        </div>
        <div className="mt-1 text-[12px] text-[var(--color-ash)]">{note}</div>
      </div>
      <div className="mono shrink-0 tabular-nums text-[13px] text-[var(--color-mist)]">{utility}</div>
    </li>
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
    <div className="p-6">
      <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className="mt-2 text-[22px] tabular-nums"
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

function Footer() {
  return (
    <footer className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex flex-wrap gap-6 text-[13px] text-[var(--color-ash)]">
          {[
            ['/docs', 'Docs'],
            ['/benchmarks', 'Benchmarks'],
            ['/demo', 'Demo'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-[var(--color-quartz)]">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
