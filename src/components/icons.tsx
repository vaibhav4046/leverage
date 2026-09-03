/**
 * The icon set.
 *
 * Drawn here rather than pulled from a library for two reasons. A library ships
 * hundreds of glyphs to use a dozen, and — more importantly — a generic icon pack
 * is the fastest way to make a product look like every other dashboard. These are
 * on one 24-unit grid at a single 1.5 stroke weight, so a row of them reads as one
 * family instead of a collection.
 *
 * Rules that keep them consistent:
 *   - `currentColor` only. An icon never carries its own colour, so it inherits
 *     state (hover, active, pass, fail) from the thing it sits in.
 *   - No interior detail below ~3 units. It disappears at 16px and turns to mush.
 *   - `aria-hidden` by default: an icon beside a label is decoration, and a screen
 *     reader announcing "icon" after the label is noise. Icon-only controls pass a
 *     `title`, which switches the element to `img` with an accessible name.
 */

export interface IconProps {
  size?: number;
  className?: string;
  /** Set only for an icon carrying meaning on its own (an icon-only button). */
  title?: string;
}

function Svg({
  size = 20,
  className = '',
  title,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ navigation */

/** Overview: the workspace at a glance, as unequal panels rather than a 2x2 grid. */
export function IconOverview(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="3" width="8" height="10" rx="1.5" />
      <rect x="13" y="3" width="8" height="6" rx="1.5" />
      <rect x="3" y="15" width="8" height="6" rx="1.5" />
      <rect x="13" y="11" width="8" height="10" rx="1.5" />
    </Svg>
  );
}

/** New mission: a target with a goal placed on it. */
export function IconNewMission(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3" />
    </Svg>
  );
}

/** Missions: a task graph — work with dependencies, not a flat list. */
export function IconMissions(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="9" width="6" height="6" rx="1.5" />
      <rect x="15.5" y="3.5" width="6" height="6" rx="1.5" />
      <rect x="15.5" y="14.5" width="6" height="6" rx="1.5" />
      <path d="M8.5 11.4h3.2a1.8 1.8 0 0 0 1.8-1.8V8.3a1.8 1.8 0 0 1 1.8-1.8h0M8.5 12.6h3.2a1.8 1.8 0 0 1 1.8 1.8v1.3a1.8 1.8 0 0 0 1.8 1.8h0" />
    </Svg>
  );
}

/** Models: the workforce, as a processor rather than a humanoid. */
export function IconModels(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
      <rect x="10" y="10" width="4" height="4" rx="1" />
      <path d="M9.5 3v3.5M14.5 3v3.5M9.5 17.5V21M14.5 17.5V21M3 9.5h3.5M3 14.5h3.5M17.5 9.5H21M17.5 14.5H21" />
    </Svg>
  );
}

/** Providers: a connection made, not a generic plug. */
export function IconProviders(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="5.5" cy="12" r="2.5" />
      <circle cx="18.5" cy="6.5" r="2.5" />
      <circle cx="18.5" cy="17.5" r="2.5" />
      <path d="M7.9 11.1 16.1 7.4M7.9 12.9l8.2 3.7" />
    </Svg>
  );
}

/* ---------------------------------------------------------------------- state */

/** Verified: the check sits inside the proof, because the proof is the point. */
export function IconVerified(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.75 20 6v6.1c0 4.2-3.2 7.6-8 9.15-4.8-1.55-8-4.95-8-9.15V6l8-3.25Z" />
      <path d="m8.6 12.1 2.4 2.4 4.4-4.9" />
    </Svg>
  );
}

export function IconFailed(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15 9l-6 6M9 9l6 6" />
    </Svg>
  );
}

/** Rate limited: a clock, because the work is deferred rather than wrong. */
export function IconRateLimited(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" />
    </Svg>
  );
}

export function IconRunning(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="9" opacity="0.35" />
      <path d="M12 3a9 9 0 0 1 9 9" />
    </Svg>
  );
}

/** Checkpoint: understanding carried across a break in the work. */
export function IconCheckpoint(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 21V4.5" />
      <path d="M5 5.2h11.5l-2.1 3.4 2.1 3.4H5" />
      <circle cx="5" cy="16.5" r="1.6" />
    </Svg>
  );
}

/* ---------------------------------------------------------------------- money */

/** Budget: a coin stack. The product's loudest number is a cost. */
export function IconBudget(p: IconProps) {
  return (
    <Svg {...p}>
      <ellipse cx="12" cy="6.5" rx="7.5" ry="3" />
      <path d="M4.5 6.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" />
      <path d="M4.5 11.5v5c0 1.66 3.36 3 7.5 3s7.5-1.34 7.5-3v-5" />
    </Svg>
  );
}

/** Local: work that never leaves the machine. */
export function IconLocal(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="4.5" width="19" height="12" rx="2" />
      <path d="M8 20.5h8M12 16.5v4" />
    </Svg>
  );
}

/** Free routes: cloud capacity that costs nothing. */
export function IconCloud(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 18.5a4.5 4.5 0 0 1-.6-8.96A5.5 5.5 0 0 1 17 9.2a4.15 4.15 0 0 1 .4 9.3H7Z" />
    </Svg>
  );
}

/** Host: the frontier model lending itself back through MCP sampling. */
export function IconHost(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v6M12 15v6M3 12h6M15 12h6" opacity="0.5" />
      <circle cx="12" cy="12" r="8.5" opacity="0.35" />
    </Svg>
  );
}

/* --------------------------------------------------------------------- motion */

export function IconPlay(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M8 5.6 18.5 12 8 18.4V5.6Z" />
    </Svg>
  );
}

export function IconPause(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9 5.5v13M15 5.5v13" />
    </Svg>
  );
}

export function IconReplay(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 12a8 8 0 1 1-2.6-5.9" />
      <path d="M20.5 3.5V8H16" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ utilities */

export function IconArrowRight(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4.5 12h14M13 6.5l5.5 5.5-5.5 5.5" />
    </Svg>
  );
}

export function IconExternal(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M13.5 4.5H19.5V10.5" />
      <path d="M19.5 4.5 11 13" />
      <path d="M18 14.5v3.7a1.8 1.8 0 0 1-1.8 1.8H5.8A1.8 1.8 0 0 1 4 18.2V7.8A1.8 1.8 0 0 1 5.8 6h3.7" />
    </Svg>
  );
}

export function IconSearch(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.4 15.4 4.1 4.1" />
    </Svg>
  );
}

export function IconShield(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 2.75 20 6v6.1c0 4.2-3.2 7.6-8 9.15-4.8-1.55-8-4.95-8-9.15V6l8-3.25Z" />
    </Svg>
  );
}

export function IconDocs(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 3.5h8.5L19 8v12.5H6z" />
      <path d="M14 3.5V8h5" />
      <path d="M9 12.5h7M9 16h5" />
    </Svg>
  );
}
