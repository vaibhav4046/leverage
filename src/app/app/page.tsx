import Link from 'next/link';
import { listMissions, getRegistry } from '@/server/missions';

export const dynamic = 'force-dynamic';

export default async function AppOverview() {
  const missions = listMissions('ws_local');
  const registry = getRegistry();
  await registry.sweep();
  const counts = registry.countsByCostClass();
  const total = counts.local + counts.free + counts.paid;

  return (
    <div className="p-6">
      <h1 className="heading text-[28px] text-[var(--color-quartz)]">
        What should your workforce accomplish?
      </h1>
      <p className="mt-2 max-w-[42rem] text-[15px] text-[var(--color-ash)]">
        Describe an outcome and a policy. Leverage decides which models do the work.
      </p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/app/new" className="btn-primary">
          New mission
        </Link>
        <Link href="/app/models" className="btn-ghost">
          Inspect the workforce
        </Link>
      </div>

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Stat label="Reachable models" value={String(total)} />
        <Stat label="Local runtimes" value={String(counts.local)} />
        <Stat label="Free cloud routes" value={String(counts.free)} />
      </div>

      <section className="mt-10">
        <h2 className="mono mb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Missions
        </h2>
        {missions.length === 0 ? (
          <div className="surface-card p-6">
            <p className="text-[15px] text-[var(--color-mist)]">No missions in this workspace yet.</p>
            <p className="mt-2 max-w-[34rem] text-[13px] text-[var(--color-ash)]">
              A mission is a goal plus a policy: budget, quality target and privacy mode. Leverage
              compiles it into a task graph and hires workers against it.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {missions.map((m) => (
              <li key={m.mission.id}>
                <Link
                  href={`/app/missions/${m.mission.id}`}
                  className="surface-card flex items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--color-cobalt)]"
                >
                  <div className="min-w-0">
                    <div className="mono text-[11px] text-[var(--color-ash)]">{m.mission.id}</div>
                    <div className="truncate text-[15px] text-[var(--color-quartz)]">
                      {m.mission.goal}
                    </div>
                  </div>
                  <div className="mono shrink-0 text-right text-[11px]">
                    <div className="text-[var(--color-mist)]">{m.mission.status}</div>
                    <div className="text-[var(--color-ash)]">
                      ${m.usage.paidSpendUsd.toFixed(2)}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-5">
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className="mt-1 text-[26px] tabular-nums text-[var(--color-quartz)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
      >
        {value}
      </div>
    </div>
  );
}
