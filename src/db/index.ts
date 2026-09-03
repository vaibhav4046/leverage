import 'server-only';
import { FileMissionRepository } from './memory';
import type { MissionRepository } from './types';

export type { MissionRepository } from './types';
export { FileMissionRepository } from './memory';

/**
 * Repository selection.
 *
 * One decision, made once, from configuration. Everything above this file receives a
 * `MissionRepository` and cannot tell which one it got — which is the property the
 * architecture claims, so it is worth keeping the choice this small.
 *
 * Supabase is loaded lazily. It is `server-only` and pulls in a client library, and
 * a deployment with no database configured should not pay for either.
 */
let repository: MissionRepository | null = null;

export function getRepository(): MissionRepository {
  if (repository) return repository;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (url && secret) {
    // Required synchronously so callers keep a plain interface rather than a promise.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SupabaseMissionRepository } = require('./supabase') as typeof import('./supabase');
    repository = new SupabaseMissionRepository(url, secret);
  } else {
    repository = new FileMissionRepository();
  }

  return repository;
}

/** Test seam: forget the cached choice so a test can vary the environment. */
export function resetRepository(): void {
  repository = null;
}
