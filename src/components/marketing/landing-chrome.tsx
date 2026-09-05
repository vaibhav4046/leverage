import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { MobileMenu } from '@/components/marketing/page-shell';

/**
 * Landing-page chrome. The content pages share SiteNav and SiteFooter; the
 * landing gets its own because its nav points into the page and its footer
 * carries the evidence links, whose mission ids are read from the loaded runs
 * rather than typed here.
 */

const NAV: [string, string][] = [
  ['#product', 'Product'],
  ['#proof', 'Proof'],
  ['#connect', 'Connect'],
  ['/benchmarks', 'Benchmarks'],
  ['/docs', 'Docs'],
];

export function LandingNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-obsidian-edge)] bg-[rgba(11,12,14,0.82)] backdrop-blur-xl">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-[1200px] items-center justify-between gap-6 px-6"
      >
        <Link href="/" aria-label="Leverage home" className="flex min-h-[44px] items-center">
          <Wordmark />
        </Link>
        <div className="hidden items-center gap-7 text-[14px] text-[var(--color-ash)] md:flex">
          {NAV.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex min-h-[44px] items-center transition-colors duration-150 hover:text-[var(--color-quartz)]"
            >
              {label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <MobileMenu
            links={[
              ...NAV,
              ['#faq', 'FAQ'],
              ['#install', 'Install'],
              ['/app', 'Mission Control'],
              ['/demo', 'Demo'],
            ]}
          />
          <Link
            href="/app"
            className="hidden min-h-[44px] items-center text-[14px] text-[var(--color-ash)] transition-colors hover:text-[var(--color-quartz)] sm:inline-flex"
          >
            Mission Control
          </Link>
          <Link
            href="/app/live"
            className="btn-primary inline-flex min-h-[44px] items-center whitespace-nowrap !py-2.5 !text-[14px]"
          >
            <span className="sm:hidden">Run one</span>
            <span className="hidden sm:inline">Run a real mission</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}

export interface FooterMission {
  label: string;
  id: string;
}

const REPO = 'https://github.com/vaibhav4046/leverage';

type FooterLink = [href: string, label: string, external?: boolean];

export function LandingFooter({ missions }: { missions: FooterMission[] }) {
  const groups: [string, FooterLink[]][] = [
    [
      'Product',
      [
        ['/app/live', 'Run a real mission'],
        ['/app', 'Mission Control'],
        ['/demo', 'Demo'],
        ['/benchmarks', 'Benchmarks'],
        ['/how-it-works', 'How it works'],
      ],
    ],
    [
      'Learn',
      [
        ['/docs', 'Docs'],
        ['/docs/mcp', 'MCP server'],
        ['#faq', 'FAQ'],
        [`${REPO}/blob/main/JUDGE_GUIDE.md`, 'Judge guide', true],
        [`${REPO}/blob/main/BENCHMARKS.md`, 'Methodology', true],
      ],
    ],
    [
      'Evidence',
      [
        ...missions.map(({ label, id }): FooterLink => [`/app/missions/${id}`, label]),
        ['/api/v1/health', 'Health, live'],
      ],
    ],
    [
      'Source',
      [
        [REPO, 'GitHub', true],
        [`${REPO}/blob/main/LICENSE`, 'MIT licence', true],
        [`${REPO}/blob/main/docs/ROCKETRIDE_FINDINGS.md`, 'RocketRide findings', true],
        [`${REPO}/blob/main/SECURITY.md`, 'Security', true],
      ],
    ],
  ];

  return (
    <footer className="relative overflow-hidden border-t border-[var(--color-obsidian-edge)] bg-[var(--color-void)]">
      <div className="mx-auto max-w-[1200px] px-6 pt-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-[minmax(0,1.2fr)_repeat(4,minmax(0,1fr))] md:gap-8">
          <div className="min-w-0 sm:col-span-2 md:col-span-1">
            <Wordmark />
            <p className="mt-4 max-w-[18rem] text-[13px] leading-relaxed text-[var(--color-ash)]">
              An intelligence resource manager for MCP hosts. One frontier brain, an elastic
              workforce, and a file behind every number.
            </p>
          </div>
          {groups.map(([title, links]) => (
            <nav key={title} aria-label={title} className="min-w-0">
              <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
                {title}
              </div>
              <ul className="mt-3 space-y-0.5">
                {links.map(([href, label, external]) => (
                  <li key={href + label}>
                    {external ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-[44px] items-center text-[13.5px] text-[var(--color-mist)] hover:text-[var(--color-quartz)]"
                      >
                        {label}
                      </a>
                    ) : (
                      <Link
                        href={href}
                        className="inline-flex min-h-[44px] items-center text-[13.5px] text-[var(--color-mist)] hover:text-[var(--color-quartz)]"
                      >
                        {label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mono mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-[var(--color-obsidian-edge)] py-6 text-[11px] text-[var(--color-ash)]">
          <span>© 2026 Leverage · MIT licence</span>
          <span>Every number on this page is read from a file in the repository when it renders.</span>
        </div>
      </div>

      {/* The mark, at the size a brand puts its name when it has nothing left to say. */}
      <div
        aria-hidden
        className="display pointer-events-none mx-auto max-w-[1200px] select-none overflow-hidden px-6 text-[clamp(4rem,17vw,15rem)] leading-[0.85] tracking-[-0.02em] text-[var(--color-quartz)]"
        style={{ opacity: 0.06, marginBottom: '-0.12em' }}
      >
        Leverage
      </div>
    </footer>
  );
}
