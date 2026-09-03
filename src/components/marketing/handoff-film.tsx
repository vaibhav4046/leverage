'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The handoff, as a nine-second film.
 *
 * Rendered by HyperFrames from `motion/index.html` — a real composition with a
 * seekable timeline, not a screen recording — so the film reads the same design
 * tokens the page does and cannot drift away from the product's look.
 *
 * It sits above the interactive replay on purpose. This is the argument stated
 * once, quickly; the replay below it is the evidence you can drive yourself.
 *
 * Cost discipline, because a 1.5 MB autoplaying video on a landing page is a real
 * tax: the poster is the only thing that loads until the section is near the
 * viewport, `preload="none"` keeps the MP4 off the critical path, and a viewer who
 * asked for reduced motion is served the still frame and never fetches the video
 * at all.
 */
export function HandoffFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [armed, setArmed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);

  // Arm on approach, not on load. A fractional IntersectionObserver threshold is
  // unreachable for a section taller than viewport/threshold, so the geometry is
  // checked directly and the observer only covers the not-yet-visible case.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setReduced(true);
      return;
    }

    const el = sectionRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 1.5 && rect.bottom > 0) {
      setArmed(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        setArmed(true);
      },
      { rootMargin: '400px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Autoplay once it is actually on screen, and stop when it leaves — a video
  // decoding in a scrolled-past section is heat with no audience.
  useEffect(() => {
    if (!armed) return;
    const el = sectionRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => {
            /* autoplay refused — the poster and the control still work */
          });
        } else {
          video.pause();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [armed]);

  const toggle = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, []);

  return (
    <section
      ref={sectionRef}
      className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Cognitive handoff
        </div>
        <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          A worker fails. The work does not.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          Nine seconds, no narration. A rate limit kills the worker mid-task; the decisions and the
          remaining work survive it, and a different model finishes the job.
        </p>

        <figure className="mt-10">
          <div className="surface-card relative overflow-hidden">
            <div className="relative aspect-video w-full">
              {reduced ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="/motion/handoff-poster.jpg"
                  alt="The finished state of the handoff: the replacement worker holding 1.2 kB of context, verdict PASS, 17 of 17 assertions."
                  className="absolute inset-0 h-full w-full object-cover"
                  width={1440}
                  height={810}
                />
              ) : (
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  poster="/motion/handoff-poster.jpg"
                  preload="none"
                  muted
                  loop
                  playsInline
                  aria-label="Animated explanation of the cognitive handoff: a worker is hired, hits a 429 rate limit, a checkpoint carrying decisions and remaining work is captured, a replacement worker is hired, and the task verifies at 17 of 17 assertions."
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                >
                  {armed && <source src="/motion/handoff.mp4" type="video/mp4" />}
                </video>
              )}
            </div>

            {!reduced && (
              <div className="flex items-center justify-between border-t border-[var(--color-obsidian-edge)] px-5 py-3">
                <button
                  type="button"
                  onClick={toggle}
                  className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)] transition-colors hover:text-[var(--color-quartz)]"
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
                <span className="mono text-[11px] text-[var(--color-slate)]">
                  rendered with HyperFrames · 9.0s · silent
                </span>
              </div>
            )}
          </div>
          <figcaption className="mono mt-3 text-[11px] text-[var(--color-slate)]">
            Source composition: <span className="text-[var(--color-ash)]">motion/index.html</span> —
            0 lint, runtime, layout, motion and contrast findings; 48/48 text checks pass WCAG AA.
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
