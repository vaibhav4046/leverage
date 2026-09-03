import { NextResponse, type NextRequest } from 'next/server';
import { startMission } from '@/server/missions';
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
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const result = await startMission(missionId, identity.workspaceId, {
    injectFailure: body.injectFailure === true,
  });

  if (!result.started) {
    return NextResponse.json(
      { error: result.reason },
      { status: result.reason === 'not found' ? 404 : 409 },
    );
  }
  return NextResponse.json({ started: true });
}
