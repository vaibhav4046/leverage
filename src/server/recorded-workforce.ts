import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { ReputationStore } from '../core/reputation';

/**
 * The workforce, as recorded rather than as discovered.
 *
 * Mission Control discovers models by probing the machine it runs on. That is the
 * right behaviour locally and the wrong behaviour on the public deployment, which
 * has no Ollama, no pool and no keys: the landing page showed a measured table of
 * real model performance, and a judge who clicked through to verify it landed on
 * "Reachable 0 · 0 local · 0 free · 0 paid" and an empty table body.
 *
 * Headline claim, one click, zeros. That is the sequence that loses an entry.
 *
 * So when live discovery finds nothing, fall back to the same committed
 * observations the landing page reads, and say plainly where the numbers came
 * from. The alternative — inventing a plausible-looking model list — is the one
 * thing this product must never do.
 */
export interface RecordedModel {
  key: string;
  displayName: string;
  providerId: string;
  costClass: 'local' | 'free' | 'host' | 'paid';
  samples: number;
  verifiedSuccesses: number;
  successRate: number;
  medianLatencyMs?: number;
  confidence: string;
}

function costClassOf(modelKey: string): RecordedModel['costClass'] {
  if (modelKey.startsWith('ollama')) return 'local';
  if (modelKey.startsWith('agent-cli') || modelKey.startsWith('host')) return 'host';
  return 'free';
}

export async function loadRecordedWorkforce(): Promise<RecordedModel[]> {
  try {
    const raw = await fs.readFile(path.resolve('demo/proof/model-observations.json'), 'utf8');
    const store = ReputationStore.fromJSON(JSON.parse(raw));
    return store
      .leaderboard()
      .filter((r) => r.samples > 0)
      .map((r) => ({
        key: r.modelKey,
        displayName: r.modelKey.split(':').slice(1).join(':') || r.modelKey,
        providerId: r.modelKey.split(':')[0] ?? 'unknown',
        costClass: costClassOf(r.modelKey),
        samples: r.samples,
        verifiedSuccesses: r.verifiedSuccesses,
        successRate: r.successRate,
        medianLatencyMs: r.medianLatencyMs,
        confidence: r.confidence,
      }));
  } catch {
    return [];
  }
}

export function countsByCostClass(models: RecordedModel[]) {
  return {
    local: models.filter((m) => m.costClass === 'local').length,
    free: models.filter((m) => m.costClass === 'free').length,
    host: models.filter((m) => m.costClass === 'host').length,
    paid: models.filter((m) => m.costClass === 'paid').length,
  };
}
