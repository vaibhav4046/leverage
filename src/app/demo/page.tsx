import fs from 'node:fs/promises';
import path from 'node:path';
import { SiteNav, SiteFooter } from '@/components/marketing/page-shell';
import { Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';

export const dynamic = 'force-dynamic';

/**
 * The demo page.
 *
 * A playable thing next to the evidence that produced it. The forge fixture proves
 * the loop on a receipt-splitting library, which is correct and completely
 * unmemorable; this proves the same loop on something you can look at and press
 * keys in. Both are the same machinery.
 *
 * Every figure here is read from `demo/arcade-run.json`. If that file is missing the
 * page says so and gives the command, rather than showing a number nobody measured.
 */
async function loadRun(file: string): Promise<MissionSnapshot | null> {
  try {
    return JSON.parse(await fs.readFile(path.resolve('demo', file), 'utf8')) as MissionSnapshot;
  } catch {
    return null;
  }
}

export default async function DemoPage() {
  const run = await loadRun('arcade-run.json');
  const checks = run?.proofs.flatMap((p) => p.checks) ?? [];
  const passed = checks.filter((c) => c.status === 'pass').length;
  const files = [...new Set(run?.proofs.flatMap((p) => p.filesChanged) ?? [])];

  return (
    <div className="min-h-screen bg-[var(--color-abyss)]">
      <SiteNav />

      <main id="main" className="mx-auto max-w-[1200px] px-6 py-16">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Demo
          </div>
          <h1 className="display mt-3 text-[clamp(2.25rem,5.5vw,3.25rem)] text-[var(--color-quartz)]">
            Free models wrote this. Play it.
          </h1>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            A gravity-arena prototype. The vector maths, the physics integration, the seeded
            spawner and the whole game state machine were written by Leverage workers under a
            hard $0 budget, and none of it was accepted until the committed tests passed. The
            render shell and the tests are given. The workers could read the tests they had to
            satisfy and could not edit them.
          </p>
        </Reveal>

        <Reveal delay={80}>
          <div className="surface-card mt-10 overflow-hidden p-0">
            <iframe
              src="/arcade/index.html"
              title="Arcade prototype built by Leverage"
              className="block h-[620px] w-full border-0"
              // The prototype is first-party static output with no network access of
              // its own; sandboxed anyway so a future change to it cannot reach the app.
              sandbox="allow-scripts"
            />
          </div>
          <p className="mono mt-3 text-[12px] text-[var(--color-ash)]">
            Click the frame first, then ← → to rotate, ↑ to thrust, space to fire.
          </p>
        </Reveal>

        {run ? (
          <>
            <div className="mt-14 grid grid-cols-2 gap-px bg-[var(--color-obsidian-edge)] md:grid-cols-4">
              <Stat label="Tasks verified" value={`${run.tasks.filter((t) => t.state === 'PASSED').length}/${run.tasks.length}`} />
              <Stat label="Proof checks" value={`${passed}/${checks.length}`} />
              <Stat label="Cognitive handoffs" value={String(run.checkpoints.length)} />
              <Stat label="Actual paid inference" value={`$${run.usage.paidSpendUsd.toFixed(2)}`} accent />
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-2">
              <Reveal>
                <section className="surface-card h-full p-6">
                  <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                    Who wrote what
                  </div>
                  <ul className="space-y-3">
                    {run.workers.map((w) => (
                      <li
                        key={w.id}
                        className="flex items-start justify-between gap-4 border-b border-[var(--color-inkline)] pb-3 last:border-0"
                      >
                        <div className="min-w-0">
                          <div className="mono truncate text-[13px] text-[var(--color-quartz)]">
                            {w.displayName}
                          </div>
                          <div className="mt-0.5 text-[12px] text-[var(--color-ash)]">
                            {w.role} ·{' '}
                            {w.costClass === 'host'
                              ? 'your subscription'
                              : w.costClass === 'local'
                                ? 'local runtime'
                                : w.costClass === 'free'
                                  ? 'free route'
                                  : 'paid'}
                            {w.resumedFromCheckpointId ? ' · resumed from a checkpoint' : ''}
                          </div>
                        </div>
                        <span
                          className="mono shrink-0 text-[11px] uppercase"
                          style={{
                            color:
                              w.status === 'passed'
                                ? 'var(--color-state-pass)'
                                : w.status === 'replaced' || w.status === 'failed'
                                  ? 'var(--color-state-warn)'
                                  : 'var(--color-ash)',
                          }}
                        >
                          {w.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </Reveal>

              <Reveal delay={80}>
                <section className="surface-card h-full p-6">
                  <div className="mono mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                    <span>ProofPack · {run.mission.id}</span>
                    <span className="text-[var(--color-quartz)]">
                      {passed}/{checks.length}
                    </span>
                  </div>
                  <ul className="mono space-y-2 text-[12px]">
                    {checks.map((c, i) => (
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
                  {files.length > 0 && (
                    <div className="mono mt-5 border-t border-[var(--color-obsidian-edge)] pt-4 text-[12px] text-[var(--color-ash)]">
                      files written: <span className="text-[var(--color-mist)]">{files.join(', ')}</span>
                    </div>
                  )}
                </section>
              </Reveal>
            </div>

            <Reveal delay={120}>
              <div className="surface-highlight mt-10 p-6">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
                  Reproduce it
                </div>
                <pre className="mono mt-3 overflow-x-auto text-[12px] leading-relaxed text-[var(--color-mist)]">
{`npm run fixture:reset:arcade
npm run mission -- --arcade
cd benchmark/arcade && npm test`}
                </pre>
                <p className="mt-3 max-w-[52rem] text-[13px] leading-relaxed text-[var(--color-ash)]">
                  It will not reproduce identically. Small models on free routes are stochastic,
                  so the attempt and handoff counts move between runs. The shape holds: nothing
                  is accepted until the committed tests pass, and paid spend is
                  <span className="mono text-[var(--color-quartz)]"> $0.00 </span>
                  every time, because the budget is enforced before the auction rather than
                  scored inside it.
                </p>
              </div>
            </Reveal>
          </>
        ) : (
          <div className="surface-card mt-12 p-6">
            <div className="text-[15px] text-[var(--color-mist)]">No recorded arcade run yet.</div>
            <p className="mt-2 max-w-[38rem] text-[13px] text-[var(--color-ash)]">
              Run{' '}
              <code className="mono text-[var(--color-frosted-lilac)]">
                npm run mission -- --arcade --out=demo/arcade-run.json
              </code>{' '}
              to build the prototype and record its evidence. This page will not show numbers
              nobody measured.
            </p>
          </div>
        )}
      </main>

      <SiteFooter />
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--color-void)] px-6 py-6">
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className="mt-1.5 text-[26px] tabular-nums"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: accent ? 'var(--color-state-pass)' : 'var(--color-quartz)',
        }}
      >
        {value}
      </div>
    </div>
  );
}
