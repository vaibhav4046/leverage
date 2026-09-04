import { NextResponse } from 'next/server';
import { getExecutor, getRegistry } from '@/server/missions';
import { authConfigured, authMode } from '@/auth/identity';
import { getRepository } from '@/db';

export const dynamic = 'force-dynamic';

/**
 * Liveness plus a shallow dependency check.
 *
 * Reports statuses, never configuration values: an unauthenticated health endpoint
 * that names your hosts is reconnaissance.
 */
export async function GET() {
  const registry = getRegistry();
  await registry.sweep();

  const rocketride = await getExecutor().health();
  const credits = await getExecutor().credits();

  const providers = Object.fromEntries(
    registry.list().map((p) => [p.adapter.providerId, p.health.status]),
  );

  const anyModels = registry.allModels().length > 0;

  // Is the cloud execution path actually usable right now?
  //
  // RocketRide runs workers in its own cloud, so a pool bound to localhost makes
  // every cloud worker fail with an opaque LLM error while the pipeline still
  // runs and bills. That failure looked identical to a healthy system from here,
  // which is exactly why it survived a whole pass unnoticed. Report the shape of
  // the address, never the address itself.
  const poolUrl = process.env.OMNIROUTE_BASE_URL ?? '';
  const poolPubliclyReachable = /^https:\/\//.test(poolUrl) && !/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])/.test(poolUrl);
  const cloudWorkerPath = !rocketride.ok
    ? 'rocketride-unavailable'
    : poolPubliclyReachable
      ? 'ready'
      : 'pool-not-publicly-reachable';

  return NextResponse.json({
    status: anyModels && rocketride.ok ? 'ok' : 'degraded',
    services: {
      rocketride: rocketride.ok ? 'ok' : 'unavailable',
      providers,
      models: registry.allModels().length,
      auth: authConfigured() ? 'configured' : authMode(),
      persistence: getRepository().kind,
      /**
       * Whether a RocketRide worker could actually produce output, as opposed to
       * whether RocketRide answers. Those are different questions and only the
       * second one used to be asked.
       */
      cloudWorkerPath,
    },
    // Real value or nothing. A guessed credit balance is worse than no balance.
    rocketrideCredits: credits ?? 'unavailable',
  });
}
