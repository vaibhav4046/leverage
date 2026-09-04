import type { MissionTask, TaskState } from './types';
import { TERMINAL_TASK_STATES } from './types';

/**
 * Task-graph engine.
 *
 * Two jobs: refuse to run a graph that cannot terminate (cycles, dangling edges),
 * and answer "what is runnable right now" without ever letting a task start before
 * every dependency has actually PASSED.
 */

export class DagError extends Error {
  constructor(
    message: string,
    readonly detail: { kind: 'cycle' | 'missing-dependency' | 'self-dependency'; nodes: string[] },
  ) {
    super(message);
    this.name = 'DagError';
  }
}

/**
 * Validates the graph and returns a topological order.
 *
 * Throws rather than returning a flag: an invalid DAG must never reach the
 * scheduler, and a caller that ignores a boolean is how that happens.
 */
export function validateDag(tasks: MissionTask[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const task of tasks) {
    for (const dep of task.dependencies) {
      if (dep === task.id) {
        throw new DagError(`Task ${task.id} depends on itself`, {
          kind: 'self-dependency',
          nodes: [task.id],
        });
      }
      if (!byId.has(dep)) {
        throw new DagError(`Task ${task.id} depends on unknown task ${dep}`, {
          kind: 'missing-dependency',
          nodes: [task.id, dep],
        });
      }
    }
  }

  // Kahn's algorithm. Whatever is left over when the queue drains is a cycle.
  const indegree = new Map<string, number>(tasks.map((t) => [t.id, t.dependencies.length]));
  const dependents = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependencies) {
      const list = dependents.get(dep) ?? [];
      list.push(task.id);
      dependents.set(dep, list);
    }
  }

  const queue = tasks.filter((t) => t.dependencies.length === 0).map((t) => t.id);
  // Stable ordering so a given mission always compiles to the same plan.
  queue.sort();
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of dependents.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining === 0) queue.push(next);
    }
    queue.sort();
  }

  if (order.length !== tasks.length) {
    const stuck = tasks.filter((t) => !order.includes(t.id)).map((t) => t.id);
    throw new DagError(`Task graph contains a cycle involving: ${stuck.join(', ')}`, {
      kind: 'cycle',
      nodes: stuck,
    });
  }

  return order;
}

/**
 * Tasks whose dependencies have all PASSED and which are not already in flight.
 *
 * Note the asymmetry with `isBlocked`: a dependency that FAILED does not make a task
 * ready, it makes it permanently blocked. Only PASSED unblocks.
 */
export function readyTasks(tasks: MissionTask[]): MissionTask[] {
  const stateById = new Map(tasks.map((t) => [t.id, t.state]));
  return tasks.filter((task) => {
    if (task.state !== 'PENDING' && task.state !== 'READY') return false;
    return task.dependencies.every((dep) => stateById.get(dep) === 'PASSED');
  });
}

/** A task can never run because something upstream failed or was cancelled. */
export function isBlocked(task: MissionTask, tasks: MissionTask[]): boolean {
  const stateById = new Map(tasks.map((t) => [t.id, t.state]));
  return task.dependencies.some((dep) => {
    const s = stateById.get(dep);
    return s === 'FAILED' || s === 'CANCELLED';
  });
}

/** Every task has reached a terminal state — nothing further can be scheduled. */
export function isSettled(tasks: MissionTask[]): boolean {
  return tasks.every(
    (t) => TERMINAL_TASK_STATES.includes(t.state) || (t.state === 'BLOCKED' && isBlocked(t, tasks)),
  );
}

/**
 * Legal task state transitions. The API layer routes every write through this so a
 * client cannot post its way into an impossible state.
 */
const TRANSITIONS: Record<TaskState, TaskState[]> = {
  PENDING: ['READY', 'BLOCKED', 'CANCELLED'],
  READY: ['HIRING', 'BLOCKED', 'AWAITING_APPROVAL', 'CANCELLED'],
  HIRING: ['RUNNING', 'FAILED', 'BLOCKED', 'CANCELLED'],
  RUNNING: ['VERIFYING', 'CHECKPOINTING', 'FAILED', 'CANCELLED'],
  AWAITING_APPROVAL: ['HIRING', 'READY', 'CANCELLED', 'FAILED'],
  CHECKPOINTING: ['HANDOFF', 'FAILED', 'CANCELLED'],
  HANDOFF: ['HIRING', 'RUNNING', 'FAILED', 'CANCELLED'],
  VERIFYING: ['PASSED', 'FAILED', 'CHECKPOINTING', 'CANCELLED'],
  BLOCKED: ['READY', 'CANCELLED', 'FAILED'],
  PASSED: [],
  FAILED: [],
  CANCELLED: [],
};

export function canTransition(from: TaskState, to: TaskState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(taskId: string, from: TaskState, to: TaskState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal task transition for ${taskId}: ${from} -> ${to}`);
  }
}

/** Longest dependency chain — used to lay the graph out in columns in the UI. */
export function computeDepths(tasks: MissionTask[]): Map<string, number> {
  const order = validateDag(tasks);
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const depth = new Map<string, number>();
  for (const id of order) {
    const task = byId.get(id)!;
    const d = task.dependencies.reduce((max, dep) => Math.max(max, (depth.get(dep) ?? 0) + 1), 0);
    depth.set(id, d);
  }
  return depth;
}
