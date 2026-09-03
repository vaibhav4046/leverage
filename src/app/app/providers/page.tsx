import { getExecutor, getRegistry } from '@/server/missions';
import { Page, PageHead, Section, Pill } from '@/components/app/shell';
import { IconLocal, IconCloud, IconHost, IconProviders, IconShield } from '@/components/icons';

export const dynamic = 'force-dynamic';

/** One glyph per kind of supply, so the grid is scannable without reading labels. */
function supplyIcon(providerId: string, costClass: string) {
  if (costClass === 'local') return <IconLocal size={18} />;
  if (costClass === 'host') return <IconHost size={18} />;
  if (providerId === 'agent-cli') return <IconShield size={18} />;
  return <IconCloud size={18} />;
}

export default async function ProvidersPage() {
  const registry = getRegistry();
  await registry.sweep(true);
  const rr = await getExecutor().health();
  const credits = await getExecutor().credits();

  return (
    <Page>
      <PageHead
        eyebrow="Supply"
        title="Providers"
        lede="Where intelligence comes from, and where it executes. Credential values never leave the server and are never rendered here — only whether one is present."
      />

      <Section
        title="Sources of intelligence"
        hint="Health is swept on load, so a provider that went away since the last mission shows as unavailable rather than being hired and failing."
      >
        <div className="grid gap-3.5 md:grid-cols-2 xl:grid-cols-3">
          {registry.list().map((p) => (
            <article key={p.adapter.providerId} className="surface-card flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] border border-[var(--color-sapphire-hairline)] text-[var(--color-frosted-lilac)]"
                    style={{ background: 'rgba(133,166,233,0.06)' }}
                  >
                    {supplyIcon(p.adapter.providerId, p.adapter.costClass)}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15.5px] leading-snug text-[var(--color-quartz)]">
                      {p.label}
                    </div>
                    <div className="mono mt-1.5 truncate text-[11px] text-[var(--color-ash)]">
                      {p.adapter.providerId} · {p.adapter.costClass}
                    </div>
                  </div>
                </div>
                <Pill
                  tone={
                    p.health.status === 'HEALTHY'
                      ? 'pass'
                      : p.health.status === 'DEGRADED'
                        ? 'warn'
                        : 'idle'
                  }
                >
                  {p.health.status}
                </Pill>
              </div>

              <dl className="mono mt-4 space-y-1.5 border-t border-[var(--color-inkline)] pt-3.5 text-[12px]">
                <Field k="models" v={String(p.models.length)} />
                <Field
                  k="credential"
                  v={p.adapter.costClass === 'local' ? 'none required' : 'server environment'}
                />
                {p.health.detail ? <Field k="detail" v={p.health.detail.slice(0, 60)} /> : null}
              </dl>
            </article>
          ))}
        </div>
      </Section>

      <Section
        title="Execution fabric"
        hint="Cloud workers run as RocketRide pipelines. Leverage decides who works; RocketRide is how they run."
      >
        <article className="surface-highlight p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3.5">
              <span
                className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border text-[var(--color-frosted-lilac)]"
                style={{
                  background: 'rgba(98,95,255,0.10)',
                  borderColor: 'rgba(133,166,233,0.4)',
                }}
              >
                <IconProviders size={21} />
              </span>
              <div className="min-w-0">
                <div className="text-[17px] text-[var(--color-quartz)]">RocketRide</div>
                <div className="mono mt-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
                  pipelines · traces · token accounting
                </div>
              </div>
            </div>
            <Pill tone={rr.ok ? 'pass' : 'fail'}>{rr.ok ? 'HEALTHY' : 'UNAVAILABLE'}</Pill>
          </div>

          <dl className="mono mt-5 grid gap-1.5 border-t border-[var(--color-inkline)] pt-4 text-[12px] sm:grid-cols-3 sm:gap-x-8">
            <Field k="credential" v="server environment" />
            <Field
              k="credits"
              v={credits ? `${credits.balance} / ${credits.granted}` : 'unavailable'}
            />
            {credits ? <Field k="consumed" v={credits.consumed.toFixed(2)} /> : null}
          </dl>

          <p className="mt-4 max-w-[52rem] text-[12.5px] leading-relaxed text-[var(--color-ash)]">
            Credit figures come from the RocketRide billing API. When it cannot answer, this reads
            &ldquo;unavailable&rdquo; rather than showing an estimate.
          </p>
        </article>
      </Section>
    </Page>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="shrink-0 text-[var(--color-ash)]">{k}</dt>
      <dd className="min-w-0 truncate text-[var(--color-mist)]">{v}</dd>
    </div>
  );
}
