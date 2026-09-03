import type { MissionSnapshot } from '../core/mission';

/**
 * The persistence boundary.
 *
 * Everything above this interface deals in whole mission snapshots and workspace
 * ids. Nothing above it knows whether a run lives in a JSON file or in Postgres,
 * which is the only reason swapping the implementation is a configuration change
 * rather than a rewrite.
 *
 * Every method takes the workspace id first and it is not optional. A repository
 * method that could be called without a tenant is a tenancy bug waiting for its
 * first careless caller — this file makes that shape impossible to express.
 */
export interface MissionRepository {
  /** Human-readable name for the health endpoint and the providers page. */
  readonly kind: 'memory' | 'supabase';

  /** Write a snapshot. Overwrites the previous state of the same mission. */
  save(workspaceId: string, snapshot: MissionSnapshot): Promise<void>;

  /** One mission, or null when it does not exist *in this workspace*. */
  get(workspaceId: string, missionId: string): Promise<MissionSnapshot | null>;

  /** Every persisted mission in the workspace, newest first. */
  list(workspaceId: string): Promise<MissionSnapshot[]>;
}

/**
 * Workspace and mission ids reach the filesystem and SQL as path and key segments,
 * so they are validated once, here, rather than at each call site.
 */
export const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const SAFE_MISSION_ID = /^LVR-[A-Za-z0-9-]{1,40}$/;

export function isSafeWorkspaceId(id: string): boolean {
  return SAFE_ID.test(id);
}

export function isSafeMissionId(id: string): boolean {
  return SAFE_MISSION_ID.test(id);
}
