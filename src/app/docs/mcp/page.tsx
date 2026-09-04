import type { Metadata } from 'next';
import { Callout, Code, ContentPage, H2, Prose } from '@/components/marketing/page-shell';

export const metadata: Metadata = {
  title: 'MCP server · Leverage',
  description:
    'Install the Leverage MCP server so Claude Code, Codex or Cursor can run missions and lend their own model as a worker.',
};

const TOOLS: [string, string][] = [
  ['leverage_run', 'Start a mission. Returns a mission id immediately, because a mission takes minutes.'],
  ['leverage_status', 'Task states, hired workers, handoffs, spend, elapsed. Safe to poll.'],
  ['leverage_cancel', 'Stop it. No further hires; in-flight work is checkpointed where possible.'],
  ['leverage_proof', 'The evidence: every check, what it returned, files changed, real spend.'],
  ['leverage_models', 'The reachable workforce with each model cost class, health and record.'],
];

export default function McpPage() {
  return (
    <ContentPage
      eyebrow="Docs · MCP"
      title="Give your host a workforce."
      intro="Leverage speaks MCP in both directions: your host calls it to run missions, and it calls back to your host to borrow the model your subscription already pays for."
    >
      <H2>Install</H2>
      <Code label="Claude Code">{`claude mcp add leverage -- node /abs/path/to/leverage/mcp/server.ts`}</Code>
      <Code label="Any host config">{`{
  "mcpServers": {
    "leverage": {
      "command": "node",
      "args": ["/abs/path/to/leverage/mcp/server.ts"],
      "env": { "LEVERAGE_API_URL": "http://localhost:3000" }
    }
  }
}`}</Code>
      <Prose>
        <p>
          The server talks to a running Leverage instance, so start it with{' '}
          <code className="mono">npm run dev</code> first. Then, inside your host:
        </p>
      </Prose>
      <Code>{`Use Leverage. Finish this application. Budget $0. Quality production.`}</Code>

      <H2>The five tools</H2>
      <Prose>
        <p>
          Five, not forty. The host is a strategist, and a strategist needs to state an outcome,
          watch it, stop it, and inspect the evidence. Everything else is Leverage&rsquo;s job.
        </p>
      </Prose>
      <div className="surface-card mt-6 divide-y divide-[var(--color-inkline)]">
        {TOOLS.map(([name, desc]) => (
          <div key={name} className="px-5 py-4">
            <div className="mono text-[13px] text-[var(--color-frosted-lilac)]">{name}</div>
            <div className="mt-1.5 text-[13px] leading-relaxed text-[var(--color-ash)]">{desc}</div>
          </div>
        ))}
      </div>

      <H2>Lending your seat back</H2>
      <Prose>
        <p>
          If your host offers the sampling capability, the Leverage MCP server registers itself as
          a worker source. Leverage can then hire your host&rsquo;s own model through{' '}
          <code className="mono">sampling/createMessage</code>. No API key is minted, none is
          stored, and the inference is billed to the seat you already pay for.
        </p>
        <p>
          The control plane cannot initiate sampling. Only the process holding the protocol
          connection can, so the plane parks requests on a queue and the MCP server drains
          them: register, claim, sample, post back.
        </p>
      </Prose>
      <Code label="what you will see on stderr">{`leverage: Host seat registered. Leverage can now hire your own model with no API key.`}</Code>

      <Callout title="If the host declines sampling">
        You will see &ldquo;Host connected but did not offer the sampling capability, so it cannot
        take work.&rdquo; The tools still function; only the host-seat worker is unavailable. This
        is stated plainly because a host that connected without sampling looks connected and can
        never be hired, which is a confusing state to debug from silence.
      </Callout>

      <H2>Budget behaviour</H2>
      <Prose>
        <p>
          <code className="mono">leverage_run</code> defaults to{' '}
          <code className="mono">budgetMaxUsd: 0</code>, which is a hard block rather than a
          preference. Paid models never enter the ranking pool. Host and local workers are
          still eligible, because a subscription seat and a local runtime are not Leverage
          spending money.
        </p>
      </Prose>
      <Code>{`{
  "goal": "Finish the application and verify it",
  "budgetMaxUsd": 0,
  "qualityTarget": 0.95,
  "privacy": "prefer-local",
  "parallelism": 2
}`}</Code>
    </ContentPage>
  );
}
