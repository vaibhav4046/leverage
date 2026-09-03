import { getRegistry, getReputation } from '@/server/missions';
import { Page, PageHead, Table, Row, Cell, Pill, Stat } from '@/components/app/shell';
import { IconModels, IconLocal, IconCloud, IconBudget } from '@/components/icons';

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

  const rows = registry.allModels().map((m) => ({
    model: m,
    rep: reputation.reputationFor(m.key),
    health: registry.healthFor(m.providerId).status,
  }));

  const counts = registry.countsByCostClass();
  const measured = rows.filter((r) => (r.rep?.samples ?? 0) > 0).length;

  return (
    <Page>
      <PageHead
        eyebrow="Workforce"
        title="Models"
        lede="Every model Leverage can currently reach. Success rates are shrunk toward a neutral prior and shipped with a sample count, so a model that went one-for-one does not read as a hundred-percent model."
      />

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
                {(model.contextTokens / 1000).toFixed(0)}K
              </Cell>
              <Cell>
                <Pill tone={health === 'HEALTHY' ? 'pass' : health === 'DEGRADED' ? 'warn' : 'idle'}>
                  {health}
                </Pill>
              </Cell>
              <Cell mono>{rep?.samples ?? 0}</Cell>
              <Cell mono>{rep ? `${rep.verifiedSuccesses}/${rep.samples}` : '—'}</Cell>
              <Cell mono muted>
                {rep?.medianLatencyMs ? `${(rep.medianLatencyMs / 1000).toFixed(1)}s` : '—'}
              </Cell>
              <Cell mono muted>
                {rep?.confidence ?? 'none'}
              </Cell>
            </Row>
          ))}
        </Table>
      </div>
    </Page>
  );
}
