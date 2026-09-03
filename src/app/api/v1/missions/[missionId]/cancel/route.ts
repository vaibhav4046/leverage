import { NextResponse, type NextRequest } from 'next/server';
import { cancelMission } from '@/server/missions';
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
  const ok = cancelMission(missionId, identity.workspaceId);
  if (!ok) return NextResponse.json({ error: 'mission not found' }, { status: 404 });

  return NextResponse.json({ cancelled: true });
}
