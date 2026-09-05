'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MissionSnapshot } from '@/core/mission';
import type { MissionEvent } from '@/core/types';

/**
 * Mission Control.
 *
 * Every value on this screen originates in the backend event log or the mission
 * snapshot. Nothing is timed, animated or interpolated locally: if the server has
 * not said a task is running, this page will not show it running. That constraint is
 * the reason the screen is trustworthy, and it is why there are no optimistic
 * updates anywhere in this file.
 */
export function MissionControl({
  initial,
  readOnly = false,
  readOnlyLabel = 'recorded · read-only',
}: {
  initial: MissionSnapshot;
  /** What the read-only pill says; a visitor's own live run is not a demo. */
  readOnlyLabel?: string;
  /**
   * A read-only viewer sees the whole run and none of the controls. The buttons are
   * removed rather than disabled: a disabled Start on a public demo invites the
   * reading that execution is broken, when in fact it is deliberately withheld.
   */
  readOnly?: boolean;
}) {
  const [snapshot, setSnapshot] = useState(initial);
  const [events, setEvents] = useState<MissionEvent[]>(initial.events);
  const [connected, setConnected] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const lastSeq = useRef(initial.events.at(-1)?.seq ?? 0);

  const missionId = initial.mission.id;
  const terminal = ['COMPLETED', 'FAILED', 'CANCELLED'].includes(snapshot.mission.status);

  // Refetch the whole snapshot on meaningful transitions. The event stream drives
  // the timeline; the snapshot keeps derived state (tasks, proofs, ledger) exact
  // rather than reconstructed on the client.
  const refresh = useCallback(async () => {
    const res = await fetch(`/api/v1/missions/${missionId}`, { cache: 'no-store' });
    if (res.ok) {
      const body = (await res.json()) as { mission: MissionSnapshot };
      setSnapshot(body.mission);
    }
  }, [missionId]);

  useEffect(() => {
    if (terminal) return;

    const source = new EventSource(`/api/v1/missions/${missionId}/events?after=${lastSeq.current}`);
    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);

    source.onmessage = (message) => {
      const event = JSON.parse(message.data) as MissionEvent;
      lastSeq.current = event.seq;
      setEvents((prev) => [...prev, event]);
    };

    const RESYNC_ON: string[] = [
      'task.completed',
      'task.failed',
      'worker.hired',
      'worker.failed',
      'checkpoint.created',
      'verification.passed',
      'mission.completed',
      'mission.failed',
      'mission.cancelled',
    ];
    for (const type of RESYNC_ON) {
      source.addEventListener(type, (e) => {
        const event = JSON.parse((e as MessageEvent).data) as MissionEvent;
        lastSeq.current = event.seq;
        setEvents((prev) => (prev.some((p) => p.seq === event.seq) ? prev : [...prev, event]));
        void refresh();
      });
    }

    return () => source.close();
  }, [missionId, terminal, refresh]);

  const selectedTask = snapshot.tasks.find((t) => t.id === selected);
  // Stable so the drawer's focus effect runs once per open, not once per event.
  const closeDrawer = useCallback(() => setSelected(null), []);

  return (
    <div className="flex min-h-screen flex-col">
      <MissionHeader
        snapshot={snapshot}
        connected={connected}
        terminal={terminal}
        onRefresh={refresh}
        readOnly={readOnly}
        readOnlyLabel={readOnlyLabel}
      />
      <MissionMetrics snapshot={snapshot} />

      <div className="grid flex-1 grid-cols-[minmax(0,1fr)] items-start gap-4 p-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
          <TaskGraph snapshot={snapshot} selected={selected} onSelect={setSelected} />
          <PlanPanel snapshot={snapshot} />
        </div>
        <WorkforcePanel snapshot={snapshot} />
      </div>

      <div className="px-4 pb-4">
        <EventTimeline events={events} live={connected && !terminal} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 pb-8 lg:grid-cols-2">
        <ProofPanel snapshot={snapshot} />
        <UsagePanel snapshot={snapshot} />
      </div>

      {selectedTask && (
        <DetailsDrawer
          snapshot={snapshot}
          taskId={selectedTask.id}
          onClose={closeDrawer}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ header */

interface PlannerRecordShape {
  displayName?: string;
  costClass?: string;
  durationMs?: number;
  taskCount?: number;
  promptTokens?: number;
  completionTokens?: number;
  skipped?: string[];
}

function plannerOf(snapshot: MissionSnapshot): {
  planner?: PlannerRecordShape;
  checks?: { taskId: string; suite: string }[];
  planText?: string;
} {
  const compiled = snapshot.events.find((e) => e.type === 'mission.compiled' && (e.data as { planner?: unknown } | undefined)?.planner);
  const data = (compiled?.data ?? {}) as { planner?: PlannerRecordShape; checks?: { taskId: string; suite: string }[]; planText?: string };
  return { planner: data.planner, checks: data.checks, planText: data.planText };
}

/**
 * The plan as evidence. For a model-planned mission: who planned, how long it
 * took, what each task is held to, and the proposal exactly as the model wrote
 * it. For a fixture: a plain statement that the plan is committed, so nobody
 * mistakes a benchmark for a planner demonstration.
 */
function PlanPanel({ snapshot }: { snapshot: MissionSnapshot }) {
  const { planner, checks, planText } = plannerOf(snapshot);
  const byTask = new Map((checks ?? []).map((c) => [c.taskId, c.suite]));
  const suites = snapshot.tasks.map((t) => ({ id: t.id, title: t.title, suite: byTask.get(t.id) }));

  return (
    <section className="surface-card p-5" aria-label="Plan">
      <div className="mono mb-4 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        <span>Plan</span>
        <span className="normal-case tracking-normal text-[var(--color-frosted-lilac)]">
          {planner?.displayName ? 'written by a model' : snapshot.mission.status === 'PLANNING' ? 'being written' : 'committed'}
        </span>
      </div>

      {planner?.displayName ? (
        <dl className="mono grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px]">
          <dt className="text-[var(--color-ash)]">planner</dt>
          <dd className="text-[var(--color-mist)]">
            {planner.displayName} <span className="text-[var(--color-ash)]">· {planner.costClass ?? 'free'}</span>
          </dd>
          <dt className="text-[var(--color-ash)]">took</dt>
          <dd className="text-[var(--color-mist)]">
            {((planner.durationMs ?? 0) / 1000).toFixed(1)}s
            {typeof planner.promptTokens === 'number' && typeof planner.completionTokens === 'number'
              ? ` · ${planner.promptTokens.toLocaleString()} in, ${planner.completionTokens.toLocaleString()} out`
              : ''}
          </dd>
          {planner.skipped && planner.skipped.length > 0 && (
            <>
              <dt className="text-[var(--color-ash)]">skipped</dt>
              <dd className="text-[var(--color-mist)]">
                {planner.skipped.length} candidate{planner.skipped.length === 1 ? '' : 's'} that did not answer
              </dd>
            </>
          )}
        </dl>
      ) : (
        <p className="text-[12.5px] leading-relaxed text-[var(--color-ash)]">
          {snapshot.mission.status === 'PLANNING'
            ? 'A planner model is reading the repository and writing the task graph. Tasks appear here when the compiler accepts them.'
            : 'The bundled benchmark runs its committed task graph, so a run measures the workforce and not the planner. Give a mission a repository path and a model writes the plan instead.'}
        </p>
      )}

      {suites.length > 0 && (
        <ul className="mt-4 space-y-1.5 border-t border-[var(--color-inkline)] pt-3">
          {suites.map((s) => (
            <li key={s.id} className="grid grid-cols-[minmax(0,1fr)] gap-0.5 text-[12px] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-3">
              <span className="truncate text-[var(--color-quartz)]" title={s.title}>
                {s.title}
              </span>
              <span className="mono truncate text-[11.5px] text-[var(--color-ash)]" title={s.suite ?? ''}>
                {s.suite ? `held to: ${s.suite}` : 'held to: the checks in its proof'}
              </span>
            </li>
          ))}
        </ul>
      )}

      {planText && (
        <details className="mt-4 border-t border-[var(--color-inkline)] pt-3">
          <summary className="mono cursor-pointer text-[11.5px] text-[var(--color-frosted-lilac)]">
            The proposal, as the model wrote it
          </summary>
          <pre className="mono mt-3 max-h-[320px] overflow-auto whitespace-pre-wrap break-words rounded-[9px] border border-[var(--color-inkline)] bg-[var(--color-void)] p-3 text-[11px] leading-relaxed text-[var(--color-mist)]">
            {planText}
          </pre>
        </details>
      )}
    </section>
  );
}

/** Where the task graph came from: a planner model, or the fixture's committed plan. */
function PlanOrigin({ snapshot }: { snapshot: MissionSnapshot }) {
  const compiled = snapshot.events.find((e) => e.type === 'mission.compiled');
  const planner = compiled?.data?.planner as
    | { displayName?: string; costClass?: string; taskCount?: number; durationMs?: number }
    | undefined;
  const text =
    snapshot.mission.status === 'PLANNING'
      ? 'a planner model is reading the repository and writing the task graph'
      : planner?.displayName
        ? `plan written by ${planner.displayName} (${planner.costClass ?? 'free'}) · ${planner.taskCount ?? snapshot.tasks.length} tasks in ${((planner.durationMs ?? 0) / 1000).toFixed(1)}s`
        : snapshot.tasks.length === 0
          ? 'no plan was accepted'
          : `committed plan · ${snapshot.tasks.length} tasks`;
  return <div className="mono mt-2 text-[11.5px] text-[var(--color-ash)]">{text}</div>;
}

function MissionHeader({
  snapshot,
  connected,
  terminal,
  onRefresh,
  readOnly,
  readOnlyLabel,
}: {
  snapshot: MissionSnapshot;
  connected: boolean;
  terminal: boolean;
  onRefresh: () => void;
  readOnly: boolean;
  readOnlyLabel: string;
}) {
  const [busy, setBusy] = useState(false);
  const { mission } = snapshot;
  const running = mission.status === 'RUNNING' || mission.status === 'VERIFYING';
  const queued = mission.status === 'QUEUED';

  const act = async (path: string, body?: unknown) => {
    setBusy(true);
    try {
      await fetch(`/api/v1/missions/${mission.id}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      });
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <header className="border-b border-[var(--color-obsidian-edge)] bg-[var(--color-void)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Mission {mission.id}
          </div>
          <h1 className="heading mt-1 max-w-[52rem] text-[22px] text-[var(--color-quartz)]">
            {mission.goal}
          </h1>
          <PlanOrigin snapshot={snapshot} />
        </div>

        <div className="flex items-center gap-3">
          <span
            className="mono rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.08em]"
            style={{
              borderColor:
                mission.status === 'COMPLETED'
                  ? 'rgba(74,222,128,0.4)'
                  : mission.status === 'FAILED'
                    ? 'rgba(248,113,113,0.4)'
                    : 'var(--color-obsidian-edge)',
              color:
                mission.status === 'COMPLETED'
                  ? 'var(--color-state-pass)'
                  : mission.status === 'FAILED'
                    ? 'var(--color-state-fail)'
                    : 'var(--color-quartz)',
            }}
          >
            {mission.status}
          </span>

          {readOnly && (
            <span className="mono rounded-full border border-[var(--color-sapphire-hairline)] px-3 py-1 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
              {readOnlyLabel}
            </span>
          )}

          {!readOnly && queued && (
            <>
              <button className="btn-primary !py-2 !text-[14px]" disabled={busy} onClick={() => act('start')}>
                Start mission
              </button>
              <button
                className="btn-ghost !py-2 !text-[14px]"
                disabled={busy}
                onClick={() => act('start', { injectFailure: true })}
                title="Deterministically fail the first free-pool call to demonstrate recovery"
              >
                Start with injected 429
              </button>
            </>
          )}
          {!readOnly && running && (
            <button className="btn-ghost !py-2 !text-[14px]" disabled={busy} onClick={() => act('cancel')}>
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="mono mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[var(--color-ash)]">
        <span aria-live="polite">
          {connected
            ? 'live event stream connected'
            : terminal
              ? 'event stream complete'
              : 'event stream idle'}
        </span>
        <span>·</span>
        <span>budget ${mission.budget.maxUsd.toFixed(2)} {mission.budget.hard ? 'hard' : 'soft'}</span>
        <span>·</span>
        <span>privacy {mission.privacy.mode}</span>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- metrics */

function MissionMetrics({ snapshot }: { snapshot: MissionSnapshot }) {
  const passed = snapshot.tasks.filter((t) => t.state === 'PASSED').length;
  const active = snapshot.workers.filter((w) => w.status === 'running' || w.status === 'verifying').length;
  const quality = snapshot.proofs.length
    ? snapshot.proofs.reduce((s, p) => s + p.qualityScore.total, 0) / snapshot.proofs.length
    : null;

  return (
    <div className="grid grid-cols-2 gap-px border-b border-[var(--color-obsidian-edge)] bg-[var(--color-obsidian-edge)] md:grid-cols-3 xl:grid-cols-6">
      <Metric label="Quality" value={quality === null ? '–' : quality.toFixed(0)} />
      <Metric label="Paid spend" value={`$${snapshot.usage.paidSpendUsd.toFixed(2)}`} accent />
      <Metric label="Elapsed" value={`${(snapshot.mission.elapsedMs / 1000).toFixed(1)}s`} />
      <Metric label="Tasks" value={`${passed}/${snapshot.tasks.length}`} />
      <Metric label="Active workers" value={String(active)} />
      <Metric
        label="Frontier-equiv"
        value={`$${snapshot.usage.estimatedFrontierEquivalentUsd.toFixed(4)}`}
        hint="estimated"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
}) {
  return (
    <div className="bg-[var(--color-void)] px-4 py-3.5">
      <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
        {hint && <span className="ml-1.5 normal-case text-[var(--color-ash)] opacity-80">({hint})</span>}
      </div>
      <div
        className="mt-1 tabular-nums text-[20px]"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: accent ? 'var(--color-state-pass)' : 'var(--color-quartz)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- task graph */

const TASK_STATE_STYLE: Record<string, { border: string; text: string }> = {
  PENDING: { border: 'var(--color-inkline)', text: 'var(--color-slate)' },
  READY: { border: 'var(--color-frosted-lilac)', text: 'var(--color-mist)' },
  HIRING: { border: 'var(--color-signal-blue)', text: 'var(--color-quartz)' },
  RUNNING: { border: 'var(--color-quartz)', text: 'var(--color-quartz)' },
  CHECKPOINTING: { border: 'var(--color-state-warn)', text: 'var(--color-state-warn)' },
  HANDOFF: { border: 'var(--color-state-warn)', text: 'var(--color-state-warn)' },
  VERIFYING: { border: 'var(--color-pulse-violet)', text: 'var(--color-frosted-lilac)' },
  PASSED: { border: 'rgba(74,222,128,0.45)', text: 'var(--color-state-pass)' },
  FAILED: { border: 'rgba(248,113,113,0.45)', text: 'var(--color-state-fail)' },
  BLOCKED: { border: 'var(--color-inkline)', text: 'var(--color-slate)' },
  CANCELLED: { border: 'var(--color-inkline)', text: 'var(--color-slate)' },
};

function TaskGraph({
  snapshot,
  selected,
  onSelect,
}: {
  snapshot: MissionSnapshot;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  // Columns by dependency depth. On narrow viewports this collapses to a list
  // rather than shrinking an unreadable graph — see the responsive classes below.
  const columns = useMemo(() => {
    const depth = new Map<string, number>();
    const byId = new Map(snapshot.tasks.map((t) => [t.id, t]));
    const resolve = (id: string, seen: Set<string>): number => {
      if (depth.has(id)) return depth.get(id)!;
      if (seen.has(id)) return 0;
      seen.add(id);
      const task = byId.get(id);
      const d = task
        ? task.dependencies.reduce((max, dep) => Math.max(max, resolve(dep, seen) + 1), 0)
        : 0;
      depth.set(id, d);
      return d;
    };
    for (const t of snapshot.tasks) resolve(t.id, new Set());

    const max = Math.max(0, ...depth.values());
    return Array.from({ length: max + 1 }, (_, i) =>
      snapshot.tasks.filter((t) => depth.get(t.id) === i),
    );
  }, [snapshot.tasks]);

  return (
    <section className="surface-card p-5" aria-label="Task graph">
      <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        Task graph
      </div>

      <div className="-mx-1 flex flex-col gap-4 px-1 md:flex-row md:items-start md:gap-4 md:overflow-x-auto md:pb-2">
        {columns.map((column, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col gap-3 md:w-[190px] md:min-w-[190px] md:flex-none">
            {column.map((task) => {
              const style = TASK_STATE_STYLE[task.state] ?? TASK_STATE_STYLE.PENDING;
              const isSelected = selected === task.id;
              return (
                <button
                  key={task.id}
                  onClick={() => onSelect(task.id)}
                  aria-pressed={isSelected}
                  className="rounded-[10px] border bg-[var(--color-abyss)] p-3 text-left transition-colors hover:bg-[var(--color-void)]"
                  style={{
                    borderColor: isSelected ? 'var(--color-frosted-lilac)' : style.border,
                  }}
                >
                  <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                    {task.category}
                  </div>
                  <div className="mt-1 text-[14px] leading-snug text-[var(--color-quartz)]">
                    {task.title}
                  </div>
                  <div className="mono mt-2 flex items-center justify-between gap-2 text-[10px]">
                    <span style={{ color: style.text }}>{task.state}</span>
                    {task.attemptCount > 1 && (
                      <span className="text-[var(--color-state-warn)]">
                        attempt {task.attemptCount}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- workforce */

function WorkforcePanel({ snapshot }: { snapshot: MissionSnapshot }) {
  // Which workers executed as RocketRide pipelines, from the log rather than
  // from a cost class: the scheduler stamps `via` on worker.started.
  const viaRocketRide = new Set(
    snapshot.events
      .filter((e) => e.type === 'worker.started' && (e.data as { via?: string } | undefined)?.via === 'rocketride-pipeline')
      .map((e) => e.workerRunId),
  );
  return (
    <section className="surface-card p-5 xl:max-h-[560px] xl:overflow-y-auto" aria-label="Workforce" tabIndex={0}>
      <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        Workforce
      </div>

      {snapshot.workers.length === 0 ? (
        <p className="text-[14px] text-[var(--color-ash)]">
          No workers hired yet. The auction runs when the first task becomes ready.
        </p>
      ) : (
        <ul className="space-y-3">
          {[...snapshot.workers].reverse().map((w) => (
            <li key={w.id} className="rounded-[10px] border border-[var(--color-inkline)] p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] text-[var(--color-quartz)]">{w.role}</div>
                  <div className="mono mt-0.5 truncate text-[12px] text-[var(--color-mist)]">
                    {w.displayName}
                    <span className="block text-[var(--color-ash)] sm:ml-2 sm:inline">
                      {viaRocketRide.has(w.id)
                        ? 'RocketRide pipeline'
                        : w.costClass === 'local'
                          ? 'local runtime'
                          : w.costClass === 'free'
                            ? 'free route'
                            : w.costClass === 'host'
                              ? 'your seat'
                              : 'paid'}
                    </span>
                  </div>
                </div>
                <WorkerBadge status={w.status} />
              </div>

              {w.auctionRationale && (
                <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-ash)]">
                  {w.auctionRationale}
                </p>
              )}

              <div className="mono mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--color-ash)]">
                {w.contextTokens !== undefined && <span>context {w.contextTokens} tok</span>}
                <span>${w.actualCostUsd.toFixed(4)}</span>
                {w.resumedFromCheckpointId && (
                  <span className="text-[var(--color-state-warn)]">
                    resumed from {w.resumedFromCheckpointId}
                  </span>
                )}
                {w.failureType && (
                  <span className="text-[var(--color-state-fail)]">{w.failureType}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkerBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    running: 'var(--color-quartz)',
    verifying: 'var(--color-frosted-lilac)',
    passed: 'var(--color-state-pass)',
    failed: 'var(--color-state-fail)',
    replaced: 'var(--color-state-warn)',
    released: 'var(--color-ash)',
  };
  return (
    <span
      className="mono shrink-0 text-[10px] uppercase tracking-[0.08em]"
      style={{ color: map[status] ?? 'var(--color-ash)' }}
    >
      {status}
    </span>
  );
}

/* ----------------------------------------------------------------- timeline */

/** Families a reader actually looks for in a log of a hundred events. */
const LOG_FILTERS: { key: string; label: string; match: (type: string) => boolean }[] = [
  { key: 'all', label: 'All', match: () => true },
  { key: 'hiring', label: 'Hiring', match: (t) => t.startsWith('auction.') || t === 'worker.hired' },
  { key: 'handoffs', label: 'Handoffs', match: (t) => t.startsWith('checkpoint.') || t.startsWith('handoff.') || t === 'worker.failed' || t === 'worker.released' },
  { key: 'proof', label: 'Proof', match: (t) => t.startsWith('proof.') || t.startsWith('verification.') || t === 'task.completed' },
  { key: 'failures', label: 'Failures', match: (t) => t.endsWith('.failed') || t === 'budget.blocked' || t === 'task.blocked' },
];

function EventTimeline({ events, live }: { events: MissionEvent[]; live: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [filter, setFilter] = useState('all');
  const active = LOG_FILTERS.find((f) => f.key === filter) ?? LOG_FILTERS[0];
  const shown = filter === 'all' ? events : events.filter((e) => active.match(e.type));
  useEffect(() => {
    // Scroll the log's own box, never the page. scrollIntoView walked up to the
    // document and dropped a visitor two thousand pixels down a mission page on
    // load; and on first render there is nothing new to follow yet.
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const box = endRef.current?.closest<HTMLElement>('[role="log"]');
    if (box) box.scrollTop = box.scrollHeight;
  }, [events.length]);

  return (
    <section className="surface-card" aria-label="Execution timeline">
      <div className="mono flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[var(--color-obsidian-edge)] px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        <span>
          {live ? 'Live execution' : 'Execution log'} · {filter === 'all' ? `${events.length} events` : `${shown.length} of ${events.length} events`}
        </span>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter the log">
          {LOG_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={filter === f.key}
              className="rounded-full border px-2.5 py-1 text-[10.5px] uppercase tracking-[0.08em] transition-colors"
              style={{
                borderColor: filter === f.key ? 'var(--color-frosted-lilac)' : 'var(--color-obsidian-edge)',
                color: filter === f.key ? 'var(--color-quartz)' : 'var(--color-ash)',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-[340px] overflow-y-auto px-5 py-3" role="log" aria-live="polite" aria-label="Execution log" tabIndex={0}>
        {shown.length === 0 && (
          <p className="mono py-2 text-[12px] text-[var(--color-ash)]">Nothing of that kind happened in this mission.</p>
        )}
        <ul className="space-y-1">
          {shown.map((e) => (
            // Below md the fixed columns left ~110px for the message, so one row
            // could run to 400px tall. Time and type share a line and the message
            // wraps underneath at full width; from md up the three columns return.
            <li
              key={e.id}
              className="mono flex flex-wrap gap-x-3 gap-y-0.5 text-[12px] leading-relaxed md:flex-nowrap"
            >
              <span className="w-[68px] shrink-0 tabular-nums text-[var(--color-ash)]">
                {formatElapsed(e.elapsedMs)}
              </span>
              <span className="shrink-0 md:w-[150px]" style={{ color: eventColor(e.type) }}>
                {e.type}
              </span>
              <span className="min-w-0 basis-full text-[var(--color-mist)] md:flex-1 md:basis-0">
                {e.message}
              </span>
            </li>
          ))}
        </ul>
        <div ref={endRef} />
      </div>
    </section>
  );
}

function eventColor(type: string): string {
  if (type.startsWith('worker.failed') || type.includes('failed') || type === 'budget.blocked') {
    return 'var(--color-state-fail)';
  }
  if (type.includes('checkpoint') || type.includes('handoff') || type.includes('rate_limit')) {
    return 'var(--color-state-warn)';
  }
  if (type.includes('passed') || type.includes('completed')) return 'var(--color-state-pass)';
  if (type.startsWith('auction')) return 'var(--color-frosted-lilac)';
  return 'var(--color-ash)';
}

/* -------------------------------------------------------------------- proof */

function ProofPanel({ snapshot }: { snapshot: MissionSnapshot }) {
  const checks = snapshot.proofs.flatMap((p) => p.checks);
  const passed = checks.filter((c) => c.status === 'pass').length;

  return (
    <section className="surface-card p-5" aria-label="Proof">
      <div className="mono mb-4 flex items-center justify-between text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        <span>Proof</span>
        <span className="text-[var(--color-quartz)]">
          {passed}/{checks.length} checks
        </span>
      </div>

      {checks.length === 0 ? (
        <p className="text-[14px] text-[var(--color-ash)]">
          No verification has run yet. Checks appear here as workers finish.
        </p>
      ) : (
        <ul className="mono space-y-2 text-[12px]">
          {checks.map((c, i) => (
            <li key={`${c.id}-${i}`} className="flex items-start justify-between gap-4">
              <span className="min-w-0 flex-1 text-[var(--color-mist)]">{c.label}</span>
              <span
                className="shrink-0"
                style={{
                  color:
                    c.status === 'pass' ? 'var(--color-state-pass)' : 'var(--color-state-fail)',
                }}
              >
                {c.status.toUpperCase()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------- usage */

function UsagePanel({ snapshot }: { snapshot: MissionSnapshot }) {
  const u = snapshot.usage;
  return (
    <section className="surface-card p-5" aria-label="Usage">
      <div className="mono mb-4 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        Usage
      </div>
      <dl className="grid grid-cols-2 gap-4">
        <Usage label="Paid spend" value={`$${u.paidSpendUsd.toFixed(2)}`} accent />
        {u.rocketRideCredits && (
          <Usage
            label="RocketRide credits"
            value={`${u.rocketRideCredits.used} used · ${u.rocketRideCredits.before} to ${u.rocketRideCredits.after}`}
          />
        )}
        <Usage label="Blocked paid attempts" value={String(u.blockedPaidAttempts)} />
        <Usage label="Local calls" value={String(u.localCalls)} />
        <Usage label="Free cloud calls" value={String(u.freeCalls)} />
      </dl>
      <p className="mt-5 border-t border-[var(--color-obsidian-edge)] pt-4 text-[12px] leading-relaxed text-[var(--color-ash)]">
        Estimated frontier-equivalent cost{' '}
        <span className="mono text-[var(--color-mist)]">
          ${u.estimatedFrontierEquivalentUsd.toFixed(4)}
        </span>{' '}
        is what this observed token workload would have cost at published frontier rates. An
        estimate, never a charge. Methodology in BENCHMARKS.md.
      </p>
    </section>
  );
}

function Usage({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <dt className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {label}
      </dt>
      <dd
        className="mt-1 tabular-nums text-[18px]"
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          color: accent ? 'var(--color-state-pass)' : 'var(--color-quartz)',
        }}
      >
        {value}
      </dd>
    </div>
  );
}

/* ------------------------------------------------------------------ drawer */

function DetailsDrawer({
  snapshot,
  taskId,
  onClose,
}: {
  snapshot: MissionSnapshot;
  taskId: string;
  onClose: () => void;
}) {
  const task = snapshot.tasks.find((t) => t.id === taskId)!;
  const auction = [...snapshot.auctions].reverse().find((a) => a.taskId === taskId);
  const checkpoint = snapshot.checkpoints.find((c) => c.taskId === taskId);
  const proof = snapshot.proofs.find((p) => p.taskId === taskId);

  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus and scroll discipline for the open drawer. Focus lands on Close so the
  // keyboard is inside the dialog, and goes back to the task node that opened it
  // on close; otherwise it fell to <body> and Tab restarted from the page top.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    // Below md the drawer covers the whole viewport, so the page behind it must
    // not scroll under a finger. From md up it is a side panel and the page may.
    const lockScroll = !window.matchMedia('(min-width: 768px)').matches;
    const previousOverflow = document.body.style.overflow;
    if (lockScroll) document.body.style.overflow = 'hidden';

    return () => {
      if (lockScroll) document.body.style.overflow = previousOverflow;
      opener?.focus();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const panel = panelRef.current;
      if (e.key !== 'Tab' || !panel) return;
      // Tab cycles within the panel. Anything behind the backdrop is off limits.
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const current = document.activeElement;
      const outside = !panel.contains(current);
      if (e.shiftKey ? current === first || outside : current === last || outside) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={`Task ${task.title}`}
    >
      <button
        className="flex-1 bg-black/50"
        aria-label="Close details"
        // Mouse-only: a full-screen invisible button is a bad Tab stop, and the
        // panel's own Close button plus Escape cover the keyboard.
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        className="w-full max-w-[520px] overflow-y-auto border-l border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)] p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
              {task.category} · {task.state}
            </div>
            <h2 className="heading mt-1 text-[20px] text-[var(--color-quartz)]">{task.title}</h2>
          </div>
          <button ref={closeRef} className="btn-ghost !px-3 !py-1 !text-[13px]" onClick={onClose}>
            Close
          </button>
        </div>

        {auction && (
          <Block title="Auction">
            <ul className="space-y-2">
              {auction.candidates.slice(0, 8).map((c) => (
                <li key={c.modelKey} className="flex items-start justify-between gap-3 text-[12px]">
                  <div className="min-w-0">
                    <div className="mono truncate text-[var(--color-quartz)]">{c.displayName}</div>
                    {!c.eligible && (
                      <div className="mt-0.5 text-[11px] text-[var(--color-state-fail)]">
                        {c.ineligibleReason}
                      </div>
                    )}
                    {c.eligible && c.sampleCount > 0 && (
                      <div className="mono mt-0.5 text-[11px] text-[var(--color-ash)]">
                        {c.sampleCount} prior jobs
                      </div>
                    )}
                  </div>
                  <span className="mono shrink-0 tabular-nums text-[var(--color-mist)]">
                    {c.eligible ? c.utility.toFixed(3) : '–'}
                  </span>
                </li>
              ))}
            </ul>
          </Block>
        )}

        {checkpoint && (
          <Block title="Cognitive checkpoint">
            <dl className="mono space-y-1.5 text-[12px]">
              <Row k="id" v={checkpoint.id} />
              <Row k="reason" v={checkpoint.reason} />
              <Row k="released" v={checkpoint.fromModelKey} />
              <Row k="original context" v={`${checkpoint.originalContextTokens} tok`} />
              <Row k="checkpoint size" v={`${checkpoint.checkpointTokens} tok`} />
              <Row k="reduction" v={`${checkpoint.reductionPct}%`} />
            </dl>
            {checkpoint.remainingWork.length > 0 && (
              <ul className="mt-3 space-y-1 text-[12px] text-[var(--color-ash)]">
                {checkpoint.remainingWork.map((w, i) => (
                  <li key={i}>· {w}</li>
                ))}
              </ul>
            )}
          </Block>
        )}

        {proof && (
          <Block title="ProofPack">
            <dl className="mono space-y-1.5 text-[12px]">
              <Row k="id" v={proof.id} />
              <Row k="status" v={proof.status} />
              <Row k="quality" v={String(proof.qualityScore.total)} />
              <Row k="files" v={proof.filesChanged.join(', ') || 'none'} />
              <Row k="duration" v={`${(proof.metrics.durationMs / 1000).toFixed(1)}s`} />
              <Row k="cost" v={`$${proof.metrics.actualCostUsd.toFixed(4)}`} />
            </dl>
          </Block>
        )}

        <Block title="Scope">
          <ul className="mono space-y-1 text-[12px] text-[var(--color-mist)]">
            {task.fileScope.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </Block>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 border-t border-[var(--color-obsidian-edge)] pt-5">
      <div className="mono mb-3 text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
        {title}
      </div>
      {children}
    </section>
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

function formatElapsed(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
}
