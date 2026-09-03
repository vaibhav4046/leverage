import type { MissionEvent, MissionEventType } from './types';

/**
 * Mission event log.
 *
 * Append-only, monotonically sequenced per mission. The sequence number is the SSE
 * resume cursor: a reconnecting client sends the last seq it saw and gets the tail,
 * so the timeline in Mission Control is never a guess about what it missed.
 *
 * Everything written here passes through redaction first. Mission events are the
 * most widely-read surface in the product — they go to the browser, into ProofPacks
 * and into the demo recording — so a credential that reaches this log reaches all
 * three at once.
 */

export type EventListener = (event: MissionEvent) => void;

export class MissionEventLog {
  private events: MissionEvent[] = [];
  private listeners = new Set<EventListener>();
  private seq = 0;
  private readonly startedAt: number;

  constructor(
    readonly missionId: string,
    startedAt = Date.now(),
  ) {
    this.startedAt = startedAt;
  }

  emit(
    type: MissionEventType,
    message: string,
    extra: {
      taskId?: string;
      workerRunId?: string;
      data?: Record<string, unknown>;
    } = {},
  ): MissionEvent {
    this.seq += 1;
    const now = Date.now();
    const event: MissionEvent = {
      seq: this.seq,
      id: `${this.missionId}-${this.seq}`,
      missionId: this.missionId,
      type,
      at: new Date(now).toISOString(),
      elapsedMs: now - this.startedAt,
      taskId: extra.taskId,
      workerRunId: extra.workerRunId,
      message: redactText(message),
      data: extra.data ? redactObject(extra.data) : undefined,
    };

    this.events.push(event);
    for (const listener of this.listeners) {
      // A misbehaving subscriber must not break the mission.
      try {
        listener(event);
      } catch {
        /* ignore */
      }
    }
    return event;
  }

  /** Events after `afterSeq`. Pass 0 for the whole log. */
  since(afterSeq: number): MissionEvent[] {
    return this.events.filter((e) => e.seq > afterSeq);
  }

  all(): MissionEvent[] {
    return [...this.events];
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get length(): number {
    return this.events.length;
  }
}

/**
 * Secret redaction.
 *
 * Deny-listing by key name alone is not enough — a value can arrive inside free
 * text, a file excerpt or a model's answer — so this also matches on the *shape* of
 * known credential formats. The regression test in tests/security asserts that a
 * planted key never appears in events, API responses, ProofPacks or rendered HTML.
 */
const SECRET_KEY_PATTERN = /(api[-_]?key|apikey|secret|token|password|passwd|credential|authorization|bearer)/i;

const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\brr_[A-Za-z0-9]{16,}\b/g, // RocketRide
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI-style
  /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}\b/g, // Supabase
  /\bpk_[A-Za-z0-9]{16,}\b/g, // RocketRide public task keys
  /\btk_[A-Za-z0-9]{16,}\b/g, // RocketRide private task tokens
  /\bghp_[A-Za-z0-9]{20,}\b/g, // GitHub
  /\bAIza[A-Za-z0-9_-]{20,}\b/g, // Google
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
];

export const REDACTED = '[redacted]';

export function redactText(input: string): string {
  let out = input;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, REDACTED);
  }
  return out;
}

export function redactObject<T>(value: T): T {
  return redactValue(value, 0) as T;
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > 8) return REDACTED; // cycle / bomb guard
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? REDACTED : redactValue(v, depth + 1);
    }
    return out;
  }
  return value;
}

/** Human-readable one-liner for the timeline. */
export function formatElapsed(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`;
}
