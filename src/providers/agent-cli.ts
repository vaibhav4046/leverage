import { spawn } from 'node:child_process';
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
 * Installed agent CLIs as a worker pool.
 *
 * This is the second half of "use my subscription, not an API key", and the half
 * that works even when the user is not sitting inside an MCP host.
 *
 * Claude Code, Codex and friends ship a headless mode -- `claude -p`,
 * `codex exec`, `gemini -p` -- and they authenticate with the login the user
 * already performed. Invoking one is using a shipped, documented interface exactly
 * as intended: no browser automation, no session cookie, no credential ever passes
 * through Leverage. The CLI holds its own auth and we never see it.
 *
 * Two properties make this better than an API key for our purposes:
 *   - the work is billed to a seat the user already pays for, so it stays inside
 *     Zero-Dollar Mode;
 *   - several of these CLIs report real token usage and cost back on stdout, so the
 *     ledger gets measured numbers instead of estimates.
 *
 * Cost class is `host`, alongside MCP sampling: the user's own seat, not a free
 * route and not a paid API call.
 */

interface CliSpec {
  /** Binary name as it appears on PATH. */
  bin: string;
  displayName: string;
  /** Argv after the binary. The prompt goes on stdin, never into argv. */
  args: string[];
  /** Pull the assistant's text out of whatever the CLI printed. */
  parse: (stdout: string) => { text: string; costUsd?: number; inTok?: number; outTok?: number };
  /** Recognise "logged out" so the auction can exclude it with a real reason. */
  detectAuthError: (combined: string) => boolean;
}

const CLIS: CliSpec[] = [
  {
    bin: 'claude',
    displayName: 'Claude Code',
    args: ['-p', '--output-format', 'json'],
    parse: (stdout) => {
      try {
        const j = JSON.parse(stdout) as {
          result?: string;
          is_error?: boolean;
          total_cost_usd?: number;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        if (j.is_error) throw new ProviderHttpError(502, j.result ?? 'cli reported an error');
        return {
          text: j.result ?? '',
          // Reported by the CLI. Zero on a subscription seat, which is the point.
          costUsd: j.total_cost_usd,
          inTok: j.usage?.input_tokens,
          outTok: j.usage?.output_tokens,
        };
      } catch (err) {
        if (err instanceof ProviderHttpError) throw err;
        return { text: stdout.trim() };
      }
    },
    detectAuthError: (s) => /oauth|401|authenticate|not logged in|revoked/i.test(s),
  },
  {
    bin: 'codex',
    displayName: 'Codex',
    // `codex exec` is the non-interactive mode.
    args: ['exec', '--json', '-'],
    parse: (stdout) => {
      // Codex emits JSONL; the last object carrying text is the answer.
      const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
      let text = '';
      for (const line of lines) {
        try {
          const j = JSON.parse(line) as { type?: string; text?: string; message?: string };
          if (typeof j.text === 'string' && j.text.trim()) text = j.text;
          else if (typeof j.message === 'string' && j.message.trim()) text = j.message;
        } catch {
          // Not JSON: treat as raw output rather than discarding it.
          text = line;
        }
      }
      return { text: text || stdout.trim() };
    },
    detectAuthError: (s) => /not logged in|unauthor|401|sign in/i.test(s),
  },
  {
    bin: 'gemini',
    displayName: 'Gemini CLI',
    args: ['-p'],
    parse: (stdout) => ({ text: stdout.trim() }),
    detectAuthError: (s) => /not authenticated|401|login/i.test(s),
  },
  {
    bin: 'opencode',
    displayName: 'OpenCode',
    args: ['run'],
    parse: (stdout) => ({ text: stdout.trim() }),
    detectAuthError: (s) => /not authenticated|401|login/i.test(s),
  },
];

export interface DetectedCli {
  spec: CliSpec;
  path: string;
  authOk: boolean;
  detail?: string;
}

export class AgentCliAdapter implements ProviderAdapter {
  readonly providerId = 'agent-cli';
  readonly costClass = 'host' as const;

  private detected: DetectedCli[] = [];
  private lastDetect = 0;

  constructor(private readonly enabled: boolean = true) {}

  /**
   * Which CLIs are on PATH and logged in.
   *
   * Cached: probing spawns a process per CLI, and doing that on every auction
   * would add seconds to each hire for information that changes rarely.
   */
  private async detect(force = false): Promise<DetectedCli[]> {
    if (!this.enabled) return [];
    if (!force && Date.now() - this.lastDetect < 120_000) return this.detected;
    this.lastDetect = Date.now();

    const found: DetectedCli[] = [];
    for (const spec of CLIS) {
      const path = await which(spec.bin);
      if (!path) continue;

      // A CLI that is installed but signed out is worse than absent: it would be
      // hired and fail. Probe once so the auction can exclude it honestly.
      const probe = await run(spec.bin, [...spec.args], 'Reply with OK.', 45_000);
      const combined = `${probe.stdout}\n${probe.stderr}`;
      const authOk = !spec.detectAuthError(combined);

      found.push({
        spec,
        path,
        authOk,
        detail: authOk ? undefined : firstLine(combined) || 'not signed in',
      });
    }

    this.detected = found;
    return found;
  }

  async discoverModels(): Promise<ModelDescriptor[]> {
    const clis = await this.detect();
    return clis
      .filter((c) => c.authOk)
      .map((c) => ({
        key: `agent-cli:${c.spec.bin}`,
        providerId: this.providerId,
        modelId: c.spec.bin,
        displayName: `${c.spec.displayName} (your subscription)`,
        costClass: this.costClass,
        pricing: { inputPerMTok: 0, outputPerMTok: 0 },
        contextTokens: 200_000,
        capabilities: [
          'code',
          'reasoning',
          'backend',
          'frontend',
          'tests',
          'security',
          'docs',
          'tools',
        ],
        supportsTools: true,
      }));
  }

  async health(): Promise<ProviderHealth> {
    const checkedAt = new Date().toISOString();
    if (!this.enabled) {
      return { status: 'UNAVAILABLE', checkedAt, detail: 'agent CLI provider disabled' };
    }

    const clis = await this.detect();
    if (clis.length === 0) {
      return {
        status: 'UNAVAILABLE',
        checkedAt,
        detail: 'no agent CLI on PATH (claude, codex, gemini, opencode)',
      };
    }

    const usable = clis.filter((c) => c.authOk);
    if (usable.length === 0) {
      return {
        status: 'AUTH_ERROR',
        checkedAt,
        // Named so the Providers page can tell the user exactly what to run.
        detail: `${clis.map((c) => c.spec.bin).join(', ')} installed but signed out, run \`${clis[0].spec.bin} login\``,
      };
    }

    // Name the signed-out ones too. "1 of 2 CLIs usable" is actionable; "healthy"
    // alone hides a subscription the user thinks they connected.
    const signedOut = clis.filter((c) => !c.authOk);
    const detail =
      signedOut.length === 0
        ? `${usable.map((c) => c.spec.displayName).join(', ')} signed in`
        : `${usable.map((c) => c.spec.displayName).join(', ')} signed in · ` +
          `${signedOut.map((c) => `${c.spec.bin} signed out (run \`${c.spec.bin} login\`)`).join(', ')}`;

    return { status: 'HEALTHY', checkedAt, detail };
  }

  estimate(_model: ModelDescriptor, request: NormalizedModelRequest): UsageEstimate {
    return {
      estimatedPromptTokens: estimateTokens(request.system) + estimateTokens(request.user),
      estimatedCompletionTokens: request.maxOutputTokens,
      // Zero to Leverage: the subscription already paid. The CLI may report its own
      // figure, which we record separately rather than charging.
      estimatedCostUsd: 0,
    };
  }

  async invoke(
    model: ModelDescriptor,
    request: NormalizedModelRequest,
    signal: AbortSignal,
  ): Promise<NormalizedModelResponse> {
    const cli = (await this.detect()).find((c) => c.spec.bin === model.modelId);
    if (!cli) throw new ProviderHttpError(503, `${model.modelId} is no longer on PATH`);
    if (!cli.authOk) throw new ProviderHttpError(401, `${model.modelId} is signed out`);

    const started = Date.now();
    // System and user are joined into one document because these CLIs take a single
    // prompt. The system half stays first and clearly delimited.
    const prompt = `${request.system}\n\n---\n\n${request.user}`;

    const result = await run(cli.spec.bin, cli.spec.args, prompt, request.timeoutMs, signal);

    if (result.code !== 0 && !result.stdout.trim()) {
      const combined = `${result.stdout}\n${result.stderr}`;
      if (cli.spec.detectAuthError(combined)) {
        cli.authOk = false;
        throw new ProviderHttpError(401, firstLine(combined) || 'signed out');
      }
      throw new ProviderHttpError(502, firstLine(combined) || `exit ${result.code}`);
    }

    const parsed = cli.spec.parse(result.stdout);

    return {
      text: parsed.text,
      promptTokens: parsed.inTok,
      completionTokens: parsed.outTok,
      resolvedModel: cli.spec.bin,
      durationMs: Date.now() - started,
    };
  }

  classifyError(error: unknown): ProviderFailure {
    return classifyHttpish(error);
  }
}

/* ----------------------------------------------------------------- process */

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn a CLI with the prompt on stdin.
 *
 * stdin rather than argv on purpose: a compiled context bundle can be tens of
 * kilobytes and Windows caps a command line around 32K, so a large task would fail
 * in a way that looks like a model problem. It also keeps prompt text out of the
 * process table, where anyone on the machine can read it.
 */
function run(
  bin: string,
  args: string[],
  stdin: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RunResult> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const command = isWindows ? (process.env.ComSpec ?? 'cmd.exe') : bin;
    const argv = isWindows ? ['/d', '/s', '/c', bin, ...args] : args;

    const child = spawn(command, argv, {
      shell: false,
      windowsHide: true,
      env: { ...process.env, NO_COLOR: '1', CI: '1' },
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (code: number, extra = '') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve({ code, stdout, stderr: stderr + extra });
    };

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(124, `\ntimed out after ${timeoutMs}ms`);
    }, timeoutMs);

    const onAbort = () => {
      child.kill('SIGKILL');
      finish(130, '\ncancelled');
    };
    signal?.addEventListener('abort', onAbort, { once: true });

    child.stdout?.on('data', (d) => {
      stdout += d.toString();
      if (stdout.length > 400_000) stdout = stdout.slice(-400_000);
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
      if (stderr.length > 100_000) stderr = stderr.slice(-100_000);
    });

    child.on('error', (err) => finish(127, err.message));
    child.on('close', (code) => finish(code ?? 1));

    child.stdin?.on('error', () => undefined); // CLI may close stdin early
    child.stdin?.end(stdin);
  });
}

async function which(bin: string): Promise<string | null> {
  const isWindows = process.platform === 'win32';
  const result = await run(isWindows ? 'where' : 'which', [bin], '', 8_000);
  if (result.code !== 0) return null;
  const line = result.stdout.trim().split(/\r?\n/)[0];
  return line || null;
}

function firstLine(s: string): string {
  return s.trim().split(/\r?\n/).find(Boolean)?.slice(0, 200) ?? '';
}
