'use client';

import { useEffect, useRef, useState } from 'react';
import { IconPlay } from '@/components/icons';

/**
 * The film. Narrated, over untouched footage of the live site.
 *
 * Rendered with HyperFrames from `motion/compositions/walkthrough.html`: every
 * frame inside the window is a real browser session against the deployment,
 * including one real live run recorded once, in order. It has a voice track, so
 * it never autoplays: a page that starts talking is a page people close. One
 * click, native controls after that, because a scrub bar and a volume control
 * are what a viewer expects from a film and nobody expects from a diagram.
 *
 * The 68-second motion piece, which states the thesis without footage, stays
 * available from the caption.
 */
export function MasterFilm({
  src = '/motion/walkthrough.mp4',
  poster = '/motion/walkthrough-poster.webp',
  eyebrow = 'The film · 1:51 · narrated',
  title = 'Press the button. Then read the log.',
  lede = 'A real mission runs on the site while you watch, then the auction, the handoff and the supply, all on untouched footage of the live deployment. No number is spoken that is not on the site with its evidence.',
  length = '1:51',
  sourceNote = 'motion/compositions/walkthrough.html',
}: {
  src?: string;
  poster?: string;
  eyebrow?: string;
  title?: string;
  lede?: string;
  length?: string;
  sourceNote?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const start = () => {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    video.play().catch(() => setStarted(false));
  };

  // The overlay button unmounts on start, which would drop keyboard focus to
  // <body>. Runs after the commit that turns `controls` on, since a video is only
  // focusable once it has controls.
  useEffect(() => {
    if (started) videoRef.current?.focus();
  }, [started]);

  return (
    <section id="film" className="scroll-mt-14 border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">{eyebrow}</div>
        <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          {title}
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">{lede}</p>

        <figure className="mt-10">
          <div className="glass relative overflow-hidden p-1.5">
            <video
              ref={videoRef}
              className="block w-full"
              width={1920}
              height={1080}
              playsInline
              preload="metadata"
              controls={started}
              poster={poster}
              aria-label="Leverage, the film. A narrated walkthrough of the live site: a real mission running on RocketRide, the auction, the cognitive handoff, and the measured supply."
            >
              <source src={src} type="video/mp4" />
            </video>

            {!started && (
              <button
                type="button"
                onClick={start}
                className="group absolute inset-1.5 flex items-center justify-center"
                aria-label={`Play the film. Sound on · ${length}`}
              >
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-sapphire-hairline)] text-[var(--color-quartz)] backdrop-blur transition-transform group-hover:scale-105"
                  style={{ background: 'rgba(14,17,27,0.78)' }}
                >
                  <IconPlay size={26} />
                </span>
                <span
                  className="mono absolute left-3 top-3 whitespace-nowrap rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-mist)] sm:bottom-5 sm:left-5 sm:top-auto"
                  style={{ background: 'rgba(14,17,27,0.72)' }}
                >
                  Sound on · {length}
                </span>
              </button>
            )}
          </div>

          <figcaption className="mono mt-3 text-[11px] text-[var(--color-ash)]">
            Rendered with HyperFrames from <span className="text-[var(--color-mist)]">{sourceNote}</span> over
            real browser sessions against the deployment · voiced with ElevenLabs from{' '}
            <span className="text-[var(--color-mist)]">scripts/narrate-film.mjs</span> · the 69-second motion
            version is at{' '}
            <a href="/motion/film.mp4" className="text-[var(--color-frosted-lilac)] underline underline-offset-2">
              /motion/film.mp4
            </a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
