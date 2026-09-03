import { getExecutor, getRegistry } from '@/server/missions';

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  const registry = getRegistry();
  await registry.sweep(true);
  const rr = await getExecutor().health();
  const credits = await getExecutor().credits();

  return (
    <div className="p-6">
      <h1 className="heading text-[28px] text-[var(--color-quartz)]">Providers</h1>
      <p className="mt-2 max-w-[46rem] text-[15px] text-[var(--color-ash)]">
        Where intelligence comes from, and where it executes. Credential values never leave the
        server and are never rendered here.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {registry.list().map((p) => (
          <div key={p.adapter.providerId} className="surface-card p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[16px] text-[var(--color-quartz)]">{p.label}</div>
                <div className="mono mt-1 text-[11px] text-[var(--color-ash)]">
                  {p.adapter.providerId} · {p.adapter.costClass}
                </div>
              </div>
              <span
                className="mono text-[11px]"
                style={{
                  color:
                    p.health.status === 'HEALTHY'
                      ? 'var(--color-state-pass)'
                      : 'var(--color-state-warn)',
                }}
              >
                {p.health.status}
              </span>
            </div>
            <dl className="mono mt-4 space-y-1.5 text-[12px]">
              <Row k="models" v={String(p.models.length)} />
              <Row
                k="credential"
                v={p.adapter.costClass === 'local' ? 'none required' : 'server environment'}
              />
              {p.health.detail && <Row k="detail" v={p.health.detail.slice(0, 60)} />}
            </dl>
          </div>
        ))}

        <div className="surface-highlight p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[16px] text-[var(--color-quartz)]">RocketRide</div>
              <div className="mono mt-1 text-[11px] text-[var(--color-frosted-lilac)]">
                execution fabric
              </div>
            </div>
            <span
              className="mono text-[11px]"
              style={{ color: rr.ok ? 'var(--color-state-pass)' : 'var(--color-state-fail)' }}
            >
              {rr.ok ? 'HEALTHY' : 'UNAVAILABLE'}
            </span>
          </div>
          <dl className="mono mt-4 space-y-1.5 text-[12px]">
            <Row k="credential" v="server environment" />
            <Row k="credits" v={credits ? `${credits.balance} / ${credits.granted}` : 'unavailable'} />
            {credits && <Row k="consumed" v={credits.consumed.toFixed(2)} />}
          </dl>
          <p className="mt-4 text-[12px] leading-relaxed text-[var(--color-ash)]">
            Credit figures come from the RocketRide billing API. When it cannot answer, this reads
            &ldquo;unavailable&rdquo; rather than showing an estimate.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-[var(--color-ash)]">{k}</dt>
      <dd className="min-w-0 truncate text-[var(--color-mist)]">{v}</dd>
    </div>
  );
}
