import Link from 'next/link';
import { Wordmark } from '@/components/brand';

/**
 * Authenticated app shell.
 *
 * Denser than the marketing pages on purpose: this is an operations console, and
 * carrying 80px marketing rhythm into a live task table would make it harder to
 * read, not more premium.
 */
const NAV = [
  { href: '/app', label: 'Overview' },
  { href: '/app/new', label: 'New mission' },
  { href: '/app/missions', label: 'Missions' },
  { href: '/app/models', label: 'Models' },
  { href: '/app/providers', label: 'Providers' },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-[var(--color-abyss)]">
      <aside className="hidden w-[220px] shrink-0 flex-col border-r border-[var(--color-obsidian-edge)] bg-[var(--color-void)] lg:flex">
        <div className="px-5 py-4">
          <Link href="/" aria-label="Leverage home">
            <Wordmark />
          </Link>
        </div>
        <nav aria-label="Application" className="flex-1 px-3 py-2">
          <ul className="space-y-0.5">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block rounded-[8px] px-3 py-2 text-[14px] text-[var(--color-ash)] transition-colors hover:bg-[var(--color-deep-sea)] hover:text-[var(--color-quartz)]"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mono border-t border-[var(--color-obsidian-edge)] px-5 py-3 text-[11px] text-[var(--color-slate)]">
          local workspace
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1">
        {children}
      </main>
    </div>
  );
}
