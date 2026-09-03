import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * The console's shared furniture.
 *
 * Every app page previously opened with its own `p-6` and its own heading size, so
 * moving between them felt like moving between three products. These are the
 * primitives all of them are built from: one page frame, one card, one stat, one
 * table, one empty state. Consistency here is not a style preference — an operator
 * scanning for a failed task should not have to re-learn where the title sits.
 */

/* --------------------------------------------------------------- page framing */

export function Page({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-[1240px] px-7 py-8">{children}</div>;
}

export function PageHead({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: string;
  lede?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-6 border-b border-[var(--color-obsidian-edge)] pb-6">
      <div className="min-w-0">
        <div className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-frosted-lilac)]">
          {eyebrow}
        </div>
        <h1
          className="mt-2 text-[27px] leading-tight tracking-[-0.025em] text-[var(--color-quartz)]"
          style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
        >
          {title}
        </h1>
        {lede ? (
          <p className="mt-2 max-w-[46rem] text-[14.5px] leading-relaxed text-[var(--color-ash)]">
            {lede}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2.5">{actions}</div> : null}
    </header>
  );
}

export function Section({
  title,
  hint,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="mt-10">
      <div className="mb-3.5 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-ash)]">
            {title}
          </h2>
          {hint ? <p className="mt-1 text-[13px] text-[var(--color-ash)]">{hint}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ stat tiles */

/**
 * A stat tile.
 *
 * The number is the largest thing in the tile and the label is the smallest,
 * because a console is scanned, not read. The accent rule on the left is what
 * separates a metric from a card of prose at a glance.
 */
export function Stat({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: ReactNode;
  tone?: 'neutral' | 'pass' | 'fail' | 'accent';
}) {
  const accent =
    tone === 'pass'
      ? 'var(--color-state-pass)'
      : tone === 'fail'
        ? 'var(--color-state-fail)'
        : tone === 'accent'
          ? 'var(--color-frosted-lilac)'
          : 'var(--color-sapphire-hairline)';

  return (
    <div className="surface-card relative min-w-0 overflow-hidden p-5">
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[2px]"
        style={{ background: accent, opacity: tone === 'neutral' ? 0.5 : 0.9 }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="mono text-[10.5px] uppercase tracking-[0.1em] text-[var(--color-ash)]">
          {label}
        </div>
        {icon ? <span className="shrink-0 text-[var(--color-slate)]">{icon}</span> : null}
      </div>
      <div
        className="mt-2 text-[30px] leading-none tabular-nums tracking-[-0.02em] text-[var(--color-quartz)]"
        style={{ fontFamily: 'var(--font-display)', fontWeight: 500 }}
      >
        {value}
      </div>
      {sub ? <div className="mono mt-2 text-[11.5px] text-[var(--color-ash)]">{sub}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------------- table */

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="surface-card min-w-0 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-[var(--color-obsidian-edge)]">
              {head.map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="mono px-5 py-3 text-[10.5px] font-normal uppercase tracking-[0.1em] text-[var(--color-ash)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <tr className="border-b border-[var(--color-inkline)] transition-colors last:border-0 hover:bg-[var(--color-deep-sea)]">
      {children}
    </tr>
  );
}

export function Cell({
  children,
  mono = false,
  muted = false,
  right = false,
}: {
  children: ReactNode;
  mono?: boolean;
  muted?: boolean;
  right?: boolean;
}) {
  return (
    <td
      className={[
        'px-5 py-3.5 align-middle text-[13.5px]',
        mono ? 'mono tabular-nums' : '',
        muted ? 'text-[var(--color-ash)]' : 'text-[var(--color-mist)]',
        right ? 'text-right' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </td>
  );
}

/* ---------------------------------------------------------------- status pills */

export type Tone = 'pass' | 'fail' | 'warn' | 'live' | 'idle';

const TONES: Record<Tone, { fg: string; bg: string; bd: string }> = {
  pass: { fg: 'var(--color-state-pass)', bg: 'rgba(74,222,128,0.10)', bd: 'rgba(74,222,128,0.45)' },
  fail: { fg: 'var(--color-state-fail)', bg: 'rgba(248,113,113,0.10)', bd: 'rgba(248,113,113,0.45)' },
  warn: { fg: 'var(--color-state-warn)', bg: 'rgba(251,191,36,0.10)', bd: 'rgba(251,191,36,0.42)' },
  live: {
    fg: 'var(--color-frosted-lilac)',
    bg: 'rgba(133,166,233,0.10)',
    bd: 'rgba(133,166,233,0.45)',
  },
  idle: { fg: 'var(--color-ash)', bg: 'rgba(171,174,187,0.07)', bd: 'var(--color-sapphire-hairline)' },
};

export function Pill({
  tone,
  children,
  icon,
}: {
  tone: Tone;
  children: ReactNode;
  icon?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <span
      className="mono inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10.5px] uppercase tracking-[0.08em]"
      style={{ color: t.fg, background: t.bg, borderColor: t.bd }}
    >
      {icon}
      {children}
    </span>
  );
}

/** Maps a mission or task status onto the pill vocabulary, in one place. */
export function toneForStatus(status: string): Tone {
  if (['COMPLETED', 'PASSED'].includes(status)) return 'pass';
  if (['FAILED', 'CANCELLED', 'BLOCKED'].includes(status)) return 'fail';
  if (['RUNNING', 'IN_PROGRESS'].includes(status)) return 'live';
  return 'idle';
}

/* ----------------------------------------------------------------- empty state */

export function Empty({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="surface-card flex flex-col items-start gap-4 p-8 sm:flex-row sm:items-center">
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[12px] border border-[var(--color-sapphire-hairline)] text-[var(--color-frosted-lilac)]"
        style={{ background: 'rgba(133,166,233,0.07)' }}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[16px] text-[var(--color-quartz)]">{title}</div>
        <p className="mt-1.5 max-w-[42rem] text-[13.5px] leading-relaxed text-[var(--color-ash)]">
          {body}
        </p>
      </div>
      {action ? (
        <Link href={action.href} className="btn-ghost shrink-0 !py-2 !text-[13px]">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
