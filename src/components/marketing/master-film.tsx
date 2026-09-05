'use client';

import { useRef, useState } from 'react';
import { IconPlay } from '@/components/icons';

/**
 * The film. Sixty-eight seconds, narrated.
 *
 * Rendered with HyperFrames from `motion/compositions/film.html`, cut on the
 * narration's own timestamps, on the product's tokens. It has a voice track, so
 * it never autoplays: a page that starts talking is a page people close. One
 * click, native controls after that, because a scrub bar and a volume control
 * are what a viewer expects from a film and nobody expects from a diagram.
 *
 * Every figure spoken or shown is from a recorded mission a judge can open.
 */
export function MasterFilm() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [started, setStarted] = useState(false);

  const start = () => {
    const video = videoRef.current;
    if (!video) return;
    setStarted(true);
    video.play().catch(() => setStarted(false));
  };

  return (
    <section className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-abyss)]">
      <div className="mx-auto max-w-[1200px] px-6 py-20">
        <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
          The film · 68 seconds · narrated
        </div>
        <h2 className="heading mt-3 max-w-[44rem] text-[clamp(1.75rem,4vw,2.25rem)] text-[var(--color-quartz)]">
          One frontier brain. An elastic workforce.
        </h2>
        <p className="mt-5 max-w-[46rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
          What Leverage is, what it refuses to do, and what happened in the recorded runs. Seven
          scenes, one voice, and no number that is not on this site somewhere with its evidence.
        </p>

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
              poster="/motion/film-poster.jpg"
              aria-label="Leverage, the film. A narrated explanation of the intelligence resource manager: policy before scoring, the auction, RocketRide execution, the cognitive handoff, and verification."
            >
              <source src="/motion/film.mp4" type="video/mp4" />
            </video>

            {!started && (
              <button
                type="button"
                onClick={start}
                className="group absolute inset-1.5 flex items-center justify-center"
                aria-label="Play the film, with sound"
              >
                <span
                  className="flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-sapphire-hairline)] text-[var(--color-quartz)] backdrop-blur transition-transform group-hover:scale-105"
                  style={{ background: 'rgba(14,17,27,0.78)' }}
                >
                  <IconPlay size={26} />
                </span>
                <span
                  className="mono absolute bottom-5 left-5 rounded-full px-3 py-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-mist)]"
                  style={{ background: 'rgba(14,17,27,0.72)' }}
                >
                  Sound on · 1:08
                </span>
              </button>
            )}
          </div>

          <figcaption className="mono mt-3 text-[11px] text-[var(--color-ash)]">
            Rendered with HyperFrames from{' '}
            <span className="text-[var(--color-mist)]">motion/compositions/film.html</span> · voiced
            with ElevenLabs from <span className="text-[var(--color-mist)]">scripts/narrate-film.mjs</span> ·
            scenes cut on the narration&rsquo;s own timestamps
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
