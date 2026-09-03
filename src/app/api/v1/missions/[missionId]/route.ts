import { NextResponse, type NextRequest } from 'next/server';
import { getMission } from '@/server/missions';
import { snapshotMission } from '@/core/mission';
import { requireIdentity, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: { params: Promise<{ missionId: string }> }) {
  let identity;
  try {
    identity = await requireIdentity(req);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  const { missionId } = await ctx.params;
  const state = getMission(missionId, identity.workspaceId);

  // A mission belonging to another workspace is reported as absent rather than
  // forbidden. A 403 would confirm the id exists, which is a free enumeration
  // oracle for anyone guessing mission ids.
  if (!state) return NextResponse.json({ error: 'mission not found' }, { status: 404 });

  return NextResponse.json({ mission: snapshotMission(state) });
}
