import Link from 'next/link';
import { Reveal } from '@/components/visual/motion';
import { IconArrowRight } from '@/components/icons';

const HOST_CONFIG = `{
  "mcpServers": {
    "leverage": {
      "command": "node",
      "args": ["/abs/path/to/leverage/mcp/server.ts"],
      "env": { "LEVERAGE_API_URL": "http://localhost:3000" }
    }
  }
}`;

const TOOLS = ['leverage_run', 'leverage_status', 'leverage_cancel', 'leverage_proof', 'leverage_models'];

/**
 * Where a desktop product offers a download per operating system, an MCP server
 * offers an install per host. Three cards, one command or config each, all
 * taken from docs/mcp so the page and the docs cannot disagree.
 */
export function Install() {
  return (
    <section
      id="install"
      className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            Install
          </div>
          <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
            Give your host a workforce. Pick your host.
          </h2>
          <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
            Five tools, not forty. A strategist needs to state an outcome, watch it, stop it, and
            inspect the evidence; everything else is Leverage&rsquo;s job. The server talks to a
            running Leverage instance, so start one with <span className="mono">npm run dev</span>{' '}
            first.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-4 md:grid-cols-3">
          <Host
            name="Claude Code"
            note="One command. If the host offers sampling, its own model is hired back as a worker."
            code="claude mcp add leverage -- node /abs/path/to/leverage/mcp/server.ts"
          />
          <Host name="Codex" note="Add the server to the host config. Same tools, same sampling channel." code={HOST_CONFIG} delay={70} />
          <Host
            name="Cursor · Windsurf · Zed"
            note="Any host that speaks MCP. Any host that also offers sampling can lend its seat."
            code={HOST_CONFIG}
            delay={140}
          />
        </div>

        <Reveal delay={120}>
          <div className="surface-highlight mt-6 grid gap-6 p-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-center">
            <div className="min-w-0">
              <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
                Then, inside the host
              </div>
              <pre className="mono mt-3 overflow-x-auto text-[13px] leading-relaxed text-[var(--color-quartz)]">
                Use Leverage. Finish this application. Budget $0. Quality production.
              </pre>
              <ul className="mono mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] text-[var(--color-ash)]">
                {TOOLS.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-3 lg:items-end">
              <p className="text-[13.5px] leading-relaxed text-[var(--color-mist)] lg:text-right">
                Nothing to download here, and nothing to sign up for. If you would rather press a
                button than install, the live page runs a bounded mission inside this deployment.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/app/live" className="btn-primary inline-flex items-center gap-2">
                  Run a real mission now
                  <IconArrowRight size={15} />
                </Link>
                <Link href="/docs/mcp" className="btn-ghost inline-flex items-center">
                  MCP docs
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Host({ name, note, code, delay = 0 }: { name: string; note: string; code: string; delay?: number }) {
  return (
    <Reveal delay={delay} className="min-w-0">
      <div className="surface-card flex h-full min-w-0 flex-col overflow-hidden">
        <div className="border-b border-[var(--color-obsidian-edge)] px-5 py-4">
          <h3 className="text-[16px] text-[var(--color-quartz)]">{name}</h3>
          <p className="mt-1 text-[12.5px] leading-relaxed text-[var(--color-ash)]">{note}</p>
        </div>
        <pre className="mono min-w-0 flex-1 overflow-x-auto px-5 py-4 text-[11.5px] leading-[1.65] text-[var(--color-mist)]">
          {code}
        </pre>
      </div>
    </Reveal>
  );
}
