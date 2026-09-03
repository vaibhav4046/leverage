import type {
  ModelDescriptor,
  ProviderAdapter,
  ProviderHealth,
  CostClass,
} from '../core/types';
import { OllamaAdapter } from './ollama';
import { PoolAdapter } from './pool';
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
    if (!force && Date.now() - this.lastSweep < HEALTH_TTL_MS) return;
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

        if (entry.health.status === 'UNAVAILABLE' || entry.health.status === 'AUTH_ERROR') {
          entry.models = [];
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
      new PoolAdapter(config.poolBaseUrl, config.poolApiKey),
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
