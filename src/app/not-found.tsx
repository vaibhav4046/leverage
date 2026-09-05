import Link from 'next/link';
import { Wordmark } from '@/components/brand';

/**
 * The page a bad link lands on.
 *
 * Without this, Next serves its own white default, in a system font, on a site
 * that is otherwise dark and deliberate; a judge who mistypes a mission id would
 * see the one page that does not look designed. This one says what happened and
 * where the real things are.
 */
export default function NotFound() {
  return (
    <main
      id="main"
      className="flex min-h-screen flex-col items-center justify-center bg-[var(--color-abyss)] px-6 text-center text-[var(--color-quartz)]"
    >
      <Link href="/" aria-label="Leverage home">
        <Wordmark />
      </Link>
      <div className="mono mt-12 text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">404</div>
      <h1 className="display mt-3 text-[clamp(2rem,5vw,3rem)]">Nothing here.</h1>
      <p className="mt-4 max-w-[34rem] text-[17px] font-light leading-relaxed text-[var(--color-ash)]">
        No page or mission lives at this address. The recorded missions and the live run are one
        step away.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Link href="/app/live" className="btn-primary">
          Run a real mission
        </Link>
        <Link href="/app/missions" className="btn-ghost">
          Recorded missions
        </Link>
      </div>
    </main>
  );
}
