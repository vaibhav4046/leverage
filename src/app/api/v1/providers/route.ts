import { NextResponse, type NextRequest } from 'next/server';
import { getExecutor, getRegistry } from '@/server/missions';
import { requireIdentity, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireIdentity(req);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  const registry = getRegistry();
  await registry.sweep(true);
  const rr = await getExecutor().health();
  const credits = await getExecutor().credits();

  return NextResponse.json({
    providers: [
      ...registry.list().map((p) => ({
        id: p.adapter.providerId,
        label: p.label,
        costClass: p.adapter.costClass,
        status: p.health.status,
        checkedAt: p.health.checkedAt,
        models: p.models.length,
        // Where the credential came from, never the credential.
        credentialSource: p.adapter.costClass === 'local' ? 'none required' : 'server environment',
        detail: p.health.detail ?? p.lastDiscoveryError,
      })),
      {
        id: 'rocketride',
        label: 'RocketRide (execution fabric)',
        costClass: 'free' as const,
        status: rr.ok ? 'HEALTHY' : 'UNAVAILABLE',
        checkedAt: new Date().toISOString(),
        models: 0,
        credentialSource: 'server environment',
        detail: rr.ok ? `org ${rr.orgId?.slice(0, 8)}...` : rr.detail,
        credits: credits ?? 'unavailable',
      },
    ],
  });
}
