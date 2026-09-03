import { NextResponse, type NextRequest } from 'next/server';
import { getMissionSnapshot } from '@/server/missions';
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
  // Same lookup the page uses, so a mission the UI can render is never one the API
  // reports as missing — this previously read live memory only, and returned 404
  // for every completed run recovered from disk.
  const snapshot = await getMissionSnapshot(missionId, identity.workspaceId);

  // A mission belonging to another workspace is reported as absent rather than
  // forbidden. A 403 would confirm the id exists, which is a free enumeration
  // oracle for anyone guessing mission ids.
  if (!snapshot) return NextResponse.json({ error: 'mission not found' }, { status: 404 });

  return NextResponse.json({ mission: snapshot });
}
