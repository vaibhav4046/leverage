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

export interface Identity {
  userId: string;
  workspaceId: string;
  displayName: string;
  /** True when this came from a verified Privy token rather than dev mode. */
  verified: boolean;
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: 401 | 403 | 500 = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

const isProduction = process.env.NODE_ENV === 'production';
const devAuthEnabled = process.env.LEVERAGE_DEV_AUTH === '1';
const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
const privyAppSecret = process.env.PRIVY_APP_SECRET;

export function authConfigured(): boolean {
  return Boolean(privyAppId && privyAppSecret);
}

export async function requireIdentity(req: NextRequest): Promise<Identity> {
  if (authConfigured()) {
    return verifyPrivy(req);
  }

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

  return {
    userId: 'dev-user',
    workspaceId: 'ws_local',
    displayName: 'Local developer',
    verified: false,
  };
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
  };
}
