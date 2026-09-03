/**
 * Leverage mark.
 *
 * One node branching into many and recombining — the product in a glyph. Drawn on a
 * 24-unit grid so it stays legible at 16px in a browser tab, which rules out
 * anything with interior detail. No brain, no robot, no borrowed brand asset.
 */
export function LeverageMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M4 12h3M17 12h3M7 12c0-3 1.6-5 5-5s5 2 5 5M7 12c0 3 1.6 5 5 5s5-2 5 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path
        d="M4 12h3M7 12h10M17 12h3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="3" cy="12" r="1.6" fill="currentColor" />
      <circle cx="21" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="7" r="1.4" fill="currentColor" opacity="0.75" />
      <circle cx="12" cy="17" r="1.4" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <LeverageMark size={20} className="text-[var(--color-frosted-lilac)]" />
      <span
        className="text-[17px] tracking-[-0.02em] text-[var(--color-quartz)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
      >
        Leverage
      </span>
    </span>
  );
}
