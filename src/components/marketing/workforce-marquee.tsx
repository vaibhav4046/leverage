import type { MissionSnapshot } from '@/core/mission';

interface Name {
  name: string;
  costClass: string;
  jobs: number;
  verified: number;
  role: 'worker' | 'planner';
}

/** The model that wrote a mission's plan, from the mission.compiled event it wrote. */
export function plannerOf(run: MissionSnapshot | null): Name | null {
  const compiled = run?.events.find(
    (e) => e.type === 'mission.compiled' && (e.data as { planner?: unknown } | undefined)?.planner,
  );
  const planner = (compiled?.data as { planner?: { displayName?: string; costClass?: string } } | undefined)?.planner;
  if (!planner?.displayName) return null;
  return { name: planner.displayName, costClass: planner.costClass ?? 'free', jobs: 1, verified: 1, role: 'planner' };
}

/**
 * The names that did the work, as a marquee.
 *
 * A logo wall says who a product would like to be associated with. This row is
 * built from the recorded missions: a name appears only if it passed at least one
 * verified task, or wrote the plan, in a run in this repository, and it carries
 * its record beside it. The row scrolls because there is more than fits, pauses
 * under the pointer so it can be read, and stands still under reduced motion.
 */
export function WorkforceMarquee({ runs, planner }: { runs: MissionSnapshot[]; planner: Name | null }) {
  const byName = new Map<string, Name>();
  for (const r of runs) {
    for (const w of r.workers) {
      const cur = byName.get(w.displayName) ?? {
        name: w.displayName,
        costClass: w.costClass,
        jobs: 0,
        verified: 0,
        role: 'worker' as const,
      };
      byName.set(w.displayName, {
        ...cur,
        jobs: cur.jobs + 1,
        verified: cur.verified + (w.status === 'passed' ? 1 : 0),
      });
    }
  }
  const workers = [...byName.values()].filter((n) => n.verified > 0);
  const jobs = workers.reduce((n, x) => n + x.jobs, 0);
  const names = planner && !byName.has(planner.name) ? [...workers, planner] : workers;
  if (names.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 pb-8 pt-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          The workforce
        </div>
        <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          Names that did verified work here.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          Not a logo wall. Every name below passed at least one verified task, or wrote the plan,
          in a recorded mission in this repository: {workers.length} models across {jobs} hires
          {planner ? ', plus the model that wrote a task graph' : ''}, with the record beside each. Cost class says how it was reached: local runtime, free
          route through the hosted pool, or the seat your subscription already pays for.
        </p>
      </div>

      <div className="marquee" role="region" aria-label="Models with verified work in the recorded missions">
        <div className="marquee-track" role="list">
          {[0, 1].map((copy) =>
            names.map((n) => (
              <Chip key={`${copy}-${n.name}`} n={n} hidden={copy === 1} />
            )),
          )}
        </div>
      </div>

      <p className="mono mx-auto max-w-[1200px] px-6 pb-16 pt-6 text-[11px] text-[var(--color-ash)]">
        Hosts it runs inside, through MCP: Claude Code · Codex · Cursor · Windsurf · Zed. Pause the
        row to read it.
      </p>
    </section>
  );
}

function Chip({ n, hidden }: { n: Name; hidden: boolean }) {
  return (
    <div
      role="listitem"
      aria-hidden={hidden || undefined}
      className="mr-3 inline-flex shrink-0 items-center gap-3 rounded-full border border-[var(--color-obsidian-edge)] bg-[var(--color-deep-sea)] py-2.5 pl-4 pr-3"
    >
      <span className="text-[14px] text-[var(--color-quartz)]">{n.name}</span>
      <span
        className="mono rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.05em]"
        style={{
          borderColor: n.costClass === 'host' ? 'rgba(74,222,128,0.35)' : 'var(--color-obsidian-edge)',
          color: n.costClass === 'host' ? 'var(--color-state-pass)' : 'var(--color-ash)',
        }}
      >
        {n.role === 'planner' ? 'planner' : n.costClass}
      </span>
      <span className="mono text-[11px] tabular-nums text-[var(--color-ash)]">
        {n.role === 'planner' ? 'wrote the plan' : `${n.verified}/${n.jobs} verified`}
      </span>
    </div>
  );
}
