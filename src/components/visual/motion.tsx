'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Motion primitives.
 *
 * Two rules the whole file obeys:
 *   - motion communicates a state change, it never decorates;
 *   - `prefers-reduced-motion` skips straight to the final state rather than
 *     playing a faster version of the same animation.
 *
 * Everything animates `transform` and `opacity` only, so nothing here can cause a
 * layout pass mid-scroll.
 */

function prefersReduced(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reveal on first entry into the viewport.
 *
 * Renders **visible** from the server and only hides itself once the client has
 * confirmed it is below the fold. The obvious implementation, start at opacity 0,
 * reveal on intersect, ships a page that is entirely invisible until hydration
 * finishes, and permanently invisible if it never does. That is a content bug
 * wearing an animation costume, and it is exactly what happened here the first time.
 *
 * So: server output is plain visible content. The hide only ever happens in a
 * layout effect, before paint, and only for elements the viewport cannot see yet.
 */
export function Reveal({
  children,
  delay = 0,
  y = 18,
  className = '',
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;

    // Written straight to the node rather than through state. This is a pre-paint
    // visual adjustment, so a render cycle buys nothing and setState inside a
    // layout effect is how you get cascading renders.
    const rect = el.getBoundingClientRect();
    if (rect.top <= window.innerHeight * 0.9) return; // already on screen: leave it

    const show = () => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    };

    el.style.opacity = '0';
    el.style.transform = `translateY(${y}px)`;
    // On a throttled phone the observer can lag a flick by seconds, which reads
    // as blank screens. Whatever happens, nothing stays hidden past this.
    setTimeout(show, 1400);
    el.style.transition =
      `opacity 620ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, ` +
      `transform 620ms cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        show();
        observer.disconnect();
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.01 },
    );
    observer.observe(el);

    // Belt and braces: if the observer never fires for any reason, the content
    // still appears. Invisible content is never an acceptable resting state.
    const failsafe = setTimeout(show, 3000);

    return () => {
      observer.disconnect();
      clearTimeout(failsafe);
    };
  }, [delay, y]);

  // Server output is plain, visible content. Everything above is enhancement.
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/**
 * Count up to a real measured value when it scrolls into view.
 *
 * `value` must be something the run actually produced. Animating toward an invented
 * number would be the most persuasive possible way to lie, which is exactly why the
 * component takes a number rather than generating one.
 */
export function Counter({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durationMs = 1100,
  className = '',
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  durationMs?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // Starts at the true value so the server renders the real number. The count-up
  // is an enhancement, never the source of the figure.
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (prefersReduced()) return;
    const el = ref.current;
    if (!el) return;

    let raf = 0;
    const animate = () => {
        // The figure is evidence: it must never read as anything but itself. The
        // count-up used to reset to zero on mount, so a page whose argument is
        // "check the number" showed a wrong number for a second. The value now
        // stays put and only settles in opacity.
        const start = performance.now();
        el.style.opacity = '0.35';
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / durationMs);
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          el.style.opacity = String(0.35 + 0.65 * eased);
          if (t < 1) raf = requestAnimationFrame(tick);
          else el.style.opacity = '';
        };
        setDisplay(value);
        raf = requestAnimationFrame(tick);
    };

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight) {
      animate();
      return () => cancelAnimationFrame(raf);
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        animate();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {prefix}
      {display.toFixed(decimals)}
      {suffix}
    </span>
  );
}

/**
 * Step through a fixed sequence on a timer while visible.
 *
 * Used for the handoff walkthrough, where the point is that the reader sees the
 * order of events. It pauses off-screen so a background tab is not animating.
 */
export function useSequence(steps: number, intervalMs = 2200, enabled = true): number {
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled || prefersReduced() || steps <= 1) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => setIndex((i) => (i + 1) % steps), intervalMs);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    return stop;
  }, [steps, intervalMs, enabled]);

  void ref;
  return index;
}
