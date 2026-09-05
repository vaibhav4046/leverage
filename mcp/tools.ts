/**
 * The Leverage MCP tool surface, shared by every transport.
 *
 * Five tools, deliberately: a host model is a strategist, and a strategist needs
 * to state an outcome, watch it, stop it and inspect the evidence. The stdio
 * host (server.ts) and the Streamable HTTP host (http-server.ts) both serve
 * exactly this list and this dispatch, so a judge's chat app and a developer's
 * CLI talk to the same thing.
 */
export const API = (process.env.LEVERAGE_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TOKEN = process.env.LEVERAGE_API_TOKEN;

export const TOOLS = [
  {
    name: 'leverage_run',
    description:
      'Start a Leverage mission. Describe the outcome and the policy. With repositoryRoot, a ' +
      'planner model turns the goal into a validated task graph for that repository; without it, ' +
      'the bundled benchmark repository runs its committed plan. Leverage hires models against the ' +
      "graph, verifies every result with the repository's own checks and replaces workers that " +
      'fail. Returns immediately with a mission id; poll leverage_status for progress.',
    inputSchema: {
      type: 'object',
      properties: {
        repositoryRoot: {
          type: 'string',
          description:
            'Absolute path to the repository the mission should work in, on the machine running ' +
            'this MCP server. Omit to run the bundled benchmark fixture.',
          minLength: 2,
          maxLength: 1024,
        },
        goal: {
          type: 'string',
          description: 'What must be true when this is done. Plain language.',
          minLength: 8,
          maxLength: 8000,
        },
        budgetMaxUsd: {
          type: 'number',
          description:
            'Hard ceiling on paid inference in USD. 0 means paid routes are blocked entirely, ' +
            'not merely discouraged. Defaults to 0.',
          minimum: 0,
          maximum: 1000,
        },
        qualityTarget: {
          type: 'number',
          description: 'Minimum verified quality to accept a task, 0-1. Defaults to 0.95.',
          minimum: 0,
          maximum: 1,
        },
        privacy: {
          type: 'string',
          enum: ['local-only', 'prefer-local', 'cloud-allowed'],
          description: 'local-only never sends task content to a cloud model.',
        },
        parallelism: {
          type: 'number',
          description: 'Maximum concurrent workers. Defaults to 2.',
          minimum: 1,
          maximum: 8,
        },
      },
      required: ['goal'],
    },
  },
  {
    name: 'leverage_status',
    description:
      'Current state of a mission: task states, hired workers, handoffs, spend and elapsed time. ' +
      'Safe to poll. Terminal states are COMPLETED, FAILED and CANCELLED; anything else is still ' +
      'running, so keep polling every few seconds.',
    inputSchema: {
      type: 'object',
      properties: { missionId: { type: 'string' } },
      required: ['missionId'],
    },
  },
  {
    name: 'leverage_cancel',
    description:
      'Stop a running mission. No further workers are hired; in-flight work is checkpointed where ' +
      'possible. A mission that has already finished is left as it is and the call fails with 409.',
    inputSchema: {
      type: 'object',
      properties: { missionId: { type: 'string' } },
      required: ['missionId'],
    },
  },
  {
    name: 'leverage_proof',
    description:
      'The evidence for a mission: every check that ran, what it returned, files changed, quality ' +
      'breakdown and actual spend. This is what makes a completed mission checkable rather than ' +
      'merely claimed. On a FAILED mission the failed checks and each failed worker are listed ' +
      'instead of a proof.',
    inputSchema: {
      type: 'object',
      properties: { missionId: { type: 'string' } },
      required: ['missionId'],
    },
  },
  {
    name: 'leverage_models',
    description:
      'The workforce Leverage can currently reach, with each model cost class, health and its ' +
      'measured track record. Success rates are shrunk toward a prior and carry a sample count.',
    inputSchema: { type: 'object', properties: {} },
  },
];

export async function dispatch(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'leverage_run': {
      const created = (await api('/api/v1/missions', {
        method: 'POST',
        body: JSON.stringify({
          goal: args.goal,
          budgetMaxUsd: args.budgetMaxUsd ?? 0,
          qualityTarget: args.qualityTarget ?? 0.95,
          privacy: args.privacy ?? 'prefer-local',
          maxWorkers: args.parallelism ?? 2,
          repositoryRoot: args.repositoryRoot,
        }),
      })) as { mission: { mission: { id: string; status: string } } };

      const missionId = created.mission.mission.id;
      await api(`/api/v1/missions/${missionId}/start`, { method: 'POST', body: '{}' });
      const status = created.mission.mission.status;

      return {
        missionId,
        status,
        note:
          status === 'PLANNING'
            ? 'Mission admitted; a planner model is writing the task graph from the repository and the mission starts as soon as the compiler accepts it. Poll leverage_status: PLANNING, then RUNNING, then COMPLETED or FAILED.'
            : 'Mission admitted and started. Poll leverage_status; call leverage_proof when it completes.',
      };
    }

    case 'leverage_status': {
      const body = (await api(`/api/v1/missions/${str(args.missionId)}`)) as {
        mission: MissionShape;
      };
      const m = body.mission;
      return {
        missionId: m.mission.id,
        status: m.mission.status,
        elapsedMs: m.mission.elapsedMs,
        tasks: m.tasks.map((t) => ({ id: t.id, title: t.title, state: t.state, attempts: t.attemptCount })),
        workers: m.workers.map((w) => ({
          role: w.role,
          model: w.displayName,
          costClass: w.costClass,
          status: w.status,
          resumedFrom: w.resumedFromCheckpointId,
        })),
        handoffs: m.checkpoints.map((c) => ({
          taskId: c.taskId,
          reason: c.reason,
          contextReductionPct: c.reductionPct,
        })),
        paidSpendUsd: m.usage.paidSpendUsd,
        blockedPaidAttempts: m.usage.blockedPaidAttempts,
      };
    }

    case 'leverage_cancel':
      return api(`/api/v1/missions/${str(args.missionId)}/cancel`, { method: 'POST', body: '{}' });

    case 'leverage_proof': {
      const body = (await api(`/api/v1/missions/${str(args.missionId)}`)) as {
        mission: MissionShape;
      };
      const m = body.mission;
      const proven = m.proofs.flatMap((p) => p.checks.map((c) => ({ taskId: p.taskId, label: c.label, status: c.status, detail: c.detail })));
      // A proof is only issued for a task that passed. What a failed task leaves
      // behind is its failed checks in the event log and the failure type on each
      // worker; a caller reasoning about a FAILED mission gets both.
      const failed = (m.events ?? [])
        .filter((e) => e.type === 'proof.check' && e.data?.status === 'fail')
        .map((e) => {
          const [label, ...rest] = e.message.split(': FAIL: ');
          return { taskId: e.taskId, label, status: 'fail', detail: rest.join(': FAIL: ') };
        });
      const failedWorkers = m.workers
        .filter((w) => w.status === 'failed')
        .map((w) => ({ taskId: w.taskId, model: w.displayName, costClass: w.costClass, failureType: w.failureType }));
      // The whole-suite run happens after every task passed and belongs to the
      // mission, not to a task. It is the check that proves the tasks did not
      // break each other, so it is listed with the rest instead of living only
      // in the event log.
      const suite = (m.events ?? [])
        .filter((e) => e.type === 'proof.check' && !e.taskId && e.data?.status === 'pass')
        .map((e) => {
          const [label, ...rest] = e.message.split(': PASS: ');
          return { taskId: 'whole-suite', label, status: 'pass', detail: rest.join(': PASS: ') };
        });
      const checks = [...proven, ...suite, ...failed];
      return {
        missionId: m.mission.id,
        status: m.mission.status,
        checks,
        checksPassed: `${checks.filter((c) => c.status === 'pass').length}/${checks.length}`,
        failedWorkers,
        filesChanged: [...new Set(m.proofs.flatMap((p) => p.filesChanged))],
        quality: m.proofs.map((p) => ({ taskId: p.taskId, score: p.qualityScore.total })),
        paidSpendUsd: m.usage.paidSpendUsd,
        estimatedFrontierEquivalentUsd: m.usage.estimatedFrontierEquivalentUsd,
        note:
          (m.mission.status === 'COMPLETED'
            ? ''
            : 'No proof is issued for a task that never passed; its failed checks and worker failure types are listed instead. ') +
          'estimatedFrontierEquivalentUsd is an estimate of what this token workload would have cost at published frontier rates. It is not a charge.',
      };
    }

    case 'leverage_models': {
      const body = (await api('/api/v1/models')) as { models: unknown[]; counts: unknown };
      return body;
    }

    default:
      throw new Error(`unknown tool: ${name}`);
  }
}

interface MissionShape {
  mission: { id: string; status: string; elapsedMs: number };
  tasks: { id: string; title: string; state: string; attemptCount: number }[];
  workers: {
    taskId?: string;
    role: string;
    displayName: string;
    costClass: string;
    status: string;
    failureType?: string;
    resumedFromCheckpointId?: string;
  }[];
  events?: { type: string; taskId?: string; message: string; data?: { status?: string } }[];
  checkpoints: { taskId: string; reason: string; reductionPct: number }[];
  proofs: {
    taskId?: string;
    checks: { label: string; status: string; detail: string }[];
    filesChanged: string[];
    qualityScore: { total: number };
  }[];
  usage: {
    paidSpendUsd: number;
    blockedPaidAttempts: number;
    estimatedFrontierEquivalentUsd: number;
  };
}

async function api(path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}),
      ...(init.headers ?? {}),
    },
    // The roster sweeps every provider before answering, which can take longer
    // than a status poll; give it the time rather than report a timeout.
    signal: AbortSignal.timeout(path.startsWith('/api/v1/models') ? 90_000 : 30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${res.status} from ${path}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : {};
}

function str(v: unknown): string {
  if (typeof v !== 'string' || !v) throw new Error('missionId must be a string like LVR-1a2b3c4d');
  // The id goes into a URL path; refuse anything that is not the id shape rather
  // than letting a crafted value traverse the API surface.
  if (!/^LVR-[A-Za-z0-9-]{1,40}$/.test(v)) throw new Error(`invalid missionId: ${v.slice(0, 40)}`);
  return v;
}

