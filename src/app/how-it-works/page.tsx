import type { Metadata } from 'next';
import { Callout, Code, ContentPage, H2, Prose } from '@/components/marketing/page-shell';
import { Reveal } from '@/components/visual/motion';

export const metadata: Metadata = {
  title: 'How it works · Leverage',
  description:
    'The four layers of Leverage, the decisions that make it an intelligence resource manager rather than a router, and the invariants that hold it together.',
};

const LAYERS: [string, string, string][] = [
  [
    'Host model',
    'Claude · Codex · Kimi · Cursor',
    'Strategy. Called once for intent, not for every unit of work. Calling it for everything is the problem this exists to solve.',
  ],
  [
    'Leverage',
    'the control plane',
    'Owns the task graph, the auction, the budget policy, the context each worker receives, and the verification of whatever comes back.',
  ],
  [
    'RocketRide',
    'the execution fabric',
    'How a worker actually runs. Pipelines, traces, token accounting. Leverage never re-implements any of it.',
  ],
  [
    'Compute pool',
    'Ollama · free routes · your seat',
    'The models themselves. Discovered, health-checked and ranked, never hard-coded.',
  ],
];

const STAGES: [string, string][] = [
  ['Compile', 'A sentence becomes a validated MissionSpec. Budget and privacy are parsed here, with no model call, because policy must not depend on an LLM.'],
  ['Plan', 'A task graph, cycle-checked before anything executes. A planner is untrusted; its output is a proposal until it survives validation.'],
  ['Filter', 'Hard eligibility. A paid model at $0 is removed from the pool, not out-ranked. If policy were a weight, a good enough score could buy past it.'],
  ['Hire', 'Survivors are scored on task fit, measured reputation, context headroom, availability and latency. The winner is shown with its reasoning.'],
  ['Compile context', 'Writable scope, the tests it must satisfy, what its dependencies actually produced, and its own failure history. Nothing else.'],
  ['Execute', 'A RocketRide pipeline for cloud workers; a direct call for local ones. Both real; only the fabric differs.'],
  ['Verify', 'A compiler, a test runner or the filesystem. Model self-confidence is recorded separately and weighted least.'],
  ['Recover', 'On failure, keep the understanding and replace the worker. A checkpoint carries decisions and remaining work, never the transcript.'],
  ['Learn', 'The outcome becomes an observation. Rates are shrunk toward a prior so two runs can never read as certainty.'],
];

export default function HowItWorksPage() {
  return (
    <ContentPage
      eyebrow="How it works"
      title="An intelligence resource manager."
      intro="Routing, fallback and delegation are primitives Leverage uses. None of them is the product. The product is the layer that decides what work exists, who should do it, what it may cost, and whether the output is true."
    >
      <H2>Four layers</H2>
      <div className="mt-8 space-y-3">
        {LAYERS.map(([name, sub, what], i) => (
          <Reveal key={name} delay={i * 70} className="min-w-0">
            <div className="surface-card flex flex-col gap-3 p-6 md:flex-row md:items-baseline md:gap-8">
              <div className="md:w-[210px] md:shrink-0">
                <div className="text-[16px] text-[var(--color-quartz)]">{name}</div>
                <div className="mono mt-1 text-[11px] text-[var(--color-ash)]">{sub}</div>
              </div>
              <p className="text-[14px] leading-relaxed text-[var(--color-ash)]">{what}</p>
            </div>
          </Reveal>
        ))}
      </div>

      <H2>One task, start to finish</H2>
      <div className="mt-8">
        {STAGES.map(([name, what], i) => (
          <Reveal key={name} delay={i * 45} className="min-w-0">
            <div className="flex gap-5 border-l border-[var(--color-obsidian-edge)] pb-7 pl-6 last:pb-0">
              <div className="-ml-[31px] mt-1 h-2.5 w-2.5 shrink-0 rounded-full border border-[var(--color-sapphire-hairline)] bg-[var(--color-abyss)]" />
              <div className="min-w-0">
                <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
                  {String(i + 1).padStart(2, '0')} · {name}
                </div>
                <p className="mt-2 max-w-[42rem] text-[14.5px] leading-relaxed text-[var(--color-ash)]">
                  {what}
                </p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>

      <H2>The invariants</H2>
      <Prose>
        <p>
          These are the properties the product&rsquo;s claims rest on. If one fails, something in
          the copy has become a lie. So each is asserted in{' '}
          <code className="mono">tests/invariants.test.ts</code> rather than merely intended.
        </p>
      </Prose>
      <Code label="53 tests, run with npm run test">{`no task runs before every dependency has PASSED
a failed dependency blocks permanently, it is not retried forever
a hard budget cannot be overshot, including by concurrent reservations
a paid model is INELIGIBLE at $0, not merely out-ranked
a checkpoint is materially smaller than the context it replaces
a credential never reaches the event log, by value shape or key name
a path that escapes the repository is refused
a model with one observation never reports a confident success rate`}</Code>

      <H2>Why policy runs before scoring</H2>
      <Prose>
        <p>
          The single most important ordering decision in the system. A paid model under a $0
          budget is removed from the pool entirely and displayed struck out with the reason,
          never scored down and left competing. If policy were a weight, a sufficiently good
          score could buy past it, and &ldquo;zero means zero&rdquo; would be a preference
          rather than a guarantee.
        </p>
        <p>
          The budget governor reinforces it from the other side: workers run concurrently, so
          headroom is <em>reserved</em> before a call rather than checked. Without that, four
          workers each ask &ldquo;is there $0.05 left?&rdquo; simultaneously and all four proceed.
        </p>
      </Prose>

      <Callout title="Infrastructure failure is not the model's fault">
        A model that returns malformed output or fails tests is barred from that task. A model
        that hits a 429 or a timeout goes on a one-auction cooldown and can be hired again. Before
        that distinction existed, a single injected rate limit permanently benched the strongest
        candidate and the task failed on weaker workers. That bug only surfaced by watching a
        real run.
      </Callout>

      <H2>Context is compiled, not dumped</H2>
      <Prose>
        <p>
          The economics only work if workers are cheap, and workers are only cheap if they are not
          handed the whole repository. A worker receives its writable file scope, the read-only
          files it must satisfy, the actual output of completed dependencies, and its own failure
          history.
        </p>
        <p>
          This was learned the hard way. The first implementation gave workers only their write
          scope, so every model was guessing the API contract of files it could not see. Adding
          read-only references took the benchmark from 0/4 to 2/4; adding dependency outputs took
          it from 2/4 to 4/4.
        </p>
      </Prose>
    </ContentPage>
  );
}
