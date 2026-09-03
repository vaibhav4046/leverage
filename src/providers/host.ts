import type {
  ModelDescriptor,
  NormalizedModelRequest,
  NormalizedModelResponse,
  ProviderAdapter,
  ProviderFailure,
  ProviderHealth,
  UsageEstimate,
} from '../core/types';
import { estimateTokens } from '../core/tokens';
import { classifyHttpish, ProviderHttpError } from './ollama';

/**
 * Host-seat provider — your own subscription, working as a Leverage worker.
 *
 * This is the honest answer to "let me connect my ChatGPT Max / Claude Max instead
 * of pasting an API key". Consumer subscriptions have no API, and anything that
 * claims to connect one is driving a logged-in browser session: against terms,
 * brittle, and a credential-handling problem we refuse to own.
 *
 * What *is* real is MCP sampling. When Leverage runs as an MCP server inside Claude
 * Code, Codex, Cursor or any compliant host, it can call `sampling/createMessage`
 * back through the protocol and receive a completion from the model the host is
 * already signed in to. No API key is created, none is stored, and the inference is
 * billed to the seat the user already pays for.
 *
 * The control plane does not speak MCP, so the MCP server process acts as the
 * bridge: it claims queued requests from this queue, performs the sampling call
 * against its host, and posts the answer back. This adapter is the control plane's
 * end of that arrangement.
 *
 * Cost class is `host`, not `free`: a free route is somebody else's quota, a host
 * route is the user's own seat, and the usage panel must not conflate them.
 */

export interface HostSession {
  id: string;
  /** Reported by the MCP client, e.g. "claude-code", "codex", "cursor". */
  hostName: string;
  hostVersion?: string;
  /** Model identifiers the host says it can sample. */
  models: string[];
  /** False when the host connected but declined the sampling capability. */
  supportsSampling: boolean;
  lastSeenAt: number;
}

export interface PendingSamplingRequest {
  id: string;
  sessionId: string;
  modelHint: string;
  system: string;
  user: string;
  maxOutputTokens: number;
  temperature: number;
  createdAt: number;
  resolve: (value: HostSamplingResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface HostSamplingResult {
  text: string;
  model?: string;
  stopReason?: string;
}

const SESSION_TTL_MS = 90_000;

/**
 * Queue of sampling work waiting for a host to pick it up.
 *
 * Deliberately a queue rather than a direct call: the MCP process and the control
 * plane are different processes with the protocol only flowing one way, so the
 * control plane parks a promise and the host claims it.
 */
export class HostChannel {
  private sessions = new Map<string, HostSession>();
  private queue: PendingSamplingRequest[] = [];
  private inFlight = new Map<string, PendingSamplingRequest>();
  private seq = 0;

  /** Called by the MCP server when it connects or heartbeats. */
  register(session: Omit<HostSession, 'lastSeenAt'>): HostSession {
    const existing = this.sessions.get(session.id);
    const merged: HostSession = { ...session, lastSeenAt: Date.now() };
    this.sessions.set(session.id, merged);
    if (!existing) {
      // A host that just arrived may be able to take work that is already queued.
      this.pruneSessions();
    }
    return merged;
  }

  heartbeat(sessionId: string): boolean {
    const s = this.sessions.get(sessionId);
    if (!s) return false;
    s.lastSeenAt = Date.now();
    return true;
  }

  disconnect(sessionId: string): void {
    this.sessions.delete(sessionId);
    // Fail anything that host was holding rather than letting it hang to timeout.
    for (const [id, req] of this.inFlight) {
      if (req.sessionId === sessionId) {
        clearTimeout(req.timer);
        this.inFlight.delete(id);
        req.reject(new ProviderHttpError(503, 'host disconnected mid-request'));
      }
    }
  }

  /** Live sessions only. A host that stopped heartbeating is not a workforce. */
  activeSessions(): HostSession[] {
    this.pruneSessions();
    return [...this.sessions.values()];
  }

  private pruneSessions(): void {
    const cutoff = Date.now() - SESSION_TTL_MS;
    for (const [id, s] of this.sessions) {
      if (s.lastSeenAt < cutoff) {
        this.sessions.delete(id);
        this.disconnect(id);
      }
    }
  }

  /** Control-plane side: park a request and wait for a host to answer it. */
  request(args: {
    modelHint: string;
    system: string;
    user: string;
    maxOutputTokens: number;
    temperature: number;
    timeoutMs: number;
    signal?: AbortSignal;
  }): Promise<HostSamplingResult> {
    const sessions = this.activeSessions().filter((s) => s.supportsSampling);
    if (sessions.length === 0) {
      return Promise.reject(new ProviderHttpError(503, 'no MCP host session available for sampling'));
    }

    this.seq += 1;
    const id = `hs_${this.seq}_${Date.now().toString(36)}`;

    return new Promise<HostSamplingResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.queue = this.queue.filter((q) => q.id !== id);
        this.inFlight.delete(id);
        const err = new Error(`host sampling timed out after ${args.timeoutMs}ms`);
        err.name = 'TimeoutError';
        reject(err);
      }, args.timeoutMs);

      const pending: PendingSamplingRequest = {
        id,
        sessionId: sessions[0].id,
        modelHint: args.modelHint,
        system: args.system,
        user: args.user,
        maxOutputTokens: args.maxOutputTokens,
        temperature: args.temperature,
        createdAt: Date.now(),
        resolve,
        reject,
        timer,
      };

      args.signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          this.queue = this.queue.filter((q) => q.id !== id);
          this.inFlight.delete(id);
          reject(new ProviderHttpError(499, 'cancelled'));
        },
        { once: true },
      );

      this.queue.push(pending);
    });
  }

  /** MCP side: claim the next request for this session, if any. */
  claim(sessionId: string): {
    id: string;
    modelHint: string;
    system: string;
    user: string;
    maxOutputTokens: number;
    temperature: number;
  } | null {
    this.heartbeat(sessionId);
    const next = this.queue.shift();
    if (!next) return null;

    next.sessionId = sessionId;
    this.inFlight.set(next.id, next);

    return {
      id: next.id,
      modelHint: next.modelHint,
      system: next.system,
      user: next.user,
      maxOutputTokens: next.maxOutputTokens,
      temperature: next.temperature,
    };
  }

  /** MCP side: deliver the host's answer, or the host's failure. */
  fulfil(id: string, result: HostSamplingResult | { error: string }): boolean {
    const pending = this.inFlight.get(id);
    if (!pending) return false;
    clearTimeout(pending.timer);
    this.inFlight.delete(id);

    if ('error' in result) {
      pending.reject(new ProviderHttpError(502, result.error));
    } else {
      pending.resolve(result);
    }
    return true;
  }

  stats() {
    return {
      sessions: this.activeSessions().length,
      queued: this.queue.length,
      inFlight: this.inFlight.size,
    };
  }
}

/** One channel per process, pinned so Next's module graphs share it. */
const g = globalThis as unknown as { __leverageHostChannel?: HostChannel };
export const hostChannel: HostChannel = (g.__leverageHostChannel ??= new HostChannel());

export class HostAdapter implements ProviderAdapter {
  readonly providerId = 'host';
  readonly costClass = 'host' as const;

  constructor(private readonly channel: HostChannel = hostChannel) {}

  async discoverModels(): Promise<ModelDescriptor[]> {
    const sessions = this.channel.activeSessions().filter((s) => s.supportsSampling);

    // One descriptor per connected host, not per model. The host decides which of
    // its models answers a sampling request; pretending we can pick would be a
    // capability we do not have.
    return sessions.map((s) => ({
      key: `host:${s.hostName}`,
      providerId: this.providerId,
      modelId: s.models[0] ?? 'host-default',
      displayName: `${prettyHost(s.hostName)} (your seat)`,
      costClass: this.costClass,
      pricing: { inputPerMTok: 0, outputPerMTok: 0 },
      // Host models are frontier-class; assume a large window rather than a small
      // one, since guessing low would exclude them from exactly the hard tasks
      // they are best at.
      contextTokens: 200_000,
      capabilities: ['code', 'reasoning', 'backend', 'frontend', 'tests', 'security', 'docs', 'tools'],
      supportsTools: true,
    }));
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    const sessions = this.channel.activeSessions().filter((s) => s.supportsSampling);

    if (sessions.length === 0) {
      return {
        status: 'UNAVAILABLE',
        checkedAt,
        detail: 'no MCP host connected — run Leverage as an MCP server to use your own seat',
      };
    }
    return { status: 'HEALTHY', checkedAt, detail: `${sessions.length} host session(s)` };
  }

  estimate(_model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate {
    return {
      estimatedPromptTokens: estimateTokens(request.system) + estimateTokens(request.user),
      estimatedCompletionTokens: request.maxOutputTokens,
      // Zero to Leverage. The user's subscription already paid; inventing a dollar
      // figure here would put a charge in the ledger that nobody is billed for.
      estimatedCostUsd: 0,
    };
  }

  async invoke(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse> {
    const started = Date.now();
    const result = await this.channel.request({
      modelHint: model.modelId,
      system: request.system,
      user: request.user,
      maxOutputTokens: request.maxOutputTokens,
      temperature: request.temperature,
      timeoutMs: request.timeoutMs,
      signal,
    });

    return {
      text: result.text,
      resolvedModel: result.model ?? model.modelId,
      durationMs: Date.now() - started,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return classifyHttpish(error);
  }
}

function prettyHost(name: string): string {
  const known: Record<string, string> = {
    'claude-code': 'Claude Code',
    'claude-desktop': 'Claude Desktop',
    codex: 'Codex',
    cursor: 'Cursor',
    windsurf: 'Windsurf',
    kimi: 'Kimi',
    zed: 'Zed',
  };
  return known[name.toLowerCase()] ?? name;
}
