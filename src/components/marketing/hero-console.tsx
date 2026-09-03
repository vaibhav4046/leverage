import type { MissionSnapshot } from '@/core/mission';

/**
 * Hero product surface.
 *
 * Three overlapping panels lifted from the real Mission Control: the mission and its
 * policy, the workforce, and the live event tail. Not an illustration of a product —
 * the same layout the app renders, fed from `demo/canonical-run.json`.
 *
 * When that file is missing the panels render an explicit "no run recorded yet"
 * state rather than plausible-looking placeholder numbers. A hero that invents
 * metrics is the exact failure this product exists to argue against.
 */
export function HeroConsole({ run }: { run: MissionSnapshot | null }) {
  const workers = run?.workers.slice(0, 4) ?? [];
  const events =
    run?.events
      .filter((e) =>
        [
          'worker.hired',
          'provider.rate_limit',
          'worker.failed',
          'checkpoint.created',
          'worker.replaced',
          'handoff.started',
          'verification.passed',
          'task.completed',
        ].includes(e.type),
      )
      .slice(-4) ?? [];

  return (
    <div className="relative min-w-0">
      {/* Panel 1 — mission + policy */}
      <div className="glass glass-live relative z-30 min-w-0 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
              Mission {run?.mission.id ?? '—'}
            </div>
            <div className="mt-1 truncate text-[15px] text-[var(--color-quartz)]">
              {run?.mission.goal.slice(0, 64) ?? 'No recorded run yet'}
            </div>
          </div>
          <StatusPill status={run?.mission.status ?? 'DRAFT'} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--color-obsidian-edge)] pt-4">
          <Metric
            label="Paid spend"
            value={run ? `$${run.usage.paidSpendUsd.toFixed(2)}` : '—'}
            emphasis
          />
          <Metric label="Quality target" value={run ? String(run.mission.quality.target * 100) : '—'} />
          <Metric label="Workers" value={run ? String(run.workers.length) : '—'} />
        </div>
      </div>

      {/* Panel 2 — workforce */}
      <div className="glass relative z-20 -mt-2 ml-6 min-w-0 p-5 sm:ml-8">
        <div className="mono mb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Workforce
        </div>
        {workers.length === 0 ? (
          <div className="text-[13px] text-[var(--color-ash)]">No workers recorded</div>
        ) : (
          <ul className="space-y-2">
            {workers.map((w) => (
              <li key={w.id} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="min-w-0 flex-1 truncate text-[var(--color-mist)]">{w.role}</span>
                <span className="mono min-w-0 flex-1 truncate text-[var(--color-quartz)]">
                  {w.displayName}
                </span>
                <WorkerState status={w.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Panel 3 — live tail */}
      <div className="glass relative z-10 -mt-2 ml-12 min-w-0 p-5 sm:ml-16">
        <div className="mono mb-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
          Execution
        </div>
        {events.length === 0 ? (
          <div className="text-[13px] text-[var(--color-ash)]">No events recorded</div>
        ) : (
          <ul className="mono space-y-1.5 text-[12px]">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <span className="shrink-0 text-[var(--color-ash)]">{fmt(e.elapsedMs)}</span>
                <span className="truncate text-[var(--color-mist)]">{e.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div>
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </div>
      <div
        className={`mt-1 tabular-nums ${emphasis ? 'text-[20px] text-[var(--color-quartz)]' : 'text-[15px] text-[var(--color-mist)]'}`}
        style={emphasis ? { fontFamily: 'var(--font-display)', fontWeight: 500 } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const passed = status === 'COMPLETED';
  return (
    <span
      className="mono shrink-0 rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-[0.08em]"
      style={{
        borderColor: passed ? 'rgba(74,222,128,0.4)' : 'var(--color-obsidian-edge)',
        color: passed ? 'var(--color-state-pass)' : 'var(--color-ash)',
      }}
    >
      {passed ? 'Verified' : status}
    </span>
  );
}

function WorkerState({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    passed: { label: 'PASSED', color: 'var(--color-state-pass)' },
    running: { label: 'RUNNING', color: 'var(--color-quartz)' },
    verifying: { label: 'VERIFYING', color: 'var(--color-frosted-lilac)' },
    failed: { label: 'FAILED', color: 'var(--color-state-fail)' },
    replaced: { label: 'REPLACED', color: 'var(--color-state-warn)' },
    released: { label: 'RELEASED', color: 'var(--color-ash)' },
  };
  const s = map[status] ?? { label: status.toUpperCase(), color: 'var(--color-ash)' };
  return (
    <span className="mono w-[76px] shrink-0 text-right text-[11px]" style={{ color: s.color }}>
      {s.label}
    </span>
  );
}

function fmt(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
