import type {
  ModelDescriptor,
  ProviderAdapter,
  ProviderHealth,
  CostClass,
} from '../core/types';
import { OllamaAdapter } from './ollama';
import { PoolAdapter } from './pool';

function poolModelsFromEnv(): string[] | undefined {
  const list = process.env.POOL_MODELS?.split(',').map((m) => m.trim()).filter(Boolean);
  return list?.length ? list : undefined;
}
import { HostAdapter } from './host';
import { AgentCliAdapter } from './agent-cli';

/**
 * Capability registry.
 *
 * Discovers what intelligence is actually reachable right now and keeps health
 * fresh enough for the scheduler to trust. Discovery failures are not fatal: a dead
 * provider contributes zero models and an UNAVAILABLE health record, which the
 * policy filter then excludes with a stated reason. A missing provider must never
 * take the mission down with it.
 */

export interface RegisteredProvider {
  adapter: ProviderAdapter;
  label: string;
  models: ModelDescriptor[];
  health: ProviderHealth;
  lastDiscoveryError?: string;
}

const HEALTH_TTL_MS = 30_000;

export class ProviderRegistry {
  private providers = new Map<string, RegisteredProvider>();
  private lastSweep = 0;
  private inflight: Promise<void> | null = null;

  /** Whether a sweep has ever completed, so a caller can serve the cache and refresh behind it. */
  get hasSwept(): boolean {
    return this.lastSweep > 0 && this.inflight === null;
  }

  register(adapter: ProviderAdapter, label: string): void {
    this.providers.set(adapter.providerId, {
      adapter,
      label,
      models: [],
      health: { status: 'UNKNOWN', checkedAt: new Date(0).toISOString() },
    });
  }

  /** Replace an adapter in place — used to wrap one in failure injection. */
  swap(providerId: string, adapter: ProviderAdapter): void {
    const existing = this.providers.get(providerId);
    if (!existing) return;
    this.providers.set(providerId, { ...existing, adapter });
  }

  get(providerId: string): RegisteredProvider | undefined {
    return this.providers.get(providerId);
  }

  adapterFor(model: ModelDescriptor): ProviderAdapter | undefined {
    return this.providers.get(model.providerId)?.adapter;
  }

  list(): RegisteredProvider[] {
    return [...this.providers.values()];
  }

  allModels(): ModelDescriptor[] {
    return this.list().flatMap((p) => p.models);
  }

  healthFor(providerId: string): ProviderHealth {
    return (
      this.providers.get(providerId)?.health ?? {
        status: 'UNKNOWN',
        checkedAt: new Date().toISOString(),
      }
    );
  }

  /** Refresh health and catalogue for every provider, concurrently. */
  async sweep(force = false): Promise<void> {
    // One sweep at a time; a second caller waits on the first instead of
    // probing every provider again. This check comes before the freshness
    // check: the warm-up sweep stamps its start time the moment it begins, and a
    // caller that arrived a second later used to see a fresh timestamp, skip the
    // wait, and plan against an empty roster on a cold instance.
    if (this.inflight) return this.inflight;
    if (!force && Date.now() - this.lastSweep < HEALTH_TTL_MS) return;
    this.inflight = this.sweepNow().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async sweepNow(): Promise<void> {
    this.lastSweep = Date.now();

    await Promise.all(
      this.list().map(async (entry) => {
        try {
          entry.health = await entry.adapter.health();
        } catch (err) {
          entry.health = {
            status: 'UNAVAILABLE',
            checkedAt: new Date().toISOString(),
            detail: err instanceof Error ? err.message : 'health check threw',
          };
        }

        // Bad credentials empty the catalogue: nothing on that provider can be
        // hired. A probe that merely timed out keeps the last catalogue for the
        // same reason a discovery blip does below: one slow fetch must not
        // leave a running mission with no hosted models to plan or hire with.
        if (entry.health.status === 'AUTH_ERROR') {
          entry.models = [];
          return;
        }
        if (entry.health.status === 'UNAVAILABLE') {
          if (entry.models.length === 0) return;
          entry.lastDiscoveryError = entry.health.detail;
          return;
        }

        try {
          entry.models = await entry.adapter.discoverModels();
          entry.lastDiscoveryError = undefined;
        } catch (err) {
          entry.lastDiscoveryError = err instanceof Error ? err.message : String(err);
          // Keep the previous catalogue: a transient discovery blip should not
          // empty the workforce mid-mission.
        }
      }),
    );
  }

  countsByCostClass(): Record<CostClass, number> {
    const counts: Record<CostClass, number> = { local: 0, host: 0, free: 0, paid: 0 };
    for (const m of this.allModels()) counts[m.costClass] += 1;
    return counts;
  }
}

export interface RegistryConfig {
  ollamaBaseUrl?: string;
  poolBaseUrl?: string;
  /** Set false to stop probing installed agent CLIs entirely. */
  agentCli?: boolean;
  poolApiKey?: string;
}

/** Build the registry from environment configuration. */
export function buildRegistry(config: RegistryConfig): ProviderRegistry {
  const registry = new ProviderRegistry();

  if (config.ollamaBaseUrl) {
    registry.register(new OllamaAdapter(config.ollamaBaseUrl), 'Ollama (local runtime)');
  }
  if (config.poolBaseUrl) {
    registry.register(
      // POOL_MODELS lets a deployment name the models its upstream actually
      // serves. The local router advertises `auto/best-free`; a hosted pool
      // advertises `openrouter/…` and `nvidia/…`. Same adapter, same auction.
      new PoolAdapter(config.poolBaseUrl, config.poolApiKey, poolModelsFromEnv()),
      'Free model pool (OpenAI-compatible)',
    );
  }

  // Both always registered. They report UNAVAILABLE or AUTH_ERROR until wired up,
  // which is exactly the state the Providers page should show someone who has not
  // connected them -- with the command that would fix it.
  registry.register(new HostAdapter(), 'Your MCP host seat (no API key)');
  registry.register(
    new AgentCliAdapter(config.agentCli !== false),
    'Your agent CLI subscription (no API key)',
  );

  return registry;
}
