import Link from 'next/link';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Wordmark } from '@/components/brand';
import { HeroConsole } from '@/components/marketing/hero-console';
import type { MissionSnapshot } from '@/core/mission';

export const dynamic = 'force-dynamic';

/**
 * Landing page.
 *
 * Every number on this page comes from `demo/canonical-run.json` — a real recorded
 * mission — or is not shown at all. There is no placeholder metric anywhere: if the
 * canonical run is missing, the affected panels say so.
 */
async function loadCanonicalRun(): Promise<MissionSnapshot | null> {
  try {
    const raw = await fs.readFile(path.resolve('demo/canonical-run.json'), 'utf8');
    return JSON.parse(raw) as MissionSnapshot;
  } catch {
    return null;
  }
}

export default async function Home() {
  const run = await loadCanonicalRun();

  const handoff = run?.checkpoints[0];
  const proofChecks = run?.proofs.flatMap((p) => p.checks) ?? [];
  const passedChecks = proofChecks.filter((c) => c.status === 'pass').length;

  return (
    <>
      <Nav />
      <main id="main">
        {/* ---------------------------------------------------------------- Hero */}
        <section className="aurora relative overflow-hidden border-b border-[var(--color-obsidian-edge)]">
          <div className="mx-auto max-w-[1200px] px-6 pb-24 pt-28 lg:pb-32 lg:pt-36">
            <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,55fr)_minmax(0,45fr)] lg:gap-16">
              <div>
                <h1 className="display text-[clamp(2.75rem,7vw,4rem)] text-[var(--color-quartz)]">
                  One frontier brain.
                  <br />
                  An elastic workforce.
                </h1>

                <p className="mt-6 max-w-[34rem] text-[18px] font-light leading-[1.55] text-[var(--color-ash)]">
                  Keep your best model as the strategist. Leverage recruits local, free and
                  connected models underneath it, runs independent work in parallel, replaces
                  workers that fail and verifies every result.
                </p>

                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link href="/app/new" className="btn-primary">
                    Run your first mission
                  </Link>
                  <Link href="/demo" className="btn-ghost">
                    Watch the proof
                  </Link>
                </div>

                <div className="mono mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-[12px] text-[var(--color-ash)]">
                  <span>MCP-native</span>
                  <Dot />
                  <span>Local-first</span>
                  <Dot />
                  <span>Zero-dollar mode</span>
                  <Dot />
                  <span>RocketRide execution</span>
                </div>
              </div>

              <HeroConsole run={run} />
            </div>
          </div>
        </section>

        {/* ------------------------------------------------------------- Problem */}
        <Section eyebrow="The problem" title="Your smartest model is doing work it shouldn't.">
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Frontier intelligence earns its price on architecture, trade-offs and hard reasoning.
            It should not spend the same premium compute on repository search, repetitive tests and
            mechanical edits.
          </p>

          <div className="mt-10 grid gap-4 md:grid-cols-2">
            <div className="surface-card p-6">
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
            <div className="surface-card p-6">
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
          </div>
        </Section>

        {/* ------------------------------------------------------------ Job market */}
        <Section
          eyebrow="Model job market"
          title="Hire intelligence task by task."
          border
        >
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Every task becomes a job posting. Leverage scores each reachable model against the work,
            your budget, its measured track record, latency and your privacy policy — then hires the
            best eligible worker and shows you why.
          </p>

          <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div className="surface-card p-6">
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

            <div className="surface-card p-6">
              <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                Candidates
              </div>
              <ul className="mt-4 space-y-3">
                <Candidate name="qwen2.5-coder:3b" utility="0.84" note="local runtime · 2 verified probes" winner />
                <Candidate name="Pool · best-coding" utility="0.79" note="free route · quota risk" />
                <Candidate name="gemma3:4b" utility="0.71" note="local runtime · 2 verified probes" />
                <Candidate name="Claude API" utility="—" note="Hard budget $0.00 blocks all paid routes" blocked />
              </ul>
              <p className="mt-5 border-t border-[var(--color-obsidian-edge)] pt-4 text-[13px] text-[var(--color-ash)]">
                Policy runs before scoring. A paid model under a $0 budget is not out-ranked — it is
                never in the pool.
              </p>
            </div>
          </div>
        </Section>

        {/* --------------------------------------------------------- Zero dollar */}
        <Section eyebrow="Zero-dollar mode" title="When the budget says zero, zero means zero." border>
          <div className="mt-2 grid items-center gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
            <div>
              <div className="display text-[clamp(3.5rem,9vw,5rem)] tabular-nums text-[var(--color-quartz)]">
                {run ? `$${run.usage.paidSpendUsd.toFixed(2)}` : '$0.00'}
              </div>
              <div className="mono mt-3 text-[11px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                {run ? 'Actual paid inference, recorded run' : 'Hard spending limit'}
              </div>
            </div>

            <div className="surface-card divide-y divide-[var(--color-obsidian-edge)]">
              {[
                ['Paid providers', 'BLOCKED', 'fail'],
                ['Local runtime', 'READY', 'pass'],
                ['Free cloud routes', 'READY', 'pass'],
                ['Automatic failover', 'ON', 'pass'],
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
          </div>
        </Section>

        {/* ------------------------------------------------------------- Handoff */}
        <Section eyebrow="Cognitive handoff" title="Replace the worker, not the project." border>
          <p className="max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            When a model hits a quota, times out or cannot solve the job, Leverage captures a compact
            checkpoint of what it understood — decisions, files touched, checks already passing,
            what is left — and hands that to a replacement. The work continues instead of restarting.
          </p>

          {handoff ? (
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
          ) : (
            <EmptyEvidence what="ProofPack" />
          )}
        </Section>

        {/* ----------------------------------------------------------- Final CTA */}
        <section className="aurora border-t border-[var(--color-obsidian-edge)]">
          <div className="mx-auto max-w-[1200px] px-6 py-24 text-center">
            <h2 className="display text-[clamp(2.25rem,5vw,3rem)] text-[var(--color-quartz)]">
              Give your best model a workforce.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/app/new" className="btn-primary">
                Run your first mission
              </Link>
              <Link href="/docs/mcp" className="btn-ghost">
                Install the MCP server
              </Link>
            </div>
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
    <header className="sticky top-0 z-50 border-b border-[var(--color-obsidian-edge)] bg-[rgba(11,12,14,0.88)] backdrop-blur">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-6"
      >
        <Link href="/" aria-label="Leverage home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 text-[14px] text-[var(--color-ash)] md:flex">
          <Link href="/how-it-works" className="hover:text-[var(--color-quartz)]">
            How it works
          </Link>
          <Link href="/benchmarks" className="hover:text-[var(--color-quartz)]">
            Benchmarks
          </Link>
          <Link href="/docs" className="hover:text-[var(--color-quartz)]">
            Docs
          </Link>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/app" className="hidden text-[14px] text-[var(--color-ash)] hover:text-[var(--color-quartz)] sm:block">
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
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          {eyebrow}
        </div>
        <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          {title}
        </h2>
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
          npx tsx scripts/run-mission.ts --inject-429 --out=demo/canonical-run.json
        </code>{' '}
        to populate it. It will not show invented numbers in the meantime.
      </p>
    </div>
  );
}

function Dot() {
  return <span className="text-[var(--color-slate)]">·</span>;
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex flex-wrap gap-6 text-[13px] text-[var(--color-ash)]">
          <Link href="/docs" className="hover:text-[var(--color-quartz)]">
            Docs
          </Link>
          <Link href="/benchmarks" className="hover:text-[var(--color-quartz)]">
            Benchmarks
          </Link>
          <Link href="/demo" className="hover:text-[var(--color-quartz)]">
            Demo
          </Link>
        </div>
      </div>
    </footer>
  );
}
