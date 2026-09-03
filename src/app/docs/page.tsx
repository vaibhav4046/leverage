import Link from 'next/link';
import type { Metadata } from 'next';
import { Callout, Code, ContentPage, H2, Prose } from '@/components/marketing/page-shell';
import { Reveal } from '@/components/visual/motion';

export const metadata: Metadata = {
  title: 'Docs — Leverage',
  description: 'Install Leverage, connect intelligence you already pay for, and run your first mission.',
};

const SOURCES: [string, string, string][] = [
  ['Your agent CLI', 'none', 'Already installed and logged in — claude, codex, gemini, opencode.'],
  ['Your MCP host seat', 'none', 'Run Leverage inside your agent; it samples the host model.'],
  ['Ollama', 'none', 'Every model you have pulled. Nothing leaves the machine.'],
  ['OpenAI-compatible', 'yours', 'LM Studio, vLLM, llama.cpp, a gateway of your own.'],
];

export default function DocsPage() {
  return (
    <ContentPage
      eyebrow="Docs"
      title="Running in about two minutes."
      intro="Leverage needs one source of intelligence and one execution fabric. The fastest path uses something you already have and asks for no API key at all."
    >
      <H2>Install</H2>
      <Code>{`git clone <your fork> leverage
cd leverage
npm install
cp .env.example .env.local`}</Code>

      <H2>Connect intelligence</H2>
      <Prose>
        <p>
          At least one of these. Ordered by least setup — the first two need no key because
          your subscription already paid for the model.
        </p>
      </Prose>

      <div className="surface-card mt-6 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left">
          <caption className="sr-only">Supported intelligence sources</caption>
          <thead>
            <tr className="border-b border-[var(--color-obsidian-edge)]">
              {['Source', 'Key needed', 'What it is'].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="mono px-5 py-3 text-[10px] uppercase tracking-[0.08em] text-[var(--color-ash)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SOURCES.map(([name, key, what]) => (
              <tr key={name} className="border-b border-[var(--color-inkline)] last:border-0">
                <td className="px-5 py-3.5 text-[14px] text-[var(--color-quartz)]">{name}</td>
                <td className="mono px-5 py-3.5 text-[12px]">
                  <span
                    style={{
                      color: key === 'none' ? 'var(--color-state-pass)' : 'var(--color-ash)',
                    }}
                  >
                    {key}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-[13px] text-[var(--color-ash)]">{what}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Prose>
        <p className="mt-6">
          Leverage detects agent CLIs on <code className="mono">PATH</code> and probes whether
          each is signed in. One that is installed but signed out is excluded from the auction
          with the command that fixes it, rather than hired and left to fail.
        </p>
      </Prose>

      <Callout title="What Leverage will not do" tone="warn">
        Drive a logged-in browser session to borrow a consumer subscription. ChatGPT Plus and
        Claude Pro have no API, and anything claiming to &ldquo;connect&rdquo; one is automating
        a web UI against its terms using your credentials. The two key-free routes above reach
        the same model legitimately, and Leverage never handles a password or a token.
      </Callout>

      <H2>Connect the execution fabric</H2>
      <Prose>
        <p>
          RocketRide runs the worker pipelines. Sign in through its CLI so no key passes through
          your clipboard:
        </p>
      </Prose>
      <Code>{`pnpm exec rocketride login     # writes ROCKETRIDE_APIKEY into .env
npm run verify:rocketride      # proves the whole path end to end`}</Code>
      <Prose>
        <p>
          The endpoint is <code className="mono">https://staging.rocketride.ai</code>. Note that
          the published SDK docs name a different host; the running system disagrees with them in
          three places, all recorded in{' '}
          <code className="mono">docs/ROCKETRIDE_FINDINGS.md</code>.
        </p>
      </Prose>

      <H2>Run a mission</H2>
      <Code>{`npm run probe:models    # measure what your models can actually do
npm run mission         # the benchmark mission, for real
npm run dev             # Mission Control at http://localhost:3000`}</Code>
      <Prose>
        <p>
          The probe is worth running first. It costs a couple of minutes and stops the auction
          hiring a model that returns an empty response to every structured request — which is a
          real failure mode, not a hypothetical one.
        </p>
      </Prose>

      <H2>Next</H2>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {[
          ['/docs/mcp', 'Install the MCP server', 'Use Leverage from inside Claude Code, Codex or Cursor.'],
          ['/how-it-works', 'How it works', 'The four layers, and why they are separate.'],
          ['/benchmarks', 'Benchmarks', 'Measured results and the comparisons we do not make.'],
          ['/demo', 'The demo', 'A playable prototype the workers wrote, beside its proof.'],
        ].map(([href, title, sub], i) => (
          <Reveal key={href} delay={i * 60} className="min-w-0">
            <Link
              href={href}
              className="surface-card block h-full p-5 transition-colors hover:border-[var(--color-sapphire-hairline)]"
            >
              <div className="text-[15px] text-[var(--color-quartz)]">{title}</div>
              <div className="mt-1.5 text-[13px] text-[var(--color-ash)]">{sub}</div>
            </Link>
          </Reveal>
        ))}
      </div>
    </ContentPage>
  );
}
