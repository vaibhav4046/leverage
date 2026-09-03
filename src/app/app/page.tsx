import Link from 'next/link';
import { listMissions, loadPersistedRuns, getRegistry } from '@/server/missions';
import { getPageIdentity } from '@/auth/identity';
import { AuthNotice } from '@/components/app/auth-notice';
import {
  Page,
  PageHead,
  Section,
  Stat,
  Empty,
  Pill,
  toneForStatus,
} from '@/components/app/shell';
import {
  IconModels,
  IconLocal,
  IconCloud,
  IconBudget,
  IconMissions,
  IconArrowRight,
} from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function AppOverview() {
  const identity = getPageIdentity();
  if (!identity) return <AuthNotice />;

  const registry = getRegistry();
  await registry.sweep();
  const counts = registry.countsByCostClass();
  const total = counts.local + counts.free + counts.paid;

  // Live missions plus recorded ones, the same union the missions page shows. An
  // overview that disagrees with the page it links to is worse than no overview.
  const live = listMissions(identity.workspaceId);
  const seen = new Set(live.map((m) => m.mission.id));
  const missions = [...live, ...(await loadPersistedRuns(identity.workspaceId)).filter((m) => !seen.has(m.mission.id))];

  const spend = missions.reduce((sum, m) => sum + m.usage.paidSpendUsd, 0);
  const tasksPassed = missions.reduce(
    (sum, m) => sum + m.tasks.filter((t) => t.state === 'PASSED').length,
    0,
  );
  const tasksTotal = missions.reduce((sum, m) => sum + m.tasks.length, 0);

  return (
    <Page>
      <PageHead
        eyebrow="Workspace"
        title="What should your workforce accomplish?"
        lede="Describe an outcome and a policy. Leverage compiles it into a task graph, hires against it, and verifies every result before calling it done."
        actions={
          <>
            <Link href="/app/new" className="btn-primary">
              New mission
            </Link>
            <Link href="/app/models" className="btn-ghost">
              Inspect the workforce
            </Link>
          </>
        }
      />

      <div className="mt-8 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Reachable models"
          value={String(total)}
          sub={`${counts.local} local · ${counts.free} free · ${counts.paid} paid`}
          icon={<IconModels size={17} />}
          tone="accent"
        />
        <Stat
          label="Local runtimes"
          value={String(counts.local)}
          sub="never leave this machine"
          icon={<IconLocal size={17} />}
        />
        <Stat
          label="Free cloud routes"
          value={String(counts.free)}
          sub="metered, billed at zero"
          icon={<IconCloud size={17} />}
        />
        <Stat
          label="Paid inference"
          value={`$${spend.toFixed(2)}`}
          sub={tasksTotal > 0 ? `${tasksPassed}/${tasksTotal} tasks verified` : 'nothing spent yet'}
          icon={<IconBudget size={17} />}
          tone={spend === 0 ? 'pass' : 'neutral'}
        />
      </div>

      <Section
        title="Missions"
        hint="Every run keeps its full event log, so any number here can be traced to the moment it happened."
        actions={
          missions.length > 0 ? (
            <Link
              href="/app/missions"
              className="mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)] transition-opacity hover:opacity-80"
            >
              All missions
              <IconArrowRight size={13} />
            </Link>
          ) : undefined
        }
      >
        {missions.length === 0 ? (
          <Empty
            icon={<IconMissions size={22} />}
            title="No missions in this workspace yet."
            body="A mission is a goal plus a policy: budget, quality target and privacy mode. Leverage compiles it into a task graph and hires workers against it."
            action={{ href: '/app/new', label: 'Start one' }}
          />
        ) : (
          <ul className="space-y-2.5">
            {missions.slice(0, 6).map((m) => {
              const passed = m.tasks.filter((t) => t.state === 'PASSED').length;
              return (
                <li key={m.mission.id}>
                  <Link
                    href={`/app/missions/${m.mission.id}`}
                    className="surface-card group flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:border-[var(--color-sapphire-hairline)] hover:bg-[var(--color-deep-sea)]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span className="mono text-[11px] text-[var(--color-ash)]">
                          {m.mission.id}
                        </span>
                        <Pill tone={toneForStatus(m.mission.status)}>{m.mission.status}</Pill>
                      </div>
                      <div className="mt-1.5 truncate text-[14.5px] text-[var(--color-quartz)]">
                        {m.mission.goal}
                      </div>
                    </div>
                    <div className="mono flex shrink-0 items-center gap-7 text-[11.5px] tabular-nums">
                      <span className="text-[var(--color-ash)]">
                        {passed}/{m.tasks.length} tasks
                      </span>
                      <span
                        style={{
                          color:
                            m.usage.paidSpendUsd === 0
                              ? 'var(--color-state-pass)'
                              : 'var(--color-mist)',
                        }}
                      >
                        ${m.usage.paidSpendUsd.toFixed(2)}
                      </span>
                      <IconArrowRight
                        size={15}
                        className="text-[var(--color-slate)] transition-colors group-hover:text-[var(--color-frosted-lilac)]"
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </Page>
  );
}
