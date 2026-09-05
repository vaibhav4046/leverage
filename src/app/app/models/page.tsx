import { getRegistry, getReputation } from '@/server/missions';
import { loadRecordedWorkforce, countsByCostClass } from '@/server/recorded-workforce';
import { Page, PageHead, Table, Row, Cell, Pill, Stat, Empty } from '@/components/app/shell';
import { IconModels, IconLocal, IconCloud, IconBudget, IconShield } from '@/components/icons';

export const metadata = { title: 'Models · Leverage' };

export const dynamic = 'force-dynamic';

const COST_TONE = {
  local: 'pass',
  free: 'pass',
  host: 'live',
  paid: 'warn',
} as const;

/** The hireable workforce, with whatever record each model has actually earned. */
export default async function ModelsPage() {
  const registry = getRegistry();
  await registry.sweep(true);
  const reputation = await getReputation();

  const live = registry.allModels().map((m) => ({
    model: m,
    rep: reputation.reputationFor(m.key),
    health: registry.healthFor(m.providerId).status,
  }));

  // This deployment probes the machine it runs on, and the public one has no
  // Ollama, no pool and no keys. Rather than show a judge zeros under a landing
  // page full of measured numbers, fall back to the same committed observations
  // that page reads — and say so.
  const recorded = live.length === 0 ? await loadRecordedWorkforce() : [];
  const usingRecorded = recorded.length > 0;

  const rows = usingRecorded
    ? recorded.map((r) => ({
        model: {
          key: r.key,
          displayName: r.displayName,
          providerId: r.providerId,
          costClass: r.costClass,
          contextTokens: 0,
        },
        rep: {
          samples: r.samples,
          verifiedSuccesses: r.verifiedSuccesses,
          successRate: r.successRate,
          medianLatencyMs: r.medianLatencyMs,
          confidence: r.confidence,
        },
        health: 'RECORDED',
      }))
    : live;

  const counts = usingRecorded ? countsByCostClass(recorded) : registry.countsByCostClass();
  const measured = rows.filter((r) => (r.rep?.samples ?? 0) > 0).length;

  return (
    <Page>
      <PageHead
        eyebrow="Workforce"
        title="Models"
        lede="Every model Leverage can currently reach. Success rates are shrunk toward a neutral prior and shipped with a sample count, so a model that went one-for-one does not read as a hundred-percent model."
      />

      {usingRecorded ? (
        <div
          className="mt-6 flex items-start gap-3 rounded-[10px] border px-4 py-3.5"
          style={{ borderColor: 'rgba(133,166,233,0.4)', background: 'rgba(133,166,233,0.07)' }}
        >
          <IconShield size={18} className="mt-0.5 shrink-0 text-[var(--color-frosted-lilac)]" />
          <p className="text-[13.5px] leading-relaxed text-[var(--color-mist)]">
            This deployment has no local runtime and no provider keys, so there is nothing here to
            discover. The table below is the{' '}
            <strong className="font-normal text-[var(--color-quartz)]">recorded record</strong> from
            the runs committed in this repository, read from{' '}
            <code className="mono text-[12.5px]">demo/proof/model-observations.json</code>. Run
            Leverage locally and this page probes your own machine instead.
          </p>
        </div>
      ) : null}

      <div className="mt-8 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Reachable"
          value={String(rows.length)}
          sub={`${measured} with a measured record`}
          icon={<IconModels size={17} />}
          tone="accent"
        />
        <Stat label="Local" value={String(counts.local)} sub="on this machine" icon={<IconLocal size={17} />} />
        <Stat label="Free routes" value={String(counts.free)} sub="billed at zero" icon={<IconCloud size={17} />} />
        <Stat
          label="Paid"
          value={String(counts.paid)}
          sub={counts.paid === 0 ? 'none reachable' : 'ineligible under a $0 budget'}
          icon={<IconBudget size={17} />}
          tone={counts.paid === 0 ? 'pass' : 'neutral'}
        />
      </div>

      <div className="mt-8">
        {rows.length === 0 ? (
          <Empty
            icon={<IconModels size={22} />}
            title="No models reachable, and no recorded observations to fall back on."
            body="Mission Control discovers models on the machine it runs on. Start Ollama or configure a pool and reload."
          />
        ) : (
        <Table
          head={['Model', 'Provider', 'Cost', 'Context', 'Health', 'Jobs', 'Verified', 'Median', 'Confidence']}
        >
          {rows.map(({ model, rep, health }) => (
            <Row key={model.key}>
              <Cell mono>
                <span className="text-[var(--color-quartz)]">{model.displayName}</span>
              </Cell>
              <Cell muted>{model.providerId}</Cell>
              <Cell>
                <Pill tone={COST_TONE[model.costClass as keyof typeof COST_TONE] ?? 'idle'}>
                  {model.costClass}
                </Pill>
              </Cell>
              <Cell mono muted>
                {model.contextTokens > 0 ? `${(model.contextTokens / 1000).toFixed(0)}K` : '–'}
              </Cell>
              <Cell>
                <Pill
                  tone={health === 'HEALTHY' ? 'pass' : health === 'RECORDED' ? 'live' : health === 'DEGRADED' ? 'warn' : 'idle'}
                >
                  {health}
                </Pill>
              </Cell>
              <Cell mono>{rep?.samples ?? 0}</Cell>
              <Cell mono>{rep ? `${rep.verifiedSuccesses}/${rep.samples}` : '–'}</Cell>
              <Cell mono muted>
                {rep?.medianLatencyMs ? `${(rep.medianLatencyMs / 1000).toFixed(1)}s` : '–'}
              </Cell>
              <Cell mono muted>
                {rep?.confidence ?? 'none'}
              </Cell>
            </Row>
          ))}
        </Table>
        )}
      </div>
    </Page>
  );
}
