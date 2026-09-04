'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MissionEvent } from '@/core/types';

/**
 * The handoff, as a thing you can drive.
 *
 * A recording of this would be easier and would be a lie by omission: a video
 * proves only that someone rendered a video. This replays the actual event log
 * from `demo/canonical-run.json` on its real elapsed timings, so scrubbing to
 * 01:23.8 shows what the scheduler was doing at 01:23.8 of a mission that ran.
 *
 * It is the most load-bearing interaction on the site, because the product's whole
 * claim is "do not trust the model, read the evidence". This is that evidence, made
 * legible instead of described.
 *
 * Timeline is compressed: real missions have minute-long gaps between events while
 * a model thinks, and watching a progress bar creep is not informative. Gaps are
 * clamped, and the compression is stated in the UI rather than hidden.
 */

export interface HandoffStep {
  seq: number;
  type: MissionEvent['type'];
  message: string;
  elapsedMs: number;
  worker?: string;
}

const MAX_GAP_MS = 1400;
const MIN_GAP_MS = 320;

export function HandoffPlayer({ steps }: { steps: HandoffStep[] }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  // Compressed gaps, derived once. Real elapsed times are still displayed; only
  // the wait between them is shortened.
  const gaps = useMemo(
    () =>
      steps.map((s, i) => {
        if (i === 0) return MIN_GAP_MS;
        const real = s.elapsedMs - steps[i - 1].elapsedMs;
        return Math.min(MAX_GAP_MS, Math.max(MIN_GAP_MS, real));
      }),
    [steps],
  );

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const advance = useCallback(() => {
    setIndex((i) => {
      if (i >= steps.length - 1) {
        setPlaying(false);
        return i;
      }
      return i + 1;
    });
  }, [steps.length]);

  useEffect(() => {
    clear();
    if (!playing) return;
    if (index >= steps.length - 1) {
      setPlaying(false);
      return;
    }
    timer.current = setTimeout(advance, gaps[index + 1] ?? MIN_GAP_MS);
    return clear;
  }, [playing, index, gaps, steps.length, advance]);

  // Autoplay once, on first scroll into view. Never loops, because a looping animation
  // beside a static reader is noise, and this is meant to be read.
  const [hasPlayed, setHasPlayed] = useState(false);
  useEffect(() => {
    if (hasPlayed) return;
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIndex(steps.length - 1);
      setHasPlayed(true);
      return;
    }
    const start = () => {
      setHasPlayed(true);
      setPlaying(true);
    };

    // A fractional threshold is unreachable for a section taller than
    // viewport/threshold, so autoplay silently never fires. Same class of bug as a
    // reveal that never reveals: check the geometry directly, and use the observer
    // only for the not-yet-visible case.
    const rect = el.getBoundingClientRect();
    const onScreen = rect.top < window.innerHeight * 0.75 && rect.bottom > 0;
    if (onScreen) {
      start();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        start();
      },
      { rootMargin: '0px 0px -25% 0px', threshold: 0.01 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPlayed, steps.length]);

  const visible = steps.slice(0, index + 1);
  const current = steps[index];
  const atEnd = index >= steps.length - 1;

  return (
    <section
      ref={sectionRef}
      className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Cognitive handoff · replay
        </div>
        <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          Drive it yourself.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          Not a recording. This replays the recorded mission&rsquo;s own event log at its real
          elapsed timings. Scrub to any point and you are looking at what the scheduler was
          actually doing at that moment.
        </p>

        <div className="mt-10 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
          {/* ---------------------------------------------------- stage */}
          <div className="surface-card min-w-0 overflow-hidden">
            <div className="border-b border-[var(--color-obsidian-edge)] px-5 py-3">
              <div className="mono flex items-center justify-between text-[11px] text-[var(--color-ash)]">
                <span className="uppercase tracking-[0.08em]">Stage</span>
                <span className="tabular-nums text-[var(--color-frosted-lilac)]">
                  {formatElapsed(current?.elapsedMs ?? 0)}
                </span>
              </div>
            </div>

            <div className="flex min-h-[268px] flex-col justify-center gap-4 p-6">
              <StageGraphic step={current} />
            </div>
          </div>

          {/* ---------------------------------------------------- log */}
          <div className="surface-card min-w-0 overflow-hidden">
            <div className="mono border-b border-[var(--color-obsidian-edge)] px-5 py-3 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
              Event log · {index + 1} of {steps.length}
            </div>
            <ul className="max-h-[268px] min-h-[268px] overflow-y-auto">
              {visible.map((s, i) => (
                <li
                  key={s.seq}
                  className="flex gap-3 border-b border-[var(--color-inkline)] px-5 py-2.5 last:border-0"
                  style={{ opacity: i === index ? 1 : 0.45 }}
                >
                  <span className="mono w-[62px] shrink-0 tabular-nums text-[11px] leading-5 text-[var(--color-ash)]">
                    {formatElapsed(s.elapsedMs)}
                  </span>
                  <span
                    className="mono w-[124px] shrink-0 truncate text-[11px] leading-5"
                    style={{ color: toneFor(s.type) }}
                  >
                    {s.type}
                  </span>
                  <span className="mono min-w-0 flex-1 text-[11px] leading-5 text-[var(--color-mist)]">
                    {s.message}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ------------------------------------------------------- controls */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <button
            type="button"
            onClick={() => {
              if (atEnd) {
                setIndex(0);
                setPlaying(true);
              } else {
                setPlaying((p) => !p);
              }
            }}
            className="btn-primary !py-2 !text-[13px]"
          >
            {atEnd ? 'Replay' : playing ? 'Pause' : 'Play'}
          </button>

          <input
            type="range"
            min={0}
            max={steps.length - 1}
            value={index}
            aria-label="Scrub the handoff timeline"
            onChange={(e) => {
              setPlaying(false);
              setIndex(Number(e.target.value));
            }}
            className="h-1 min-w-[180px] flex-1 cursor-pointer appearance-none rounded-full bg-[var(--color-obsidian-edge)] accent-[var(--color-frosted-lilac)]"
          />

          <span className="mono min-w-0 text-[11px] text-[var(--color-ash)] opacity-75">
            gaps compressed for replay · timestamps are real
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- stage */

/**
 * A diagram of what the scheduler is doing right now.
 *
 * Deliberately three boxes and an arrow rather than an elaborate visualisation:
 * the point is small and specific: the worker changed, the understanding did
 * not. A busier graphic would bury it.
 */
function StageGraphic({ step }: { step?: HandoffStep }) {
  if (!step) return null;

  const phase = phaseFor(step.type);

  return (
    <>
      <div className="flex items-center gap-3">
        <Node
          label={step.worker ?? 'worker'}
          state={phase === 'failing' ? 'fail' : phase === 'replaced' ? 'gone' : 'active'}
        />
        <Arrow lit={phase === 'checkpoint' || phase === 'replaced' || phase === 'resumed'} />
        <Node
          label="checkpoint"
          state={
            phase === 'checkpoint' || phase === 'replaced' || phase === 'resumed' || phase === 'done'
              ? 'carry'
              : 'idle'
          }
        />
        <Arrow lit={phase === 'replaced' || phase === 'resumed' || phase === 'done'} />
        <Node
          label="replacement"
          state={phase === 'done' ? 'pass' : phase === 'replaced' || phase === 'resumed' ? 'active' : 'idle'}
        />
      </div>

      <p className="mt-2 text-[14px] leading-relaxed text-[var(--color-mist)]">{step.message}</p>

      <div
        className="mono text-[11px] uppercase tracking-[0.08em]"
        style={{ color: toneFor(step.type) }}
      >
        {step.type}
      </div>
    </>
  );
}

type NodeState = 'idle' | 'active' | 'fail' | 'gone' | 'carry' | 'pass';

const NODE_STYLE: Record<NodeState, { border: string; text: string; bg: string; opacity: number }> = {
  idle: { border: 'var(--color-inkline)', text: 'var(--color-slate)', bg: 'transparent', opacity: 0.5 },
  active: { border: 'var(--color-quartz)', text: 'var(--color-quartz)', bg: 'rgba(255,255,255,0.04)', opacity: 1 },
  fail: { border: 'rgba(248,113,113,0.6)', text: 'var(--color-state-fail)', bg: 'rgba(248,113,113,0.07)', opacity: 1 },
  gone: { border: 'var(--color-inkline)', text: 'var(--color-slate)', bg: 'transparent', opacity: 0.35 },
  carry: { border: 'rgba(251,191,36,0.6)', text: 'var(--color-state-warn)', bg: 'rgba(251,191,36,0.07)', opacity: 1 },
  pass: { border: 'rgba(74,222,128,0.6)', text: 'var(--color-state-pass)', bg: 'rgba(74,222,128,0.07)', opacity: 1 },
};

function Node({ label, state }: { label: string; state: NodeState }) {
  const s = NODE_STYLE[state];
  return (
    <div
      className="mono min-w-0 flex-1 truncate rounded-[10px] border px-3 py-3 text-center text-[11px] transition-all duration-300"
      style={{ borderColor: s.border, color: s.text, background: s.bg, opacity: s.opacity }}
    >
      {label}
    </div>
  );
}

function Arrow({ lit }: { lit: boolean }) {
  return (
    <div
      className="h-px w-5 shrink-0 transition-colors duration-300"
      style={{ background: lit ? 'var(--color-frosted-lilac)' : 'var(--color-inkline)' }}
    />
  );
}

/* ------------------------------------------------------------------ helpers */

type Phase = 'running' | 'failing' | 'checkpoint' | 'replaced' | 'resumed' | 'done';

function phaseFor(type: string): Phase {
  if (type.includes('rate_limit') || type === 'worker.failed') return 'failing';
  if (type.includes('checkpoint')) return 'checkpoint';
  if (type.includes('handoff') || type === 'worker.released') return 'replaced';
  if (type === 'worker.hired' || type === 'worker.started') return 'resumed';
  if (type.includes('passed') || type.includes('completed')) return 'done';
  return 'running';
}

function toneFor(type: string): string {
  if (type.includes('failed') || type.includes('rate_limit')) return 'var(--color-state-fail)';
  if (type.includes('checkpoint') || type.includes('handoff')) return 'var(--color-state-warn)';
  if (type.includes('passed') || type.includes('completed')) return 'var(--color-state-pass)';
  if (type.startsWith('auction') || type.startsWith('worker')) return 'var(--color-frosted-lilac)';
  return 'var(--color-ash)';
}

function formatElapsed(ms: number): string {
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}
