'use client';

import { useEffect, useRef, useState } from 'react';
import { IconPlay, IconPause } from '@/components/icons';

/**
 * The handoff, as a nine-second film.
 *
 * Rendered with HyperFrames from `motion/index.html` — a real composition on the
 * product's own tokens, not a screen recording. It sits above the interactive
 * replay because the two do different jobs: the film states the argument in nine
 * seconds, the replay lets you check it against the event log.
 *
 * It plays on scroll and stops when it leaves the viewport, so a page left open in
 * a background tab is not decoding video forever. Autoplay is muted and the file
 * has no audio track at all, which is what keeps browsers from blocking it.
 */
export function HandoffFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    const video = videoRef.current;
    if (!el || !video) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          // A rejected play() is normal (a background tab, a strict autoplay
          // policy) and must not become an unhandled rejection.
          video.play().catch(() => {});
        } else {
          video.pause();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => {});
    else video.pause();
  };

  return (
    <section
      ref={sectionRef}
      className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]"
    >
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          Cognitive handoff · nine seconds
        </div>
        <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          A worker fails. The work does not.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          A rate limit is an infrastructure failure, not a wrong answer. Leverage keeps what the
          worker understood, hires a different one, and carries on. That is why a 429 costs a
          worker rather than the project.
        </p>

        <figure className="mt-10">
          <div className="glass relative overflow-hidden p-1.5">
            <video
              ref={videoRef}
              className="block w-full"
              width={1920}
              height={1080}
              muted
              playsInline
              loop
              preload="metadata"
              poster="/motion/handoff-poster.jpg"
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onLoadedData={() => setReady(true)}
              aria-label="Animated diagram: a worker is rate limited, a checkpoint is captured, a replacement worker resumes, and the tests pass."
            >
              {/* h264 only. The VP9 encode of this composition came out 2.6 MB
                  against 1.5 MB, and every browser that can play the webm can
                  already play this — a second source here is pure download. */}
              <source src="/motion/handoff.mp4" type="video/mp4" />
            </video>

            <button
              type="button"
              onClick={toggle}
              disabled={!ready}
              className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-sapphire-hairline)] text-[var(--color-quartz)] backdrop-blur transition-colors hover:border-[var(--color-frosted-lilac)] disabled:opacity-40"
              style={{ background: 'rgba(14,17,27,0.72)' }}
              aria-label={playing ? 'Pause the film' : 'Play the film'}
            >
              {playing ? <IconPause size={16} /> : <IconPlay size={16} />}
            </button>
          </div>

          <figcaption className="mono mt-3 text-[11px] text-[var(--color-ash)]">
            Rendered with HyperFrames from <span className="text-[var(--color-mist)]">motion/index.html</span> ·
            1920×1080 · every figure in it is from the recorded run
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
