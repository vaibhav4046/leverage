import { NextResponse, type NextRequest } from 'next/server';
import { createMission, listMissions } from '@/server/missions';
import { requireIdentity, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

const MAX_GOAL_CHARS = 8000;

/** Missions in the caller's workspace. Tenancy comes from the identity, never the URL. */
export async function GET(req: NextRequest) {
  try {
    const id = await requireIdentity(req);
    return NextResponse.json({ missions: listMissions(id.workspaceId) });
  } catch (err) {
    return authFail(err);
  }
}

export async function POST(req: NextRequest) {
  let identity;
  try {
    identity = await requireIdentity(req);
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

  try {
    const mission = await createMission({
      goal,
      workspaceId: identity.workspaceId,
      userId: identity.userId,
      budgetMaxUsd: typeof budget === 'number' ? budget : undefined,
      qualityTarget: typeof body.qualityTarget === 'number' ? body.qualityTarget : undefined,
      privacy: privacy as 'local-only' | 'prefer-local' | 'cloud-allowed' | undefined,
      maxWorkers: typeof body.maxWorkers === 'number' ? body.maxWorkers : undefined,
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
