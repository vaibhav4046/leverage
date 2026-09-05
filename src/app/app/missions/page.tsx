import Link from 'next/link';
import { listMissions, loadPersistedRuns } from '@/server/missions';
import { getPageIdentity } from '@/auth/identity';
import { AuthNotice } from '@/components/app/auth-notice';
import { Page, PageHead, Table, Row, Cell, Pill, Empty, toneForStatus } from '@/components/app/shell';
import { IconMissions, IconArrowRight } from '@/components/icons';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const identity = getPageIdentity();
  if (!identity) return <AuthNotice />;

  const live = listMissions(identity.workspaceId);
  const persisted = await loadPersistedRuns(identity.workspaceId);
  const seen = new Set(live.map((m) => m.mission.id));
  const all = [...live, ...persisted.filter((p) => !seen.has(p.mission.id))];

  return (
    <Page>
      <PageHead
        eyebrow="History"
        title="Missions"
        lede="Completed runs keep their whole event log, so every figure below can be traced back to the moment it was recorded."
        actions={
          <Link href="/app/new" className="btn-primary">
            New mission
          </Link>
        }
      />

      <div className="mt-8">
        {all.length === 0 ? (
          <Empty
            icon={<IconMissions size={22} />}
            title="No missions yet."
            body="A mission is a goal plus a policy. Leverage compiles it into a task graph, hires a worker per task, and replaces any worker whose output fails verification."
            action={{ href: '/app/new', label: 'Create one' }}
          />
        ) : (
          <Table head={['Mission', 'Status', 'Tasks', 'Checkpoints', 'Paid', 'Elapsed', 'Open']}>
            {all.map((m) => {
              const passed = m.tasks.filter((t) => t.state === 'PASSED').length;
              return (
                <Row key={m.mission.id}>
                  <Cell>
                    <Link href={`/app/missions/${m.mission.id}`} className="group block min-w-0">
                      <span className="mono block text-[11px] text-[var(--color-ash)]">
                        {m.mission.id}
                      </span>
                      <span className="block max-w-[36rem] truncate text-[14px] text-[var(--color-quartz)] transition-colors group-hover:text-[var(--color-frosted-lilac)]">
                        {m.mission.goal}
                      </span>
                    </Link>
                  </Cell>
                  <Cell>
                    <Pill tone={toneForStatus(m.mission.status)}>{m.mission.status}</Pill>
                  </Cell>
                  <Cell mono>
                    {passed}/{m.tasks.length}
                  </Cell>
                  <Cell mono muted>
                    {m.checkpoints.length}
                  </Cell>
                  <Cell mono>
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
                  </Cell>
                  <Cell mono muted>
                    {(m.mission.elapsedMs / 1000).toFixed(0)}s
                  </Cell>
                  <Cell right>
                    <Link
                      href={`/app/missions/${m.mission.id}`}
                      aria-label={`Open mission ${m.mission.id}`}
                      className="inline-flex text-[var(--color-ash)] opacity-70 transition-colors hover:text-[var(--color-frosted-lilac)] hover:opacity-100"
                    >
                      <IconArrowRight size={16} />
                    </Link>
                  </Cell>
                </Row>
              );
            })}
          </Table>
        )}
      </div>
    </Page>
  );
}
