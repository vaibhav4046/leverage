import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { MissionSnapshot } from '../core/mission';
import { isSafeMissionId, isSafeWorkspaceId, type MissionRepository } from './types';

/**
 * Postgres repository, over the schema in `supabase/migrations/`.
 *
 * ⚠ Never executed against a live database. There is no Supabase project in this
 * environment (see BLOCKERS_REQUIRING_HUMAN.md), so this code type-checks, matches
 * the committed migrations column for column, and has never had a row pass through
 * it. Treat the first run as a first run. The filesystem repository is what produced
 * every recorded run on the site.
 *
 * A snapshot is decomposed across the relational tables rather than dropped into one
 * jsonb column. That is the whole point of the schema: a mission's tasks, workers,
 * checkpoints, proofs and events are queryable facts about what happened, and
 * flattening them into a blob would make the database a filesystem with extra steps.
 *
 * Writes use the secret key from the server only. The browser has no path to these
 * tables — RLS is on with no permissive policy — so this client is the sole reader.
 */
export class SupabaseMissionRepository implements MissionRepository {
  readonly kind = 'supabase' as const;

  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  /**
   * Map the application's workspace id onto a row in `workspaces`.
   *
   * The app identifies a workspace by a stable string (`ws_<privy-did>`), while the
   * schema keys on a uuid — so the string is the slug and the uuid is internal. The
   * alternative, making the app pass uuids around, would leak a storage detail into
   * every route and into the URL.
   */
  private async workspaceUuid(workspaceId: string): Promise<string | null> {
    if (!isSafeWorkspaceId(workspaceId)) return null;

    const existing = await this.client
      .from('workspaces')
      .select('id')
      .eq('slug', workspaceId)
      .maybeSingle();
    if (existing.data?.id) return existing.data.id as string;

    const created = await this.client
      .from('workspaces')
      .insert({ name: workspaceId, slug: workspaceId })
      .select('id')
      .single();
    return (created.data?.id as string) ?? null;
  }

  async save(workspaceId: string, snapshot: MissionSnapshot): Promise<void> {
    const uuid = await this.workspaceUuid(workspaceId);
    if (!uuid || !isSafeMissionId(snapshot.mission.id)) return;

    const id = snapshot.mission.id;
    const m = snapshot.mission;

    await this.client.from('missions').upsert({
      id,
      workspace_id: uuid,
      goal: m.goal,
      status: m.status,
      budget_max_usd: m.budget.maxUsd,
      budget_hard: m.budget.hard,
      quality_target: m.quality.target,
      privacy_mode: m.privacy.mode,
      started_at: m.startedAt,
      completed_at: m.completedAt ?? null,
      updated_at: new Date().toISOString(),
    });

    // Children are replaced wholesale rather than diffed. A snapshot is the complete
    // state of a mission at a point in time, so reconciling row by row would be more
    // code for an identical result.
    await Promise.all(
      ['mission_tasks', 'worker_runs', 'checkpoints', 'mission_events', 'auctions'].map((t) =>
        this.client.from(t).delete().eq('mission_id', id),
      ),
    );
    await this.client.from('proof_packs').delete().eq('mission_id', id);

    if (snapshot.tasks.length) {
      await this.client.from('mission_tasks').insert(
        snapshot.tasks.map((t) => ({
          id: t.id,
          mission_id: id,
          title: t.title,
          category: t.category,
          status: t.state,
          file_scope: t.fileScope ?? [],
          attempt_count: t.attemptCount,
          checkpoint_id: t.checkpointId ?? null,
        })),
      );

      const deps = snapshot.tasks.flatMap((t) =>
        (t.dependencies ?? []).map((d) => ({
          mission_id: id,
          task_id: t.id,
          depends_on_task_id: d,
        })),
      );
      if (deps.length) await this.client.from('task_dependencies').insert(deps);
    }

    if (snapshot.workers.length) {
      await this.client.from('worker_runs').insert(
        snapshot.workers.map((w) => ({
          id: w.id,
          mission_id: id,
          task_id: w.taskId,
          model_key: w.modelKey,
          provider_id: w.providerId,
          display_name: w.displayName,
          role: w.role,
          cost_class: w.costClass,
          status: w.status,
          started_at: w.startedAt,
          finished_at: w.finishedAt ?? null,
          actual_cost_usd: w.actualCostUsd ?? 0,
          failure_type: w.failureType ?? null,
        })),
      );
    }

    if (snapshot.checkpoints.length) {
      await this.client.from('checkpoints').insert(
        snapshot.checkpoints.map((c) => ({
          id: c.id,
          mission_id: id,
          task_id: c.taskId,
          from_model_key: c.fromModelKey,
          reason: c.reason,
          payload: { remainingWork: c.remainingWork },
          original_context_tokens: c.originalContextTokens,
          checkpoint_tokens: c.checkpointTokens,
        })),
      );
    }

    if (snapshot.proofs.length) {
      await this.client.from('proof_packs').insert(
        snapshot.proofs.map((p) => ({
          id: p.id,
          mission_id: id,
          task_id: p.taskId ?? null,
          status: p.status,
          files_changed: p.filesChanged ?? [],
          patch_hash: p.patchHash ?? null,
          quality_total: p.qualityScore?.total ?? 0,
          quality_detail: p.qualityScore ?? {},
          duration_ms: p.metrics?.durationMs ?? 0,
          actual_cost_usd: p.metrics?.actualCostUsd ?? 0,
          worker: p.worker ?? null,
          unresolved: p.unresolved ?? [],
          created_at: p.createdAt,
        })),
      );

      // Each check is a row: "did the compiler pass" is a fact worth querying across
      // missions, not a line inside a blob.
      const checks = snapshot.proofs.flatMap((p) =>
        (p.checks ?? []).map((c) => ({
          proof_pack_id: p.id,
          check_id: c.id,
          label: c.label,
          status: c.status,
          detail: c.detail ?? '',
          duration_ms: c.durationMs ?? 0,
          weight: c.weight ?? 1,
        })),
      );
      if (checks.length) await this.client.from('proof_checks').insert(checks);
    }

    if (snapshot.events.length) {
      await this.client.from('mission_events').insert(
        snapshot.events.map((e) => ({
          mission_id: id,
          seq: e.seq,
          type: e.type,
          at: e.at,
          elapsed_ms: e.elapsedMs,
          task_id: e.taskId ?? null,
          worker_run_id: e.workerRunId ?? null,
          message: e.message,
          data: e.data ?? null,
        })),
      );
    }

    if (snapshot.auctions.length) {
      await this.client.from('auctions').insert(
        snapshot.auctions.map((a, i) => ({
          mission_id: id,
          task_id: a.taskId,
          seq: i,
          winner_key: a.winner?.modelKey ?? null,
          rationale: a.rationale ?? '',
          candidates: a.candidates ?? [],
        })),
      );
    }
  }

  async get(workspaceId: string, missionId: string): Promise<MissionSnapshot | null> {
    if (!isSafeMissionId(missionId)) return null;
    const uuid = await this.workspaceUuid(workspaceId);
    if (!uuid) return null;

    // The workspace predicate is part of the query, not a check after the fact: a
    // mission in another tenant is not found rather than found-then-refused.
    const row = await this.client
      .from('missions')
      .select('*')
      .eq('id', missionId)
      .eq('workspace_id', uuid)
      .maybeSingle();
    if (!row.data) return null;

    return this.hydrate(row.data as MissionRow);
  }

  async list(workspaceId: string): Promise<MissionSnapshot[]> {
    const uuid = await this.workspaceUuid(workspaceId);
    if (!uuid) return [];

    const rows = await this.client
      .from('missions')
      .select('*')
      .eq('workspace_id', uuid)
      .order('created_at', { ascending: false });
    if (!rows.data?.length) return [];

    return Promise.all((rows.data as MissionRow[]).map((r) => this.hydrate(r)));
  }

  private async hydrate(row: MissionRow): Promise<MissionSnapshot> {
    const id = row.id;
    const [tasks, deps, workers, checkpoints, proofs, events, auctions] = await Promise.all([
      this.client.from('mission_tasks').select('*').eq('mission_id', id),
      this.client.from('task_dependencies').select('*').eq('mission_id', id),
      this.client.from('worker_runs').select('*').eq('mission_id', id).order('started_at'),
      this.client.from('checkpoints').select('*').eq('mission_id', id),
      this.client.from('proof_packs').select('*, proof_checks(*)').eq('mission_id', id),
      this.client.from('mission_events').select('*').eq('mission_id', id).order('seq'),
      this.client.from('auctions').select('*').eq('mission_id', id).order('seq'),
    ]);

    const depsFor = (taskId: string) =>
      (deps.data ?? [])
        .filter((d: Record<string, unknown>) => d.task_id === taskId)
        .map((d: Record<string, unknown>) => d.depends_on_task_id as string);

    const startedAt = row.started_at ?? row.created_at;
    const completedAt = row.completed_at ?? undefined;

    return {
      mission: {
        id,
        goal: row.goal,
        status: row.status,
        budget: { maxUsd: Number(row.budget_max_usd), hard: row.budget_hard },
        quality: { target: Number(row.quality_target) },
        privacy: { mode: row.privacy_mode },
        startedAt,
        completedAt,
        elapsedMs:
          (completedAt ? Date.parse(completedAt) : Date.now()) - Date.parse(startedAt),
      },
      tasks: (tasks.data ?? []).map((t: Record<string, unknown>) => ({
        id: t.id as string,
        title: t.title as string,
        category: t.category as string,
        state: t.status as string,
        dependencies: depsFor(t.id as string),
        attemptCount: t.attempt_count as number,
        checkpointId: (t.checkpoint_id as string) ?? undefined,
        fileScope: (t.file_scope as string[]) ?? [],
      })),
      workers: (workers.data ?? []).map((w: Record<string, unknown>) => ({
        id: w.id,
        missionId: id,
        taskId: w.task_id,
        modelKey: w.model_key,
        providerId: w.provider_id,
        displayName: w.display_name,
        role: w.role,
        costClass: w.cost_class,
        status: w.status,
        startedAt: w.started_at,
        finishedAt: w.finished_at ?? undefined,
        actualCostUsd: Number(w.actual_cost_usd ?? 0),
        failureType: w.failure_type ?? undefined,
      })),
      checkpoints: (checkpoints.data ?? []).map((c: Record<string, unknown>) => {
        const original = Number(c.original_context_tokens ?? 0);
        const kept = Number(c.checkpoint_tokens ?? 0);
        return {
          id: c.id,
          taskId: c.task_id,
          fromModelKey: c.from_model_key,
          reason: c.reason,
          originalContextTokens: original,
          checkpointTokens: kept,
          reductionPct: original > 0 ? Math.round((1 - kept / original) * 100) : 0,
          remainingWork: (c.payload as { remainingWork?: unknown[] })?.remainingWork ?? [],
        };
      }),
      proofs: (proofs.data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        missionId: id,
        taskId: p.task_id ?? undefined,
        status: p.status,
        worker: p.worker ?? undefined,
        filesChanged: (p.files_changed as string[]) ?? [],
        patchHash: p.patch_hash ?? undefined,
        checks: ((p.proof_checks as Record<string, unknown>[]) ?? []).map((c) => ({
          id: c.check_id,
          label: c.label,
          status: c.status,
          detail: c.detail ?? '',
          durationMs: Number(c.duration_ms ?? 0),
          weight: Number(c.weight ?? 1),
        })),
        unresolved: (p.unresolved as string[]) ?? [],
        qualityScore: p.quality_detail ?? { total: Number(p.quality_total ?? 0) },
        metrics: {
          durationMs: Number(p.duration_ms ?? 0),
          actualCostUsd: Number(p.actual_cost_usd ?? 0),
        },
        createdAt: p.created_at,
      })),
      auctions: (auctions.data ?? []).map((a: Record<string, unknown>) => {
        const candidates = (a.candidates as { modelKey?: string }[]) ?? [];
        return {
          taskId: a.task_id,
          candidates,
          // The winner is stored by key and rehydrated from the candidate list, so
          // the score shown next to it is the one it actually won with.
          winner: candidates.find((c) => c.modelKey === a.winner_key),
          rationale: (a.rationale as string) ?? '',
        };
      }),
      usage: {
        paidSpendUsd: (workers.data ?? []).reduce(
          (sum: number, w: Record<string, unknown>) => sum + Number(w.actual_cost_usd ?? 0),
          0,
        ),
        budgetMaxUsd: Number(row.budget_max_usd),
        budgetHard: row.budget_hard,
      },
      events: (events.data ?? []).map((e: Record<string, unknown>) => ({
        seq: e.seq,
        id: `${id}-${e.seq}`,
        missionId: id,
        type: e.type,
        at: e.at,
        elapsedMs: Number(e.elapsed_ms ?? 0),
        taskId: e.task_id ?? undefined,
        workerRunId: e.worker_run_id ?? undefined,
        message: e.message,
        data: e.data ?? undefined,
      })),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as MissionSnapshot;
  }
}

interface MissionRow {
  id: string;
  goal: string;
  status: string;
  budget_max_usd: number | string;
  budget_hard: boolean;
  quality_target: number | string;
  privacy_mode: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
