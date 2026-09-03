import 'server-only';
import type { NextRequest } from 'next/server';

/**
 * Identity.
 *
 * Privy is the intended provider. The rule that matters is that the server
 * *verifies* the access token rather than decoding it — a decoded JWT is a claim,
 * not an authentication, and trusting one is the difference between an auth system
 * and a suggestion box.
 *
 * No Privy app credentials exist in this environment (see
 * BLOCKERS_REQUIRING_HUMAN.md), so a dev identity is used instead. It is gated
 * behind an explicit env flag and **refuses to run in production** — a deployment
 * that forgets to configure Privy fails loudly at the first authenticated request
 * instead of quietly serving everyone the same workspace.
 */

import { AuthError, type Identity } from './policy';

export { AuthError, requireWritable, type Identity } from './policy';

const isProduction = process.env.NODE_ENV === 'production';
const devAuthEnabled = process.env.LEVERAGE_DEV_AUTH === '1';
/**
 * The public demo identity.
 *
 * Distinct from dev auth on purpose. Dev auth is a convenience that must never
 * reach production, so it stays fatal there. This one is a deliberate deployment
 * choice: it is opt-in per environment, it is read-only, and it is labelled as
 * unverified everywhere it surfaces — so it can be permitted in production without
 * the failure mode dev auth has, which is silently serving everyone one workspace
 * that they can also write to.
 */
const publicDemoEnabled = process.env.LEVERAGE_PUBLIC_DEMO === '1';

export const DEMO_WORKSPACE_ID = 'ws_demo';

const DEMO_IDENTITY: Identity = {
  userId: 'public-demo',
  workspaceId: DEMO_WORKSPACE_ID,
  displayName: 'Public demo',
  verified: false,
  readOnly: true,
};

const DEV_IDENTITY: Identity = {
  userId: 'dev-user',
  workspaceId: 'ws_local',
  displayName: 'Local developer',
  verified: false,
  readOnly: false,
};

export type AuthMode = 'privy' | 'public-demo' | 'dev' | 'unconfigured';

export function authMode(): AuthMode {
  if (authConfigured()) return 'privy';
  if (publicDemoEnabled) return 'public-demo';
  if (!isProduction && devAuthEnabled) return 'dev';
  return 'unconfigured';
}
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const privyAppSecret = process.env.PRIVY_APP_SECRET;

export function authConfigured(): boolean {
  return Boolean(privyAppId && privyAppSecret);
}

export async function requireIdentity(req: NextRequest): Promise<Identity> {
  if (authConfigured()) {
    return verifyPrivy(req);
  }

  if (publicDemoEnabled) return DEMO_IDENTITY;

  if (isProduction) {
    // Deliberately fatal. Shipping dev identity to production would be the single
    // worst bug in this codebase, so it is impossible rather than discouraged.
    throw new AuthError(
      'Authentication is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.',
      500,
    );
  }

  if (!devAuthEnabled) {
    throw new AuthError('Authentication is not configured and dev auth is disabled', 401);
  }

  return DEV_IDENTITY;
}

/**
 * Identity for a server component.
 *
 * Pages are reached by document navigation, which carries no Authorization header,
 * so a page cannot verify a Privy token the way a route handler can. Until a Privy
 * session cookie exists, a page under Privy is treated as unauthenticated rather
 * than being handed someone else's workspace — the previous code hardcoded a
 * workspace id here, which made the tenancy checks below it decorative.
 */
export function getPageIdentity(): Identity | null {
  switch (authMode()) {
    case 'public-demo':
      return DEMO_IDENTITY;
    case 'dev':
      return DEV_IDENTITY;
    default:
      return null;
  }
}

/**
 * Verify a Privy access token server-side.
 *
 * `@privy-io/server-auth` is imported lazily so the package is only required when
 * Privy is actually configured — the app must run without it while the credentials
 * are still a blocker.
 */
async function verifyPrivy(req: NextRequest): Promise<Identity> {
  const header = req.headers.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies.get('privy-token')?.value;
  if (!token) throw new AuthError('Missing Privy access token');

  let claims: { userId: string };
  try {
    // Resolved at runtime so the app builds and runs before the Privy package is
    // installed. Once credentials exist, `npm i @privy-io/server-auth` is the only
    // remaining step.
    const mod = (await import(
      /* webpackIgnore: true */ '@privy-io/server-auth' as string
    )) as unknown as {
      PrivyClient: new (
        appId: string,
        appSecret: string,
      ) => { verifyAuthToken(token: string, key?: string): Promise<{ userId: string }> };
    };
    const { PrivyClient } = mod;
    const client = new PrivyClient(privyAppId!, privyAppSecret!);
    claims = await client.verifyAuthToken(token, process.env.PRIVY_VERIFICATION_KEY);
  } catch (err) {
    throw new AuthError(`Token verification failed: ${(err as Error).message}`, 401);
  }

  return {
    userId: claims.userId,
    // One personal workspace per identity for now. Membership lookup lands with
    // the Supabase repository; the shape here does not change.
    workspaceId: `ws_${claims.userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 24)}`,
    displayName: claims.userId,
    verified: true,
    readOnly: false,
  };
}
