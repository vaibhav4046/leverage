import { NextResponse } from 'next/server';
import { getExecutor, getRegistry } from '@/server/missions';
import { authConfigured, authMode } from '@/auth/identity';

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

  return NextResponse.json({
    status: anyModels && rocketride.ok ? 'ok' : 'degraded',
    services: {
      rocketride: rocketride.ok ? 'ok' : 'unavailable',
      providers,
      models: registry.allModels().length,
      auth: authConfigured() ? 'configured' : authMode(),
    },
    // Real value or nothing. A guessed credit balance is worse than no balance.
    rocketrideCredits: credits ?? 'unavailable',
  });
}
