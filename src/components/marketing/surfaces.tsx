import { Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';
import type { MissionEvent } from '@/core/types';

/**
 * Product surfaces.
 *
 * The pattern the good developer-tool sites share is that they show the product
 * populated with real, specific, technical detail — Linear puts real issue ids and
 * timestamps in its mockups, Claude embeds an actual debugging session with the
 * code changes and test results in it. What makes those read as premium is not the
 * gradient, it is the density of true detail.
 *
 * Leverage has better raw material than a mockup: an append-only event log from a
 * mission that actually ran. These components render slices of it. Nothing here is
 * composed for the page — every timestamp, model name and check result is read from
 * `demo/canonical-run.json`.
 */

/* ------------------------------------------------------------------ timeline */

const TIMELINE_TYPES = new Set([
  'auction.completed',
  'worker.hired',
  'worker.started',
  'provider.rate_limit',
  'worker.failed',
  'checkpoint.created',
  'handoff.started',
  'proof.check',
  'verification.passed',
  'task.completed',
  'mission.completed',
]);

/**
 * The execution log, as the console renders it.
 *
 * This is the most distinctive artefact the product has and it was sitting unused
 * on the landing page. It is the equivalent of Linear's Gantt chart or Claude's
 * embedded debugging session: the moment where the reader stops reading claims and
 * starts reading evidence.
 *
 * The slice is chosen around the failure, because the failure is the interesting
 * part — anyone can show a green run.
 */
export function ExecutionSurface({ run }: { run: MissionSnapshot | null }) {
  if (!run) return null;

  const events = run.events.filter((e) => TIMELINE_TYPES.has(e.type));
  const failureAt = events.findIndex(
    (e) => e.type === 'provider.rate_limit' || e.type === 'worker.failed',
  );
  // Window around the failure, or the tail if the run happened to be clean.
  const start = failureAt > 2 ? failureAt - 2 : 0;
  const slice = events.slice(start, start + 14);

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
          <Reveal className="min-w-0">
            <div className="lg:sticky lg:top-24">
              <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                Live execution
              </div>
              <h2 className="heading mt-3 text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
                Watch a worker fail and the work survive.
              </h2>
              <p className="mt-5 max-w-[32rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
                Every line to the right is a real event from mission{' '}
                <span className="mono text-[var(--color-frosted-lilac)]">{run.mission.id}</span>,
                read from its append-only log. The rate limit is injected and labelled as such —
                what is being demonstrated is the recovery, not the coincidence.
              </p>

              <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5">
                {[
                  ['Events recorded', String(run.events.length)],
                  ['Workers hired', String(run.workers.length)],
                  ['Handoffs', String(run.checkpoints.length)],
                  ['Paid spend', `$${run.usage.paidSpendUsd.toFixed(2)}`],
                ].map(([k, v], i) => (
                  <div key={k}>
                    <dt className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                      {k}
                    </dt>
                    <dd
                      className="mt-1 text-[22px] tabular-nums"
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 500,
                        color: i === 3 ? 'var(--color-state-pass)' : 'var(--color-quartz)',
                      }}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>

          <Reveal delay={90} y={24} className="min-w-0">
            <div className="surface-card overflow-hidden shadow-[0_24px_48px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between border-b border-[var(--color-obsidian-edge)] px-5 py-3">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                  {run.mission.id} · execution
                </div>
                <div className="flex items-center gap-1.5">
                  {['#f87171', '#fbbf24', '#4ade80'].map((c) => (
                    <span key={c} className="h-2 w-2 rounded-full" style={{ background: c, opacity: 0.5 }} />
                  ))}
                </div>
              </div>

              <ul className="divide-y divide-[var(--color-inkline)] overflow-x-auto">
                {slice.map((e) => (
                  <EventRow key={e.id} event={e} />
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function EventRow({ event }: { event: MissionEvent }) {
  const tone = eventTone(event.type);
  return (
    <li className="flex gap-3 px-5 py-2.5">
      <span className="mono w-[64px] shrink-0 tabular-nums text-[11px] leading-5 text-[var(--color-slate)]">
        {formatElapsed(event.elapsedMs)}
      </span>
      <span
        className="mono w-[132px] shrink-0 truncate text-[11px] leading-5"
        style={{ color: tone }}
      >
        {event.type}
      </span>
      <span className="mono min-w-0 flex-1 truncate text-[11px] leading-5 text-[var(--color-mist)]">
        {event.message}
      </span>
    </li>
  );
}

function eventTone(type: string): string {
  if (type.includes('failed') || type.includes('rate_limit')) return 'var(--color-state-fail)';
  if (type.includes('checkpoint') || type.includes('handoff')) return 'var(--color-state-warn)';
  if (type.includes('passed') || type.includes('completed')) return 'var(--color-state-pass)';
  if (type.startsWith('auction') || type.startsWith('worker')) return 'var(--color-frosted-lilac)';
  return 'var(--color-ash)';
}

function formatElapsed(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

/* --------------------------------------------------------------- leaderboard */

export interface ModelRow {
  displayName: string;
  costClass: string;
  samples: number;
  verified: number;
  successRate: number;
  medianLatencyMs: number;
  confidence: string;
}

/**
 * What the workforce has actually earned.
 *
 * The competitive point this makes is subtle and worth being explicit about: these
 * are not benchmark scores published by a vendor, they are this installation's own
 * record of which models did the work. A rate is shrunk toward a prior and shipped
 * with its sample count, so a model that went one-for-one cannot read as perfect.
 */
export function WorkforceLedger({ models }: { models: ModelRow[] }) {
  if (models.length === 0) return null;
  const rows = models.slice(0, 8);

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Self-learning workforce
          </div>
          <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            It learns which models are actually good.
          </h2>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Not a leaderboard someone else published — this installation&rsquo;s own record of
            which models passed verification on real work. Rates are shrunk toward a neutral
            prior and carry their sample count, so nothing here can claim more than it has
            earned.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="surface-card mt-10 overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left">
              <caption className="sr-only">Measured model performance for this installation</caption>
              <thead>
                <tr className="border-b border-[var(--color-obsidian-edge)]">
                  {['Model', 'Source', 'Jobs', 'Verified', 'Rate', 'Median', 'Confidence'].map((h) => (
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
                {rows.map((m) => (
                  <tr key={m.displayName} className="border-b border-[var(--color-inkline)] last:border-0">
                    <td className="mono px-5 py-3.5 text-[13px] text-[var(--color-quartz)]">
                      {m.displayName}
                    </td>
                    <td className="mono px-5 py-3.5 text-[12px]">
                      <span
                        className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.05em]"
                        style={{
                          borderColor:
                            m.costClass === 'host'
                              ? 'rgba(74,222,128,0.35)'
                              : 'var(--color-obsidian-edge)',
                          color:
                            m.costClass === 'host'
                              ? 'var(--color-state-pass)'
                              : 'var(--color-ash)',
                        }}
                      >
                        {m.costClass}
                      </span>
                    </td>
                    <td className="mono px-5 py-3.5 text-[12px] tabular-nums text-[var(--color-mist)]">
                      {m.samples}
                    </td>
                    <td className="mono px-5 py-3.5 text-[12px] tabular-nums text-[var(--color-mist)]">
                      {m.verified}
                    </td>
                    <td className="px-5 py-3.5">
                      <RateBar rate={m.successRate} />
                    </td>
                    <td className="mono px-5 py-3.5 text-[12px] tabular-nums text-[var(--color-ash)]">
                      {m.medianLatencyMs ? `${(m.medianLatencyMs / 1000).toFixed(1)}s` : '—'}
                    </td>
                    <td className="mono px-5 py-3.5 text-[12px] text-[var(--color-ash)]">
                      {m.confidence}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function RateBar({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1 w-20 overflow-hidden rounded-full bg-[var(--color-inkline)]">
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background:
              pct >= 70
                ? 'var(--color-state-pass)'
                : pct >= 45
                  ? 'var(--color-state-warn)'
                  : 'var(--color-state-fail)',
          }}
        />
      </div>
      <span className="mono text-[12px] tabular-nums text-[var(--color-mist)]">{pct}</span>
    </div>
  );
}

/* --------------------------------------------------------------- stats band */

/**
 * Aggregate across every recorded run.
 *
 * Deliberately small and boring. The temptation on this kind of band is to reach
 * for a number that sounds like traction; these are simply the totals of what is
 * in the repository, and the labels say so.
 */
export function StatsBand({ runs }: { runs: MissionSnapshot[] }) {
  if (runs.length === 0) return null;

  const tasks = runs.reduce((n, r) => n + r.tasks.length, 0);
  const passed = runs.reduce((n, r) => n + r.tasks.filter((t) => t.state === 'PASSED').length, 0);
  const checks = runs.flatMap((r) => r.proofs.flatMap((p) => p.checks));
  const handoffs = runs.reduce((n, r) => n + r.checkpoints.length, 0);
  const spend = runs.reduce((n, r) => n + r.usage.paidSpendUsd, 0);

  const stats: [string, string, string][] = [
    ['Recorded missions', String(runs.length), 'in this repository'],
    ['Tasks verified', `${passed}/${tasks}`, 'by a compiler or test runner'],
    ['Proof checks passed', `${checks.filter((c) => c.status === 'pass').length}/${checks.length}`, 'every one re-runnable'],
    ['Workers replaced mid-task', String(handoffs), 'without restarting the work'],
    ['Paid inference', `$${spend.toFixed(2)}`, 'across every run'],
  ];

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 py-14">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {stats.map(([label, value, note], i) => (
            <Reveal key={label} delay={i * 60}>
              <div>
                <div
                  className="text-[clamp(1.75rem,3vw,2.25rem)] tabular-nums"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 500,
                    letterSpacing: '-0.02em',
                    color: i === 4 ? 'var(--color-state-pass)' : 'var(--color-quartz)',
                  }}
                >
                  {value}
                </div>
                <div className="mt-2 text-[13px] text-[var(--color-mist)]">{label}</div>
                <div className="mt-0.5 text-[12px] text-[var(--color-slate)]">{note}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
