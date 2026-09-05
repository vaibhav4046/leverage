import { NextResponse, type NextRequest } from 'next/server';
import { createMission, listMissions, loadPersistedRuns } from '@/server/missions';
import { requireIdentity, requireWritable, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

const MAX_GOAL_CHARS = 8000;

/** Missions in the caller's workspace. Tenancy comes from the identity, never the URL. */
export async function GET(req: NextRequest) {
  try {
    const id = await requireIdentity(req);
    // Live missions plus completed ones recovered from disk (or, in the public
    // demo, the recorded runs it is seeded with) — the same union the app page
    // renders, so the API and the UI cannot disagree about what exists.
    const live = listMissions(id.workspaceId);
    const seen = new Set(live.map((m) => m.mission.id));
    const persisted = (await loadPersistedRuns(id.workspaceId)).filter(
      (m) => !seen.has(m.mission.id),
    );
    return NextResponse.json({ missions: [...live, ...persisted] });
  } catch (err) {
    return authFail(err);
  }
}

export async function POST(req: NextRequest) {
  let identity;
  try {
    identity = await requireIdentity(req);
    requireWritable(identity);
  } catch (err) {
    return authFail(err);
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const goal = typeof body.goal === 'string' ? body.goal.trim() : '';
  if (goal.length < 8) {
    return NextResponse.json({ error: 'goal must be at least 8 characters' }, { status: 400 });
  }
  if (goal.length > MAX_GOAL_CHARS) {
    return NextResponse.json(
      { error: `goal exceeds ${MAX_GOAL_CHARS} characters` },
      { status: 400 },
    );
  }

  const privacy = body.privacy;
  if (
    privacy !== undefined &&
    !['local-only', 'prefer-local', 'cloud-allowed'].includes(String(privacy))
  ) {
    return NextResponse.json({ error: 'invalid privacy mode' }, { status: 400 });
  }

  const budget = body.budgetMaxUsd;
  if (budget !== undefined && (typeof budget !== 'number' || budget < 0 || budget > 1000)) {
    return NextResponse.json({ error: 'budgetMaxUsd must be between 0 and 1000' }, { status: 400 });
  }

  const maxWorkers = body.maxWorkers;
  if (
    maxWorkers !== undefined &&
    (!Number.isInteger(maxWorkers) || (maxWorkers as number) < 1 || (maxWorkers as number) > 8)
  ) {
    return NextResponse.json({ error: 'maxWorkers must be an integer between 1 and 8' }, { status: 400 });
  }

  try {
    const mission = await createMission({
      goal,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      budgetMaxUsd: typeof budget === 'number' ? budget : undefined,
      qualityTarget: typeof body.qualityTarget === 'number' ? body.qualityTarget : undefined,
      privacy: privacy as 'local-only' | 'prefer-local' | 'cloud-allowed' | undefined,
      maxWorkers: typeof body.maxWorkers === 'number' ? body.maxWorkers : undefined,
      // An absolute path on the machine running Leverage. With it, a planner model
      // turns the goal into tasks for that repository; without it, the bundled
      // benchmark runs its committed plan.
      repositoryRoot: typeof body.repositoryRoot === 'string' && body.repositoryRoot.trim() ? body.repositoryRoot.trim() : undefined,
      idempotencyKey: req.headers.get('idempotency-key') ?? undefined,
    });
    return NextResponse.json({ mission }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

function authFail(err: unknown) {
  const e = err as AuthError;
  return NextResponse.json({ error: e.message ?? 'unauthorized' }, { status: e.status ?? 401 });
}
