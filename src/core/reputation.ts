import type { ModelObservation, ModelReputation, TaskCategory } from './types';
import { confidenceFor, shrinkSuccessRate } from './auction';

/**
 * Model reputation.
 *
 * Stores observations, derives statistics. The distinction matters: an observation
 * is a fact about one run, a reputation is an inference, and the inference is only
 * allowed to be as confident as the evidence supports.
 *
 * Concretely, this is why the UI never says "97.3% frontend model" after two jobs —
 * the rate is shrunk toward a neutral prior and shipped with a sample count and a
 * confidence band, and the band is what the UI leads with.
 */
export class ReputationStore {
  private observations: ModelObservation[] = [];

  constructor(seed: ModelObservation[] = []) {
    this.observations = [...seed];
  }

  record(obs: ModelObservation): void {
    this.observations.push(obs);
  }

  all(): ModelObservation[] {
    return [...this.observations];
  }

  /**
   * Reputation for a model, optionally within one task category.
   *
   * Category-specific reputation is what makes the auction interesting — a model
   * can be strong at tests and weak at frontend — but a category with too little
   * evidence falls back to the model's overall record rather than pretending.
   */
  reputationFor(modelKey: string, category?: TaskCategory): ModelReputation | undefined {
    const forModel = this.observations.filter((o) => o.modelKey === modelKey);
    if (forModel.length === 0) return undefined;

    const MIN_CATEGORY_SAMPLES = 3;
    const scoped =
      category && forModel.filter((o) => o.category === category).length >= MIN_CATEGORY_SAMPLES
        ? forModel.filter((o) => o.category === category)
        : forModel;

    const samples = scoped.length;
    const verifiedSuccesses = scoped.filter((o) => o.verified).length;
    const latencies = scoped.map((o) => o.durationMs).sort((a, b) => a - b);

    return {
      modelKey,
      category: scoped === forModel ? 'all' : category!,
      samples,
      verifiedSuccesses,
      successRate: shrinkSuccessRate(verifiedSuccesses, samples),
      medianLatencyMs: median(latencies),
      reworkCount: scoped.filter((o) => o.handedOff).length,
      confidence: confidenceFor(samples),
    };
  }

  /** Every model with at least one observation, best first. */
  leaderboard(category?: TaskCategory): ModelReputation[] {
    const keys = [...new Set(this.observations.map((o) => o.modelKey))];
    return keys
      .map((k) => this.reputationFor(k, category))
      .filter((r): r is ModelReputation => r !== undefined)
      .sort((a, b) => b.successRate - a.successRate);
  }

  toJSON(): ModelObservation[] {
    return this.all();
  }

  static fromJSON(data: unknown): ReputationStore {
    if (!Array.isArray(data)) return new ReputationStore();
    return new ReputationStore(data as ModelObservation[]);
  }
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}
