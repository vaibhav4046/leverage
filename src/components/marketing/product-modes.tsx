import Link from 'next/link';
import { Reveal } from '@/components/visual/motion';
import { IconArrowRight } from '@/components/icons';
import type { MissionSnapshot } from '@/core/mission';

type Task = MissionSnapshot['tasks'][number];
type Auction = MissionSnapshot['auctions'][number];
type Candidate = Auction['candidates'][number];
type Check = MissionSnapshot['proofs'][number]['checks'][number];

export interface MarketPick {
  missionId: string;
  task: Task;
  auction: Auction;
  privacy: string;
  budgetMaxUsd: number;
  rows: Candidate[];
}

/**
 * The first recorded auction where policy struck a candidate, so "removed, not
 * out-ranked" is a recorded fact rather than an illustration. Top three eligible
 * by utility, plus the first candidate policy refused.
 */
export function pickMarket(runs: MissionSnapshot[]): MarketPick | null {
  for (const r of runs) {
    for (const auction of r.auctions) {
      const struck = auction.candidates.find((c) => !c.eligible);
      const task = r.tasks.find((t) => t.id === auction.taskId);
      if (!struck || !task) continue;
      const eligible = auction.candidates
        .filter((c) => c.eligible)
        .sort((a, b) => b.utility - a.utility)
        .slice(0, 3);
      return {
        missionId: r.mission.id,
        task,
        auction,
        privacy: r.mission.privacy.mode,
        budgetMaxUsd: r.usage.budgetMaxUsd,
        rows: [...eligible, struck],
      };
    }
  }
  return null;
}

/**
 * Plan, hire, verify: the three stages every task goes through, each shown with
 * the artefact the recorded run produced at that stage rather than a diagram of
 * one. The task graph is the run's own, the auction is the recorded one, the
 * checks are the ProofPack's. A mode with no artefact says so instead of
 * illustrating one.
 */
export function ProductModes({ run, market }: { run: MissionSnapshot | null; market: MarketPick | null }) {
  const checks: Check[] = run?.proofs.flatMap((p) => p.checks) ?? [];
  const passed = checks.filter((c) => c.status === 'pass').length;

  return (
    <section
      id="product"
      className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            The product
          </div>
          <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            Plan. Hire. Verify.
          </h2>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Frontier intelligence earns its price on architecture, trade-offs and hard reasoning. It
            should not spend the same premium compute on repository search and mechanical edits.
            Your host states an outcome and a policy. Leverage does the rest in three stages, and
            each one below is shown with what the recorded run actually produced.
          </p>
        </Reveal>

        <div className="mt-8 grid gap-3 md:grid-cols-2">
          <Reveal className="min-w-0">
            <Split
              label="Worth the premium"
              tone="var(--color-frosted-lilac)"
              items={['System architecture', 'Difficult trade-offs', 'Security judgement', 'Final review']}
            />
          </Reveal>
          <Reveal delay={70} className="min-w-0">
            <Split
              label="Not worth the premium"
              tone="var(--color-ash)"
              items={[
                'Searching every file for one symbol',
                'Forty boilerplate test cases',
                'Mechanical migrations and refactors',
                'Retrying a formatter that failed',
              ]}
            />
          </Reveal>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          <Mode
            n="01"
            name="Plan"
            title="A validated task graph."
            body="A planner is untrusted. Its graph is a proposal until it survives validation: cycles, dangling edges, escaping paths and tasks with no check are rejected before anyone is hired."
            foot={
              run
                ? `${run.tasks.length} tasks from mission ${run.mission.id}. Tasks with no dependency run in parallel; nothing runs before every dependency has passed.`
                : 'Renders the task graph of the recorded run once demo/canonical-run.json exists.'
            }
            href={run ? `/app/missions/${run.mission.id}` : undefined}
            cta="Open the plan"
          >
            {run ? <TaskGraph tasks={run.tasks} /> : <Empty what="task graph" />}
          </Mode>

          <Mode
            n="02"
            name="Hire"
            title="A job market, not a router."
            body="Every task becomes a job posting. Each reachable model is scored on task fit, measured reputation, context headroom, availability and latency, then the best eligible one is hired and the reasoning is shown."
            foot="Policy runs before scoring. The struck row is a candidate barred after failing this task. A paid model under a $0 budget is removed the same way, never in the pool rather than out-ranked."
            href={market ? `/app/missions/${market.missionId}` : undefined}
            cta="Read the auction"
            delay={80}
          >
            {market ? <AuctionPanel market={market} /> : <Empty what="auction" />}
          </Mode>

          <Mode
            n="03"
            name="Verify"
            title="Evidence, not confidence."
            body="A task is complete when a compiler, a test runner or the filesystem says so. Model self-confidence is recorded separately and is the smallest term in the score."
            foot={
              run && checks.length > 0
                ? `ProofPack for mission ${run.mission.id}: ${passed} of ${checks.length} checks passed, $${run.usage.paidSpendUsd.toFixed(2)} paid, ${(run.mission.elapsedMs / 1000).toFixed(1)}s elapsed.`
                : 'Renders the ProofPack of the recorded run once demo/canonical-run.json exists.'
            }
            href={run ? `/app/missions/${run.mission.id}` : undefined}
            cta="Read the ProofPack"
            delay={160}
          >
            {checks.length > 0 ? <Checks checks={checks} /> : <Empty what="ProofPack" />}
          </Mode>
        </div>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- pieces */

function Split({ label, tone, items }: { label: string; tone: string; items: string[] }) {
  return (
    <div className="surface-card flex h-full min-w-0 flex-col gap-3 p-5 sm:flex-row sm:items-baseline sm:gap-6">
      <div className="mono shrink-0 text-[11px] uppercase tracking-[0.08em] sm:w-[11rem]" style={{ color: tone }}>
        {label}
      </div>
      <ul className="flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-[14px] text-[var(--color-mist)]">
        {items.map((x) => (
          <li key={x}>{x}</li>
        ))}
      </ul>
    </div>
  );
}

function Mode({
  n,
  name,
  title,
  body,
  foot,
  href,
  cta,
  delay = 0,
  children,
}: {
  n: string;
  name: string;
  title: string;
  body: string;
  foot: string;
  href?: string;
  cta: string;
  delay?: number;
  children: React.ReactNode;
}) {
  return (
    <Reveal delay={delay} className="min-w-0">
      <article className="surface-card flex h-full min-w-0 flex-col p-6">
        <div className="mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-frosted-lilac)]">
          {n} · {name}
        </div>
        <h3 className="heading mt-3 text-[22px] text-[var(--color-quartz)]">{title}</h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-[var(--color-ash)]">{body}</p>
        <div className="mt-5 min-w-0 flex-1">{children}</div>
        <p className="mt-5 border-t border-[var(--color-obsidian-edge)] pt-4 text-[12.5px] leading-relaxed text-[var(--color-ash)]">
          {foot}
        </p>
        {href && (
          <Link
            href={href}
            className="mono mt-1 inline-flex min-h-[44px] items-center gap-2 self-start text-[12px] text-[var(--color-frosted-lilac)]"
          >
            {cta}
            <IconArrowRight size={13} />
          </Link>
        )}
      </article>
    </Reveal>
  );
}

const STATE_TONE: Record<string, string> = {
  PASSED: 'var(--color-state-pass)',
  FAILED: 'var(--color-state-fail)',
  BLOCKED: 'var(--color-state-fail)',
  RUNNING: 'var(--color-frosted-lilac)',
};

function TaskGraph({ tasks }: { tasks: Task[] }) {
  return (
    <ol className="space-y-2">
      {tasks.map((t) => {
        const tone = STATE_TONE[t.state] ?? 'var(--color-ash)';
        return (
          <li
            key={t.id}
            className="flex min-w-0 items-start gap-3 rounded-[8px] border border-[var(--color-inkline)] px-3 py-2.5"
          >
            <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: tone }} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="mono truncate text-[12.5px] text-[var(--color-quartz)]">{t.id}</span>
                <span className="mono shrink-0 text-[10.5px] uppercase tracking-[0.08em]" style={{ color: tone }}>
                  {t.state}
                </span>
              </div>
              <div className="mt-0.5 truncate text-[12.5px] text-[var(--color-mist)]">{t.title}</div>
              <div className="mono mt-1 text-[11px] text-[var(--color-ash)]">
                {t.dependencies.length > 0 ? `after ${t.dependencies.join(' + ')}` : 'no dependencies, runs first'}
                {' · '}
                {t.attemptCount} attempt{t.attemptCount === 1 ? '' : 's'}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function AuctionPanel({ market }: { market: MarketPick }) {
  return (
    <div className="min-w-0">
      <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        Job · {market.task.title}
      </div>
      <dl className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-ash)]">
        <div>
          <dt className="sr-only">Candidates</dt>
          <dd>{market.auction.candidates.length} scored</dd>
        </div>
        <div>
          <dt className="sr-only">Max cost</dt>
          <dd>max ${market.budgetMaxUsd.toFixed(2)}</dd>
        </div>
        <div>
          <dt className="sr-only">Privacy</dt>
          <dd>{market.privacy}</dd>
        </div>
      </dl>
      <ul className="mt-4 space-y-3">
        {market.rows.map((c) => (
          <CandidateRow
            key={c.modelKey}
            name={c.displayName}
            utility={c.eligible ? c.utility.toFixed(2) : '–'}
            note={
              c.eligible
                ? `${c.costClass} · ${c.sampleCount} prior job${c.sampleCount === 1 ? '' : 's'}`
                : (c.ineligibleReason ?? 'ineligible')
            }
            winner={c.modelKey === market.auction.winner?.modelKey}
            blocked={!c.eligible}
          />
        ))}
      </ul>
    </div>
  );
}

function CandidateRow({
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

function Checks({ checks }: { checks: Check[] }) {
  return (
    <ul className="mono space-y-2 text-[12.5px]">
      {checks.slice(0, 8).map((c, i) => (
        <li key={`${c.id}-${i}`} className="flex items-center justify-between gap-4">
          <span className="truncate text-[var(--color-mist)]">{c.label}</span>
          <span
            className="shrink-0"
            style={{ color: c.status === 'pass' ? 'var(--color-state-pass)' : 'var(--color-state-fail)' }}
          >
            {c.status.toUpperCase()}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ what }: { what: string }) {
  return (
    <p className="text-[13px] text-[var(--color-ash)]">
      No recorded {what} yet. This panel renders a real mission from{' '}
      <code className="mono text-[var(--color-frosted-lilac)]">demo/canonical-run.json</code> and will
      not show invented numbers in the meantime.
    </p>
  );
}
