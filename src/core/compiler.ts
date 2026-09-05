import { randomUUID } from 'node:crypto';
import type {
  Capability,
  CapabilityRequirement,
  MissionSpec,
  MissionTask,
  PrivacyMode,
  Risk,
  TaskCategory,
  VerificationCheckSpec,
} from './types';
import { validateDag } from './dag';

/**
 * Mission compiler.
 *
 * Two stages, deliberately separated:
 *
 *   1. `compileMissionSpec` — parse the human's sentence into an explicit,
 *      validated MissionSpec. This is pure string work with no model call, because
 *      budget and privacy are policy and policy must not depend on an LLM's mood.
 *
 *   2. `parseTaskPlan` — take a planner model's proposed task graph and refuse it
 *      unless it is structurally sound. A planner is untrusted: it can hallucinate
 *      a cycle, a dangling dependency or a file scope outside the repository, and
 *      all three have to be caught before anything executes.
 */

// ---------------------------------------------------------------------------
// Stage 1 — the human sentence
// ---------------------------------------------------------------------------

export interface CompileMissionArgs {
  goal: string;
  workspaceId: string;
  createdBy: string;
  repositoryRoot?: string;
  repositoryLabel?: string;
  /** Explicit UI settings win over anything inferred from the text. */
  overrides?: Partial<{
    budgetMaxUsd: number;
    budgetHard: boolean;
    qualityTarget: number;
    privacy: PrivacyMode;
    maxWorkers: number;
    deadlineSeconds: number;
  }>;
}

export function compileMissionSpec(args: CompileMissionArgs): MissionSpec {
  const text = args.goal;
  const o = args.overrides ?? {};

  const inferredBudget = inferBudget(text);
  const inferredQuality = inferQuality(text);
  const inferredPrivacy = inferPrivacy(text);

  const maxUsd = o.budgetMaxUsd ?? inferredBudget.maxUsd;

  const spec: MissionSpec = {
    id: `LVR-${randomUUID().slice(0, 8)}`,
    workspaceId: args.workspaceId,
    createdBy: args.createdBy,
    goal: text.trim(),
    repository: args.repositoryRoot
      ? { root: args.repositoryRoot, label: args.repositoryLabel ?? 'workspace' }
      : undefined,
    constraints: extractConstraints(text),
    budget: {
      maxUsd,
      // A zero budget is always hard. "Budget $0, but spend a little if you must"
      // is not a coherent instruction and we will not implement it as one.
      hard: maxUsd <= 0 ? true : (o.budgetHard ?? inferredBudget.hard),
    },
    quality: { target: o.qualityTarget ?? inferredQuality },
    privacy: { mode: o.privacy ?? inferredPrivacy },
    parallelism: o.maxWorkers
      ? { mode: 'fixed', maxWorkers: o.maxWorkers }
      : { mode: 'auto' },
    deadlineAt: o.deadlineSeconds
      ? new Date(Date.now() + o.deadlineSeconds * 1000).toISOString()
      : undefined,
    createdAt: new Date().toISOString(),
  };

  validateMissionSpec(spec);
  return spec;
}

export function validateMissionSpec(spec: MissionSpec): void {
  if (!spec.goal || spec.goal.trim().length < 8) {
    throw new Error('Mission goal is too short to compile into a plan');
  }
  if (spec.goal.length > 8000) {
    throw new Error('Mission goal exceeds 8000 characters');
  }
  if (!Number.isFinite(spec.budget.maxUsd) || spec.budget.maxUsd < 0) {
    throw new Error('Mission budget must be a non-negative number');
  }
  if (spec.quality.target < 0 || spec.quality.target > 1) {
    throw new Error('Quality target must be between 0 and 1');
  }
}

function inferBudget(text: string): { maxUsd: number; hard: boolean } {
  const t = text.toLowerCase();
  if (/\b(zero[- ]dollar|budget[:\s]*\$?0\b|\$0\b|no (paid|spend|cost)|free only)/.test(t)) {
    return { maxUsd: 0, hard: true };
  }
  const explicit = /budget[:\s]*\$?([0-9]+(?:\.[0-9]+)?)/.exec(t);
  if (explicit) return { maxUsd: Number(explicit[1]), hard: true };
  // Default to zero. A system that can spend money should require you to say so.
  return { maxUsd: 0, hard: true };
}

function inferQuality(text: string): number {
  const t = text.toLowerCase();
  if (/\bcritical\b/.test(t)) return 0.98;
  if (/\bproduction\b/.test(t)) return 0.95;
  if (/\b(draft|quick|rough|prototype)\b/.test(t)) return 0.8;
  return 0.9;
}

function inferPrivacy(text: string): PrivacyMode {
  const t = text.toLowerCase();
  if (/\b(local[- ]only|air[- ]?gapped|do not send.*cloud|on[- ]prem)\b/.test(t)) return 'local-only';
  if (/\bcloud[- ]allowed\b/.test(t)) return 'cloud-allowed';
  return 'prefer-local';
}

/**
 * Pull out imperative constraints so they survive into every worker's context.
 * "Do not change the auth library" must reach the worker that touches auth, not
 * just the planner that read the sentence once.
 */
function extractConstraints(text: string): string[] {
  const constraints: string[] = [];
  const patterns = [
    /\b(?:do not|don't|never|avoid)\s+([^.!?\n]{4,160})/gi,
    /\b(?:must|always|ensure(?: that)?|keep)\s+([^.!?\n]{4,160})/gi,
    /\b(?:preserve|maintain)\s+([^.!?\n]{4,160})/gi,
  ];
  for (const p of patterns) {
    for (const m of text.matchAll(p)) {
      const phrase = `${m[0].trim().replace(/\s+/g, ' ')}`;
      if (!constraints.includes(phrase)) constraints.push(phrase);
    }
  }
  return constraints.slice(0, 12);
}

// ---------------------------------------------------------------------------
// Stage 2 — the planner's proposed graph
// ---------------------------------------------------------------------------

/** What we ask a planner model to return. Kept small; planners over-produce. */
export const PLANNER_OUTPUT_CONTRACT = `Return a single JSON object and nothing else:
{"tasks":[{
  "id":"kebab-case-id",
  "title":"short imperative title",
  "description":"what to do, concretely",
  "category":"architecture|backend|frontend|tests|security|docs|research|integration|verification",
  "dependencies":["other-task-id"],
  "capabilities":["code","reasoning","tests","frontend","backend","security","docs"],
  "risk":"low|medium|high|critical",
  "fileScope":["relative/path.ts"],
  "referenceFiles":["test/it.test.ts"],
  "acceptance":["a checkable statement"]
}]}
Rules: 3-8 tasks. Dependencies must reference ids in this list. No cycles.
fileScope paths are relative to the repository root and must not contain "..".
Every task needs at least one fileScope path; a task with nothing to verify is rejected.`;

/** What the planner proposed for one task, as the check-builder sees it. */
export interface PlannedTaskShape {
  id: string;
  category: TaskCategory;
  fileScope: string[];
  referenceFiles: string[];
  /** The verify command the planner named, unvalidated. */
  verify?: unknown;
}

interface RawTask {
  verify?: unknown;
  id?: unknown;
  title?: unknown;
  description?: unknown;
  category?: unknown;
  dependencies?: unknown;
  capabilities?: unknown;
  risk?: unknown;
  fileScope?: unknown;
  referenceFiles?: unknown;
  acceptance?: unknown;
}

export class PlanRejectedError extends Error {
  constructor(
    message: string,
    readonly raw: string,
  ) {
    super(message);
    this.name = 'PlanRejectedError';
  }
}

/**
 * Parse and harden a planner's output into an executable graph.
 *
 * Everything here is a refusal path. The planner is a model; its output is a
 * proposal, not a plan, until it survives this function.
 */
export function parseTaskPlan(
  raw: string,
  mission: MissionSpec,
  defaultChecks: (task: PlannedTaskShape) => VerificationCheckSpec[],
): MissionTask[] {
  const objText = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(objText);
  } catch (err) {
    throw new PlanRejectedError(`planner output was not valid JSON: ${(err as Error).message}`, raw);
  }

  const rawTasks = (parsed as { tasks?: unknown }).tasks;
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    throw new PlanRejectedError('planner returned no tasks', raw);
  }
  if (rawTasks.length > 12) {
    throw new PlanRejectedError(`planner returned ${rawTasks.length} tasks; limit is 12`, raw);
  }

  const now = new Date().toISOString();
  const seenIds = new Set<string>();

  const tasks: MissionTask[] = (rawTasks as RawTask[]).map((rt, index) => {
    const id = slug(str(rt.id) || str(rt.title) || `task-${index + 1}`);
    if (seenIds.has(id)) throw new PlanRejectedError(`duplicate task id: ${id}`, raw);
    seenIds.add(id);

    const category = asCategory(str(rt.category));
    const fileScope = asStringArray(rt.fileScope)
      .filter((p) => !p.includes('..') && !p.startsWith('/') && !/^[a-zA-Z]:/.test(p))
      .slice(0, 12);

    const referenceFiles = asStringArray(rt.referenceFiles)
      .filter((f) => !f.includes('..') && !f.startsWith('/') && !/^[a-zA-Z]:/.test(f))
      .slice(0, 8);

    // A task nothing can prove done is not a task, it is a hope. Refuse it here
    // rather than let the verification gate meet an empty list downstream. The
    // callback sees the whole proposal for the task, including the check the
    // planner named, so it can accept, replace or refuse it.
    const checks = defaultChecks({ id, category, fileScope, referenceFiles, verify: rt.verify });
    if (checks.length === 0) {
      throw new PlanRejectedError(
        `task "${id}" has no verification checks: give it a fileScope or a test command so something can prove it done`,
        raw,
      );
    }

    return {
      id,
      missionId: mission.id,
      title: str(rt.title) || `Task ${index + 1}`,
      description: str(rt.description) || str(rt.title) || '',
      category,
      dependencies: asStringArray(rt.dependencies).map(slug),
      requiredCapabilities: asCapabilities(rt.capabilities, category),
      risk: asRisk(str(rt.risk)),
      qualityTarget: mission.quality.target,
      budgetUsd: mission.budget.maxUsd,
      fileScope,
      referenceFiles,
      verification: {
        checks,
        acceptance: asStringArray(rt.acceptance).slice(0, 8),
      },
      state: 'PENDING',
      attemptCount: 0,
      createdAt: now,
      updatedAt: now,
    };
  });

  // Drop edges to ids the planner invented, rather than failing the whole plan for
  // one bad reference. A dangling edge is a typo; a cycle is a broken plan.
  const ids = new Set(tasks.map((t) => t.id));
  for (const task of tasks) {
    task.dependencies = task.dependencies.filter((d) => ids.has(d) && d !== task.id);
  }

  validateDag(tasks); // throws DagError on a cycle
  return tasks;
}

export function extractJsonObject(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new PlanRejectedError('no JSON object found in planner output', raw);
  }
  return body.slice(start, end + 1);
}

const CATEGORIES: TaskCategory[] = [
  'architecture',
  'backend',
  'frontend',
  'tests',
  'security',
  'docs',
  'research',
  'integration',
  'verification',
];

const CAPABILITIES: Capability[] = [
  'code',
  'reasoning',
  'tests',
  'frontend',
  'backend',
  'security',
  'docs',
  'long-context',
  'tools',
];

/** Sensible capability demand per category, used when the planner omits them. */
const CATEGORY_DEFAULT_CAPS: Record<TaskCategory, Capability[]> = {
  architecture: ['reasoning', 'code'],
  backend: ['code', 'backend'],
  frontend: ['code', 'frontend'],
  tests: ['tests', 'code'],
  security: ['security', 'reasoning'],
  docs: ['docs'],
  research: ['reasoning'],
  integration: ['code', 'reasoning'],
  verification: ['tests', 'reasoning'],
};

function asCategory(v: string): TaskCategory {
  const t = v.toLowerCase() as TaskCategory;
  return CATEGORIES.includes(t) ? t : 'backend';
}

function asRisk(v: string): Risk {
  const t = v.toLowerCase();
  return t === 'low' || t === 'medium' || t === 'high' || t === 'critical' ? t : 'medium';
}

function asCapabilities(v: unknown, category: TaskCategory): CapabilityRequirement[] {
  const listed = asStringArray(v)
    .map((s) => s.toLowerCase())
    .filter((s): s is Capability => CAPABILITIES.includes(s as Capability));

  const caps = listed.length ? listed : CATEGORY_DEFAULT_CAPS[category];
  // First capability listed is treated as primary and weighted accordingly.
  return caps.slice(0, 5).map((capability, i) => ({
    capability,
    weight: i === 0 ? 1 : Math.max(0.3, 1 - i * 0.2),
  }));
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((s) => s.trim()) : [];
}

function slug(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'task'
  );
}
