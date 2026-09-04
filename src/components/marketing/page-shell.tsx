import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { Reveal } from '@/components/visual/motion';
import { AuroraField } from '@/components/visual/aurora-field';

/**
 * Shared chrome for the content pages.
 *
 * Extracted the moment there was a second page, because a nav that drifts between
 * routes is the fastest way to make a site feel assembled rather than designed,
 * and because six of these links were pointing at 404s, which is a far louder
 * signal of "unfinished" than any amount of visual polish.
 */

const NAV: [string, string][] = [
  ['/how-it-works', 'How it works'],
  ['/benchmarks', 'Benchmarks'],
  ['/docs', 'Docs'],
];

export function SiteNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-obsidian-edge)] bg-[rgba(11,12,14,0.82)] backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-6"
      >
        <Link href="/" aria-label="Leverage home">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 text-[14px] text-[var(--color-ash)] md:flex">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="transition-colors duration-150 hover:text-[var(--color-quartz)]"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/app"
            className="hidden text-[14px] text-[var(--color-ash)] transition-colors hover:text-[var(--color-quartz)] sm:block"
          >
            Mission Control
          </Link>
          <Link href="/app/new" className="btn-primary !py-2 !text-[14px]">
            Deploy Leverage
          </Link>
        </div>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-6 py-10 sm:flex-row sm:items-center sm:justify-between">
        <Wordmark />
        <div className="flex flex-wrap gap-6 text-[13px] text-[var(--color-ash)]">
          {[
            ['/docs', 'Docs'],
            ['/benchmarks', 'Benchmarks'],
            ['/how-it-works', 'How it works'],
            ['/demo', 'Demo'],
          ].map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-[var(--color-quartz)]">
              {label}
            </Link>
          ))}
          {/* Every claim on this site says "reproduce it yourself". Until now there
              was nowhere to click to do that. */}
          <a
            href="https://github.com/vaibhav4046/leverage"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-quartz)]"
          >
            Source
          </a>
        </div>
      </div>
    </footer>
  );
}

/** Standard header band for a content page. Aurora only here, never mid-page. */
export function PageHeader({
  eyebrow,
  title,
  intro,
}: {
  eyebrow: string;
  title: string;
  intro: string;
}) {
  return (
    <section className="aurora relative isolate overflow-hidden border-b border-[var(--color-obsidian-edge)]">
      <AuroraField />
      <div className="relative mx-auto max-w-[1200px] px-6 pb-16 pt-20">
        <Reveal>
          <div className="mono text-[12px] uppercase tracking-[0.08em] text-[var(--color-ash)]">
            {eyebrow}
          </div>
          <h1 className="display mt-4 max-w-[46rem] text-[clamp(2.25rem,5.5vw,3.25rem)] text-[var(--color-quartz)]">
            {title}
          </h1>
          <p className="mt-5 max-w-[46rem] text-[18px] font-light leading-[1.55] text-[var(--color-ash)]">
            {intro}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

export function ContentPage({
  eyebrow,
  title,
  intro,
  children,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav />
      <main id="main" className="bg-[var(--color-abyss)]">
        <PageHeader eyebrow={eyebrow} title={title} intro={intro} />
        <div className="mx-auto max-w-[1200px] px-6 py-16">{children}</div>
      </main>
      <SiteFooter />
    </>
  );
}

/* --------------------------------------------------------------- primitives */

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[46rem] space-y-5 text-[16px] font-light leading-[1.7] text-[var(--color-ash)]">
      {children}
    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="heading mt-16 text-[clamp(1.5rem,3vw,1.875rem)] text-[var(--color-quartz)] first:mt-0">
      {children}
    </h2>
  );
}

export function Code({ children, label }: { children: string; label?: string }) {
  return (
    <div className="surface-card my-6 overflow-hidden">
      {label && (
        <div className="mono border-b border-[var(--color-obsidian-edge)] px-5 py-2.5 text-[11px] text-[var(--color-ash)]">
          {label}
        </div>
      )}
      <pre className="mono overflow-x-auto px-5 py-4 text-[12.5px] leading-[1.7] text-[var(--color-mist)]">
        {children}
      </pre>
    </div>
  );
}

export function Callout({
  title,
  children,
  tone = 'neutral',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'neutral' | 'warn';
}) {
  return (
    <div className={`my-8 p-6 ${tone === 'warn' ? 'surface-highlight' : 'surface-card'}`}>
      <div
        className="mono text-[11px] uppercase tracking-[0.08em]"
        style={{
          color: tone === 'warn' ? 'var(--color-state-warn)' : 'var(--color-frosted-lilac)',
        }}
      >
        {title}
      </div>
      <div className="mt-3 text-[14px] leading-relaxed text-[var(--color-mist)]">{children}</div>
    </div>
  );
}
