import { getRegistry, getReputation } from '@/server/missions';

export const dynamic = 'force-dynamic';

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

  const headers = [
    'Model',
    'Provider',
    'Cost',
    'Context',
    'Health',
    'Jobs',
    'Verified',
    'Median',
    'Confidence',
  ];

  return (
    <div className="p-6">
      <h1 className="heading text-[28px] text-[var(--color-quartz)]">Models</h1>
      <p className="mt-2 max-w-[46rem] text-[15px] text-[var(--color-ash)]">
        Every model Leverage can currently reach. Success rates are shrunk toward a neutral prior
        and shipped with a sample count, so a model that went one-for-one does not read as a
        hundred-percent model.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-left">
          <caption className="sr-only">Reachable models and their measured performance</caption>
          <thead>
            <tr className="border-b border-[var(--color-obsidian-edge)]">
              {headers.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="mono px-3 py-2.5 text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, rep, health }) => (
              <tr key={model.key} className="border-b border-[var(--color-inkline)]">
                <td className="mono px-3 py-3 text-[13px] text-[var(--color-quartz)]">
                  {model.displayName}
                </td>
                <td className="px-3 py-3 text-[13px] text-[var(--color-mist)]">
                  {model.providerId}
                </td>
                <td
                  className="mono px-3 py-3 text-[12px]"
                  style={{
                    color:
                      model.costClass === 'paid'
                        ? 'var(--color-state-warn)'
                        : 'var(--color-state-pass)',
                  }}
                >
                  {model.costClass}
                </td>
                <td className="mono px-3 py-3 text-[12px] tabular-nums text-[var(--color-ash)]">
                  {(model.contextTokens / 1000).toFixed(0)}K
                </td>
                <td className="mono px-3 py-3 text-[12px] text-[var(--color-mist)]">{health}</td>
                <td className="mono px-3 py-3 text-[12px] tabular-nums text-[var(--color-mist)]">
                  {rep?.samples ?? 0}
                </td>
                <td className="mono px-3 py-3 text-[12px] tabular-nums text-[var(--color-mist)]">
                  {rep ? `${rep.verifiedSuccesses}/${rep.samples}` : '—'}
                </td>
                <td className="mono px-3 py-3 text-[12px] tabular-nums text-[var(--color-ash)]">
                  {rep?.medianLatencyMs ? `${(rep.medianLatencyMs / 1000).toFixed(1)}s` : '—'}
                </td>
                <td className="mono px-3 py-3 text-[12px] text-[var(--color-ash)]">
                  {rep?.confidence ?? 'none'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
