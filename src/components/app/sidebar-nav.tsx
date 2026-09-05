'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import {
  IconOverview,
  IconPlay,
  IconNewMission,
  IconMissions,
  IconModels,
  IconProviders,
  type IconProps,
} from '@/components/icons';

/**
 * Console navigation.
 *
 * Client-side only because it needs the current path: a sidebar with no active
 * state is a list of links, not navigation, and "where am I" was the first thing
 * missing from this console. The indicator is a left rule plus a lit icon rather
 * than a filled pill — a solid block at 220px wide reads as a button and competes
 * with the primary action.
 */

const NAV: { href: string; label: string; icon: (p: IconProps) => React.ReactElement }[] = [
  { href: '/app', label: 'Overview', icon: IconOverview },
  { href: '/app/new', label: 'New mission', icon: IconNewMission },
  { href: '/app/live', label: 'Live run', icon: IconPlay },
  { href: '/app/missions', label: 'Missions', icon: IconMissions },
  { href: '/app/models', label: 'Models', icon: IconModels },
  { href: '/app/providers', label: 'Providers', icon: IconProviders },
];

// `/app` matches only itself; every other entry owns its subtree, so a mission
// detail page still lights up Missions.
function isActive(pathname: string, href: string): boolean {
  return href === '/app' ? pathname === '/app' : pathname.startsWith(href);
}

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Application" className="flex-1 px-3 py-3">
      <ul className="space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={[
                  'group relative flex items-center gap-3 rounded-[9px] py-2 pl-3.5 pr-3 text-[13.5px] transition-colors',
                  active
                    ? 'bg-[var(--color-deep-sea)] text-[var(--color-quartz)]'
                    : 'text-[var(--color-ash)] hover:bg-[rgba(13,23,43,0.55)] hover:text-[var(--color-mist)]',
                ].join(' ')}
              >
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 h-[18px] w-[2px] -translate-y-1/2 rounded-r-full transition-opacity"
                  style={{
                    background: 'var(--color-frosted-lilac)',
                    opacity: active ? 1 : 0,
                  }}
                />
                <Icon
                  size={17}
                  className={
                    active
                      ? 'text-[var(--color-frosted-lilac)]'
                      : 'text-[var(--color-ash)] opacity-60 transition-colors group-hover:opacity-100'
                  }
                />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * The same links as a horizontally scrolling strip for viewports below lg, where
 * the sidebar is display:none. Without it five of the six console pages were
 * unreachable from a phone. The strip scrolls inside itself, so the page never
 * gains a horizontal scrollbar; the active rule sits underneath rather than to the
 * left, which is the same indicator turned to match the axis.
 */
export function MobileNav() {
  const pathname = usePathname();
  const activeRef = useRef<HTMLAnchorElement>(null);

  // Six links are wider than a phone, so the current page's link can start
  // off-screen to the right. Centring it also shows its neighbours on both sides,
  // which is what tells a thumb the strip scrolls. `block: nearest` keeps this
  // from ever moving the page itself.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, [pathname]);

  return (
    <nav
      aria-label="Application"
      className="overflow-x-auto border-b border-[var(--color-obsidian-edge)] [scrollbar-width:none] lg:hidden [&::-webkit-scrollbar]:hidden"
    >
      <ul className="flex w-max gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                ref={active ? activeRef : undefined}
                aria-current={active ? 'page' : undefined}
                className={[
                  'relative flex min-h-[44px] items-center gap-2 whitespace-nowrap rounded-[9px] px-3 text-[13px] transition-colors',
                  active
                    ? 'text-[var(--color-quartz)]'
                    : 'text-[var(--color-ash)] hover:text-[var(--color-mist)]',
                ].join(' ')}
              >
                <Icon
                  size={16}
                  className={
                    active ? 'text-[var(--color-frosted-lilac)]' : 'text-[var(--color-ash)] opacity-60'
                  }
                />
                {label}
                <span
                  aria-hidden
                  className="absolute inset-x-3 bottom-0 h-[2px] rounded-t-full"
                  style={{ background: 'var(--color-frosted-lilac)', opacity: active ? 1 : 0 }}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
