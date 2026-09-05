import { Reveal } from '@/components/visual/motion';
import type { MissionSnapshot } from '@/core/mission';

/**
 * Questions a judge or a developer actually asks, answered from the docs and the
 * run files rather than from a marketing brief. Native details/summary: no
 * script, keyboard accessible, and the answer is in the HTML for anyone who
 * reads the page without JavaScript. Every mission-specific figure is computed
 * from the loaded run so an answer can never describe a mission the page did
 * not load.
 */
export function Faq({
  rocketRide,
  hosted,
  planned,
}: {
  rocketRide: MissionSnapshot | null;
  hosted: MissionSnapshot | null;
  planned: MissionSnapshot | null;
}) {
  const viaPipeline = rocketRide?.workers.filter((w) => w.costClass === 'free') ?? [];
  const tasksViaPipeline = new Set(viaPipeline.filter((w) => w.status === 'passed').map((w) => w.taskId));
  const hostedAllFree = hosted ? hosted.workers.every((w) => w.costClass === 'free') : false;

  const items: [string, React.ReactNode][] = [
    [
      'Do I need an API key or an account?',
      <>
        No. Leverage hires from the seat your MCP host already has, through sampling; from the
        agent CLIs already signed in on your PATH; from Ollama; and from free routes. The live page
        on this site needs nothing at all. A RocketRide key is optional on your own machine: with
        it, cloud workers run as pipelines; without it they are called directly, and the mission
        log says which happened.
      </>,
    ],
    [
      'Is $0.00 real, or a rounded estimate?',
      <>
        It is the settled paid spend from the run&rsquo;s own ledger. A paid model under a $0
        budget is removed from the auction before scoring, and the budget governor reserves
        headroom atomically before any paid call, so four concurrent workers cannot each see the
        last five cents and all proceed. Both are asserted in{' '}
        <code className="mono">tests/invariants.test.ts</code>. The one estimate on the site,
        frontier-equivalent cost, is labelled estimated everywhere it appears.
      </>,
    ],
    [
      'Does RocketRide actually do the work?',
      <>
        Every worker whose cost class is <span className="mono">free</span> runs as a RocketRide
        pipeline: <span className="mono">webhook → llm_openai_api → response</span>, with the
        auction&rsquo;s chosen model patched into the LLM node at deploy time. That is how model
        selection becomes model execution.
        {rocketRide && viaPipeline.length > 0 && (
          <>
            {' '}
            In mission <span className="mono">{rocketRide.mission.id}</span>, {viaPipeline.length} of{' '}
            {rocketRide.workers.length} workers ran that way and finished {tasksViaPipeline.size} of the{' '}
            {rocketRide.tasks.length} tasks.
          </>
        )}
        {hosted && hostedAllFree && (
          <>
            {' '}
            In <span className="mono">{hosted.mission.id}</span> every worker did, through the hosted
            pool.
          </>
        )}{' '}
        Credits are read from billing before and after each run.
      </>,
    ],
    [
      'The rate limit in the recorded run, is it real?',
      <>
        Injected, and labelled INJECTED in the event stream, in Mission Control and in the docs,
        because a demonstration of recovery should not depend on luck. A genuine 429 from{' '}
        <span className="mono">pool:auto/coding:free</span> appears independently in the capability
        probe, and two genuine test failures in the same run were handed off the same way.
      </>,
    ],
    [
      'Will it use my ChatGPT Plus or Claude Pro subscription?',
      <>
        Not by driving a logged-in browser session. Those plans have no API, and automating their
        web UI is against their terms and puts your credentials in the loop. Inside Claude Code,
        Codex or Cursor, Leverage borrows the host&rsquo;s own model through MCP sampling: the
        same model, legitimately, with no password or token ever handled.
      </>,
    ],
    [
      'Can I point it at my own repository?',
      <>
        Yes: <span className="mono">npm run mission -- --repo=/your/repo --goal=&quot;...&quot;</span>.
        A planner model reads the repository and its tests and proposes the task graph; the
        compiler rejects cycles, dangling edges, escaping paths and tasks with no check, and a
        rejected plan fails the mission with the reason rather than falling back silently.
        {planned && (
          <>
            {' '}
            Mission <span className="mono">{planned.mission.id}</span> on this site was planned that
            way.
          </>
        )}
      </>,
    ],
    [
      'What has it been proven on?',
      <>
        Every number on this page comes from a mission that ran inside this deployment: JavaScript
        and TypeScript repositories with their own test suites, a mission RocketRide executed, a
        mission a hosted pool served, and a mission whose plan a model wrote. Small local models
        fail often, and the handoff machinery exists because they do: every replacement recorded
        here happened during a real run, with the checkpoint and the resumed task in the log.
      </>,
    ],
  ];

  return (
    <section
      id="faq"
      className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:gap-14">
          <Reveal className="min-w-0">
            <div className="lg:sticky lg:top-24">
              <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                Questions
              </div>
              <h2 className="heading mt-3 text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
                Answered from the files, not the brief.
              </h2>
              <p className="mt-5 max-w-[32rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
                Each answer points at the test, the run or the document that backs it. If one
                stops being true, the copy is what is wrong.
              </p>
            </div>
          </Reveal>

          <Reveal delay={80} className="min-w-0">
            <div className="surface-card divide-y divide-[var(--color-inkline)] px-5 sm:px-6">
              {items.map(([q, a]) => (
                <details key={q} className="group">
                  <summary className="flex min-h-[56px] cursor-pointer list-none items-center justify-between gap-4 py-4 text-[15.5px] text-[var(--color-quartz)] [&::-webkit-details-marker]:hidden">
                    <span>{q}</span>
                    <span
                      aria-hidden
                      className="mono shrink-0 text-[18px] leading-none text-[var(--color-frosted-lilac)] transition-transform duration-200 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="pb-5 text-[14px] leading-relaxed text-[var(--color-ash)]">{a}</p>
                </details>
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
