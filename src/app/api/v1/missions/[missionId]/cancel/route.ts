import { NextResponse, type NextRequest } from 'next/server';
import { cancelMission, getMission, getMissionSnapshot } from '@/server/missions';
import { requireIdentity, requireWritable, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: { params: Promise<{ missionId: string }> }) {
  let identity;
  try {
    identity = await requireIdentity(req);
    requireWritable(identity);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  const { missionId } = await ctx.params;
  const result = cancelMission(missionId, identity.workspaceId);
  // A mission that only exists as a recorded snapshot is finished by definition.
  const recorded =
    result === 'not-found' ? await getMissionSnapshot(missionId, identity.workspaceId) : null;
  if (result === 'not-found' && !recorded) {
    return NextResponse.json({ error: 'mission not found' }, { status: 404 });
  }
  if (result === 'finished' || recorded) {
    const status = getMission(missionId, identity.workspaceId)?.status ?? recorded?.mission.status ?? 'finished';
    return NextResponse.json(
      { error: `mission already finished (${status}); nothing to cancel`, cancelled: false, status },
      { status: 409 },
    );
  }

  return NextResponse.json({ cancelled: true });
}
