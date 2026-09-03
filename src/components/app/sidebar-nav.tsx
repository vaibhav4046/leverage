'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  IconOverview,
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
  { href: '/app/missions', label: 'Missions', icon: IconMissions },
  { href: '/app/models', label: 'Models', icon: IconModels },
  { href: '/app/providers', label: 'Providers', icon: IconProviders },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Application" className="flex-1 px-3 py-3">
      <ul className="space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          // `/app` matches only itself; every other entry owns its subtree, so a
          // mission detail page still lights up Missions.
          const active = href === '/app' ? pathname === '/app' : pathname.startsWith(href);
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
                      : 'text-[var(--color-slate)] transition-colors group-hover:text-[var(--color-ash)]'
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
