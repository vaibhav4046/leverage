/**
 * Authorization rules, with no request in them.
 *
 * Kept apart from `identity.ts` because that module is `server-only` and binds to a
 * `NextRequest`, which makes it unimportable from a plain test. The rules that
 * decide what an identity may do are pure, and pure rules that cannot be tested
 * tend to become rules that are not enforced.
 */

export interface Identity {
  userId: string;
  workspaceId: string;
  displayName: string;
  /** True when this came from a verified Privy token rather than dev or demo mode. */
  verified: boolean;
  /**
   * True when this identity may read but never mutate. The public demo uses it so a
   * deployed instance can be explored without letting a stranger spend the owner's
   * inference budget.
   */
  readOnly: boolean;
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

/**
 * Refuse a mutation from a read-only identity.
 *
 * Called by every route that changes state. A read-only identity that could still
 * POST would be a demo in name only.
 */
export function requireWritable(identity: Identity): void {
  if (identity.readOnly) {
    throw new AuthError(
      'This is a read-only public demo. Run Leverage locally to execute a mission.',
      403,
    );
  }
}
