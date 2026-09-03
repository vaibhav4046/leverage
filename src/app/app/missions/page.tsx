import Link from 'next/link';
import { listMissions, loadPersistedRuns } from '@/server/missions';
import { getPageIdentity } from '@/auth/identity';
import { AuthNotice } from '@/components/app/auth-notice';

export const dynamic = 'force-dynamic';

export default async function MissionsPage() {
  const identity = getPageIdentity();
  if (!identity) return <AuthNotice />;
  const live = listMissions(identity.workspaceId);
  const persisted = await loadPersistedRuns(identity.workspaceId);
  const seen = new Set(live.map((m) => m.mission.id));
  const all = [...live, ...persisted.filter((p) => !seen.has(p.mission.id))];

  return (
    <div className="p-6">
      <h1 className="heading text-[28px] text-[var(--color-quartz)]">Missions</h1>

      {all.length === 0 ? (
        <p className="mt-4 text-[15px] text-[var(--color-ash)]">
          No missions yet.{' '}
          <Link href="/app/new" className="text-[var(--color-frosted-lilac)] underline">
            Create one.
          </Link>
        </p>
      ) : (
        <ul className="mt-6 space-y-2">
          {all.map((m) => (
            <li key={m.mission.id}>
              <Link
                href={`/app/missions/${m.mission.id}`}
                className="surface-card flex flex-wrap items-center justify-between gap-4 p-4 transition-colors hover:bg-[var(--color-cobalt)]"
              >
                <div className="min-w-0">
                  <div className="mono text-[11px] text-[var(--color-ash)]">{m.mission.id}</div>
                  <div className="truncate text-[15px] text-[var(--color-quartz)]">
                    {m.mission.goal}
                  </div>
                </div>
                <div className="mono flex shrink-0 gap-6 text-[11px] text-[var(--color-ash)]">
                  <span>
                    {m.tasks.filter((t) => t.state === 'PASSED').length}/{m.tasks.length} tasks
                  </span>
                  <span>{m.checkpoints.length} handoffs</span>
                  <span className="text-[var(--color-state-pass)]">
                    ${m.usage.paidSpendUsd.toFixed(2)}
                  </span>
                  <span className="text-[var(--color-mist)]">{m.mission.status}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
