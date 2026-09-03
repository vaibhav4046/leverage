import { Reveal } from '@/components/visual/motion';

/**
 * Bring your own intelligence.
 *
 * Deliberately honest about the three different things people mean by "connect my
 * models", because they have very different mechanics and conflating them is how a
 * product ends up promising something it cannot legally do:
 *
 *   1. Your host seat  — MCP sampling. No key. The strongest option, and the one
 *      people actually want when they say "use my Claude Max".
 *   2. Your own runtime — Ollama, LM Studio, vLLM. No key, nothing leaves the box.
 *   3. Your own keys   — any OpenAI-compatible endpoint, encrypted at rest.
 *
 * The marks are original geometric glyphs, not copied brand assets. They read as a
 * coherent set and avoid using anyone's trademark as decoration.
 */

type Mechanism = 'host' | 'local' | 'key';

interface Source {
  name: string;
  detail: string;
  mechanism: Mechanism;
  mark: React.ReactNode;
  status: 'supported' | 'planned';
}

const MECHANISM_LABEL: Record<Mechanism, string> = {
  host: 'No API key — your seat',
  local: 'No API key — your machine',
  key: 'Your key, encrypted',
};

const MECHANISM_COLOR: Record<Mechanism, string> = {
  host: 'var(--color-state-pass)',
  local: 'var(--color-frosted-lilac)',
  key: 'var(--color-ash)',
};

const SOURCES: Source[] = [
  {
    name: 'Claude Code',
    detail: 'Runs Leverage as an MCP server and lends its own model back as a worker.',
    mechanism: 'host',
    status: 'supported',
    mark: <MarkSpark />,
  },
  {
    name: 'Codex',
    detail: 'Same MCP sampling channel. Your seat, your rate limit, no key handed over.',
    mechanism: 'host',
    status: 'supported',
    mark: <MarkHex />,
  },
  {
    name: 'Cursor · Windsurf · Zed',
    detail: 'Any MCP host that offers the sampling capability can be hired from.',
    mechanism: 'host',
    status: 'supported',
    mark: <MarkCaret />,
  },
  {
    name: 'Ollama',
    detail: 'Every model you have pulled, discovered automatically. Nothing leaves the machine.',
    mechanism: 'local',
    status: 'supported',
    mark: <MarkRings />,
  },
  {
    name: 'OpenAI-compatible',
    detail: 'LM Studio, vLLM, llama.cpp, OpenRouter, a gateway of your own — one base URL.',
    mechanism: 'key',
    status: 'supported',
    mark: <MarkGrid />,
  },
  {
    name: 'RocketRide',
    detail: 'The execution fabric. Worker pipelines, traces and token accounting.',
    mechanism: 'key',
    status: 'supported',
    mark: <MarkArrow />,
  },
];

export function ConnectSources() {
  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Bring your own intelligence
          </div>
          <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            Connect what you already pay for.
          </h2>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Leverage discovers what it can reach and keeps it in sync. The best route is the
            one that needs no key at all: run Leverage inside the agent you already use, and
            it can hire that agent&rsquo;s own model through MCP sampling.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SOURCES.map((s, i) => (
            <Reveal key={s.name} delay={i * 55}>
              <div className="surface-card group h-full p-5 transition-colors duration-200 hover:border-[var(--color-sapphire-hairline)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[var(--color-frosted-lilac)] transition-transform duration-300 group-hover:scale-105">
                    {s.mark}
                  </div>
                  <span
                    className="mono shrink-0 text-[10px] uppercase tracking-[0.06em]"
                    style={{ color: MECHANISM_COLOR[s.mechanism] }}
                  >
                    {MECHANISM_LABEL[s.mechanism]}
                  </span>
                </div>
                <div className="mt-4 text-[16px] text-[var(--color-quartz)]">{s.name}</div>
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-ash)]">
                  {s.detail}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={120}>
          <div className="surface-highlight mt-8 p-6">
            <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
              What we will not do
            </div>
            <p className="mt-3 max-w-[52rem] text-[14px] leading-relaxed text-[var(--color-mist)]">
              We will not drive a logged-in browser session to borrow a consumer subscription.
              ChatGPT Plus and Claude Pro have no API, and anything that claims to
              &ldquo;connect&rdquo; one is automating a web UI against its terms with your
              credentials. MCP sampling gets you the same model, legitimately, and Leverage
              never sees a password or a token.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- marks */
/* Original geometry on a shared 28-unit grid, monochrome, currentColor.      */

function MarkSpark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 3.5 16.4 11 24 14l-7.6 3L14 24.5 11.6 17 4 14l7.6-3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function MarkHex() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M14 3.2 23 8.6v10.8L14 24.8 5 19.4V8.6Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <circle cx="14" cy="14" r="3.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function MarkCaret() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M8 8.5 14 14l-6 5.5M15.5 19.5H21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="3.5" y="3.5" width="21" height="21" rx="5" stroke="currentColor" strokeWidth="1.2" opacity="0.45" />
    </svg>
  );
}

function MarkRings() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <ellipse cx="14" cy="14" rx="10.2" ry="5.4" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx="14" cy="14" rx="5.4" ry="10.2" stroke="currentColor" strokeWidth="1.4" opacity="0.5" />
      <circle cx="14" cy="14" r="2.2" fill="currentColor" />
    </svg>
  );
}

function MarkGrid() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      {[5, 12.4, 19.8].map((x) =>
        [5, 12.4, 19.8].map((y) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width="3.2"
            height="3.2"
            rx="0.8"
            fill="currentColor"
            opacity={x === 12.4 && y === 12.4 ? 1 : 0.45}
          />
        )),
      )}
    </svg>
  );
}

function MarkArrow() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" fill="none" aria-hidden="true">
      <path d="M5 20.5 20.5 5M13 5h7.5v7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14.5v8.5h8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" opacity="0.45" />
    </svg>
  );
}
