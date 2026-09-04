import { NextResponse, type NextRequest } from 'next/server';
import { requireIdentity, AuthError } from '@/auth/identity';
import { requireWritable } from '@/auth/policy';
import { resolveApproval } from '@/server/missions';

export const dynamic = 'force-dynamic';

/**
 * Resolve a pending approval.
 *
 * `requireWritable` runs before anything is read from the body, so the read-only
 * public demo identity is refused on the way in rather than after a decision has
 * been recorded. Approval is the one place where "who did this" has to survive,
 * so the actor is taken from the verified identity and never from the request.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ missionId: string }> },
) {
  let identity;
  try {
    identity = await requireIdentity(req);
    requireWritable(identity);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { missionId } = await ctx.params;

  let body: { taskId?: unknown; resolution?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 });
  }

  const taskId = typeof body.taskId === 'string' ? body.taskId : null;
  const resolution = body.resolution === 'approved' || body.resolution === 'rejected'
    ? body.resolution
    : null;

  if (!taskId || !resolution) {
    return NextResponse.json(
      { error: 'taskId and resolution ("approved" | "rejected") are required' },
      { status: 400 },
    );
  }

  const ok = resolveApproval(missionId, identity.workspaceId, taskId, resolution, identity.userId);

  if (!ok) {
    // Either the mission is not in this workspace, or the task is not waiting.
    // Both answer 404: confirming the id exists is a free enumeration oracle, and
    // a replayed decision must be a no-op rather than a second state change.
    return NextResponse.json({ error: 'No pending approval for that task' }, { status: 404 });
  }

  return NextResponse.json({ ok: true, taskId, resolution, actor: identity.userId });
}
