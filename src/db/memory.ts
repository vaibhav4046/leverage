import fs from 'node:fs/promises';
import path from 'node:path';
import type { MissionSnapshot } from '../core/mission';
import { isSafeMissionId, isSafeWorkspaceId, type MissionRepository } from './types';

/**
 * Filesystem repository: a JSON snapshot per mission, one directory per workspace.
 *
 * This is what runs when no database is configured. It is not a stub — it is the
 * implementation the recorded runs were produced with, and it is why a completed
 * mission survives a restart and can still be opened and shared.
 *
 * The directory-per-workspace layout is doing security work, not filing. A mission
 * snapshot carries no workspace id inside it, so a flat directory would give the
 * read path nothing to check a tenant against; it would happily return any mission
 * to any caller who guessed an id. Scoping by directory makes the check structural:
 * a caller can only name a path inside its own workspace, so there is no check for
 * a future route to forget.
 */
export class FileMissionRepository implements MissionRepository {
  readonly kind = 'memory' as const;

  constructor(private readonly runsDir: string = path.resolve('.leverage-state', 'runs')) {}

  private dirFor(workspaceId: string): string | null {
    if (!isSafeWorkspaceId(workspaceId)) return null;
    return path.join(this.runsDir, workspaceId);
  }

  async save(workspaceId: string, snapshot: MissionSnapshot): Promise<void> {
    const dir = this.dirFor(workspaceId);
    if (!dir || !isSafeMissionId(snapshot.mission.id)) return;
    try {
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(
        path.join(dir, `${snapshot.mission.id}.json`),
        JSON.stringify(snapshot, null, 2),
      );
    } catch {
      // Persistence is a convenience here; losing it must never fail a live mission.
    }
  }

  async get(workspaceId: string, missionId: string): Promise<MissionSnapshot | null> {
    const dir = this.dirFor(workspaceId);
    if (!dir || !isSafeMissionId(missionId)) return null;
    try {
      const raw = await fs.readFile(path.join(dir, `${missionId}.json`), 'utf8');
      return JSON.parse(raw) as MissionSnapshot;
    } catch {
      return null;
    }
  }

  async list(workspaceId: string): Promise<MissionSnapshot[]> {
    const dir = this.dirFor(workspaceId);
    if (!dir) return [];
    try {
      const files = await fs.readdir(dir);
      const runs = await Promise.all(
        files
          .filter((f) => f.endsWith('.json'))
          .map(async (f) => {
            try {
              return JSON.parse(await fs.readFile(path.join(dir, f), 'utf8')) as MissionSnapshot;
            } catch {
              // One corrupt file must not hide every other run in the workspace.
              return null;
            }
          }),
      );
      return runs
        .filter((r): r is MissionSnapshot => r !== null)
        .sort((a, b) => Date.parse(b.mission.startedAt) - Date.parse(a.mission.startedAt));
    } catch {
      return [];
    }
  }
}
