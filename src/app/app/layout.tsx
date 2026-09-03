import Link from 'next/link';
import { Wordmark } from '@/components/brand';
import { SidebarNav } from '@/components/app/sidebar-nav';
import { IconDocs, IconExternal } from '@/components/icons';
import { authMode, getPageIdentity } from '@/auth/identity';

export const dynamic = 'force-dynamic';

/**
 * Authenticated app shell.
 *
 * Denser than the marketing pages on purpose: this is an operations console, and
 * carrying 80px marketing rhythm into a live task table would make it harder to
 * read, not more premium.
 *
 * The footer states which identity is live. A console that does not tell you whose
 * workspace you are looking at is one keystroke from a very expensive mistake, and
 * on the public deployment it is the difference between "this is broken" and "this
 * is deliberately read-only".
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const identity = getPageIdentity();
  const mode = authMode();

  const modeLabel =
    mode === 'privy'
      ? 'signed in'
      : mode === 'public-demo'
        ? 'public demo · read-only'
        : mode === 'dev'
          ? 'local workspace'
          : 'no identity';

  const modeColor =
    mode === 'privy'
      ? 'var(--color-state-pass)'
      : mode === 'public-demo'
        ? 'var(--color-frosted-lilac)'
        : mode === 'dev'
          ? 'var(--color-state-warn)'
          : 'var(--color-state-fail)';

  return (
    <div className="flex min-h-screen bg-[var(--color-abyss)]">
      <aside className="hidden w-[228px] shrink-0 flex-col border-r border-[var(--color-obsidian-edge)] bg-[var(--color-void)] lg:flex">
        <div className="border-b border-[var(--color-obsidian-edge)] px-5 py-[15px]">
          <Link href="/" aria-label="Leverage home" className="inline-block">
            <Wordmark />
          </Link>
        </div>

        <SidebarNav />

        <div className="border-t border-[var(--color-obsidian-edge)] px-3 py-3">
          <Link
            href="/docs"
            className="flex items-center gap-3 rounded-[9px] py-2 pl-3.5 pr-3 text-[13.5px] text-[var(--color-ash)] transition-colors hover:bg-[rgba(13,23,43,0.55)] hover:text-[var(--color-mist)]"
          >
            <IconDocs size={17} className="text-[var(--color-ash)] opacity-60" />
            Documentation
          </Link>
        </div>

        <div className="border-t border-[var(--color-obsidian-edge)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="h-[7px] w-[7px] shrink-0 rounded-full"
              style={{ background: modeColor, boxShadow: `0 0 8px ${modeColor}` }}
            />
            <span className="mono text-[10.5px] uppercase leading-[1.5] tracking-[0.08em] text-[var(--color-ash)]">
              {modeLabel}
            </span>
          </div>
          <div className="mono mt-1.5 truncate text-[10.5px] text-[var(--color-ash)] opacity-70">
            {identity ? identity.workspaceId : 'not resolved'}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile bar: the sidebar is hidden below lg, so the wordmark and an
            escape hatch to the site have to live somewhere. */}
        <div className="flex items-center justify-between border-b border-[var(--color-obsidian-edge)] px-5 py-3 lg:hidden">
          <Link href="/" aria-label="Leverage home">
            <Wordmark />
          </Link>
          <Link
            href="/docs"
            className="mono flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-[var(--color-ash)]"
          >
            Docs
            <IconExternal size={13} />
          </Link>
        </div>

        <main id="main" className="min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
