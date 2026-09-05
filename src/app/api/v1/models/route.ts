import { NextResponse, type NextRequest } from 'next/server';
import { getRegistry, getReputation } from '@/server/missions';
import { requireIdentity, AuthError } from '@/auth/identity';

export const dynamic = 'force-dynamic';

/** The hireable workforce, with whatever reputation each model has actually earned. */
export async function GET(req: NextRequest) {
  try {
    await requireIdentity(req);
  } catch (err) {
    const e = err as AuthError;
    return NextResponse.json({ error: e.message }, { status: e.status ?? 401 });
  }

  const registry = getRegistry();
  // Stale while revalidating: a roster that has been swept before is served from
  // the cache and refreshed behind the answer. Only a cold instance waits, since
  // it has nothing to serve yet. Probing every provider can take a minute when a
  // CLI seat or a hosted route is slow, and a tool described as safe to poll
  // must not take that long to answer.
  if (registry.hasSwept) void registry.sweep();
  else await registry.sweep();
  const reputation = await getReputation();

  const models = registry.allModels().map((m) => {
    const rep = reputation.reputationFor(m.key);
    return {
      key: m.key,
      displayName: m.displayName,
      provider: m.providerId,
      costClass: m.costClass,
      contextTokens: m.contextTokens,
      capabilities: m.capabilities,
      supportsTools: m.supportsTools,
      health: registry.healthFor(m.providerId).status,
      reputation: rep
        ? {
            samples: rep.samples,
            verifiedSuccesses: rep.verifiedSuccesses,
            successRate: Number(rep.successRate.toFixed(3)),
            medianLatencyMs: rep.medianLatencyMs,
            confidence: rep.confidence,
          }
        : null,
    };
  });

  return NextResponse.json({ models, counts: registry.countsByCostClass() });
}
