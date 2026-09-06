'use client';

import { useState } from 'react';

/**
 * Things Leverage built, hosted here so a visitor can use them, not watch them.
 *
 * Each entry is a repository where the tests were written first and a mission
 * hired the workers that made them pass. The static builds live under
 * public/play, copied from those repositories unchanged.
 */
export interface PlaygroundBuild {
  id: string;
  name: string;
  kind: string;
  /** Path under this site that serves the build's own index.html. */
  src: string;
  blurb: string;
  controls: string;
  facts: string[];
  /** What leaves the visitor's browser, if anything. Shown under the frame. */
  note: string;
}

export function Playground({ builds }: { builds: PlaygroundBuild[] }) {
  const [activeId, setActiveId] = useState(builds[0]?.id ?? '');
  const [mounted, setMounted] = useState<Record<string, boolean>>({});
  const active = builds.find((b) => b.id === activeId) ?? builds[0];
  if (!active) return null;

  const play = (id: string) => {
    setActiveId(id);
    setMounted((m) => ({ ...m, [id]: true }));
  };

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Play what it built
        </div>
        <h2 className="heading mt-3 max-w-[42rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          Not a screenshot. The actual build, running here.
        </h2>
        <p className="mt-4 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          The tests were written first. A mission hired the workers and every module was verified by
          running those tests. Quill&apos;s surface was given as a shell, the way a canvas is given to
          a game; its Node server is replaced here by a small browser shim so you can use it with
          your own model endpoint.
        </p>

        <div className="mt-10 grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="flex gap-2 overflow-x-auto lg:flex-col" role="tablist" aria-label="Builds">
            {builds.map((b) => {
              const isActive = b.id === active.id;
              return (
                <button
                  key={b.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => play(b.id)}
                  className={`surface-card min-w-[220px] shrink-0 p-4 text-left transition-colors ${
                    isActive ? 'border-[var(--color-frosted-lilac)]' : 'hover:border-[var(--color-mist)]'
                  }`}
                >
                  <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
                    {b.kind}
                  </div>
                  <div
                    className="mt-1 text-[18px]"
                    style={{ fontFamily: 'var(--font-display)', fontWeight: 500, color: 'var(--color-quartz)' }}
                  >
                    {b.name}
                  </div>
                  <ul className="mt-2 space-y-0.5">
                    {b.facts.map((f) => (
                      <li key={f} className="text-[12px] text-[var(--color-ash)]">
                        {f}
                      </li>
                    ))}
                  </ul>
                </button>
              );
            })}
          </div>

          <div className="surface-card overflow-hidden">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--color-obsidian-edge)] px-5 py-3">
              <div className="text-[14px] text-[var(--color-mist)]">{active.blurb}</div>
              <div className="mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-ash)]">
                {active.controls}
              </div>
            </div>
            <div className="relative aspect-[16/10] w-full bg-[#0b0c0e]">
              {mounted[active.id] ? (
                <iframe
                  key={active.id}
                  src={active.src}
                  title={active.name}
                  className="absolute inset-0 h-full w-full"
                  loading="lazy"
                  sandbox="allow-scripts allow-same-origin allow-forms"
                  onLoad={(e) => e.currentTarget.contentWindow?.focus()}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => play(active.id)}
                  className="absolute inset-0 grid place-items-center text-[var(--color-quartz)]"
                >
                  <span className="rounded-full border border-[var(--color-frosted-lilac)] px-6 py-3 text-[14px] transition-colors hover:bg-[var(--color-frosted-lilac)] hover:text-[var(--color-abyss)]">
                    Load {active.name}
                  </span>
                </button>
              )}
            </div>
            <div className="px-5 py-3 text-[12px] text-[var(--color-ash)]">{active.note}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
