import Link from 'next/link';

/**
 * What an app page shows when no identity can be resolved.
 *
 * Reached when Privy is the configured provider but the request carried no session
 * a server component could verify, or when nothing is configured at all. The
 * alternative — falling back to a default workspace — is how a tenancy check
 * becomes decorative, so the page refuses instead and says exactly what is missing.
 */
export function AuthNotice() {
  return (
    <div className="p-6">
      <div className="surface-card max-w-[42rem] p-6">
        <div className="mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-frosted-lilac)]">
          Not signed in
        </div>
        <h1 className="heading mt-3 text-[24px] text-[var(--color-quartz)]">
          This workspace needs an identity.
        </h1>
        <p className="mt-3 text-[14.5px] leading-relaxed text-[var(--color-ash)]">
          Mission Control resolves identity before it resolves a workspace, so there is no
          default tenant to fall back to. Configure Privy, or run locally with{' '}
          <code className="mono text-[var(--color-mist)]">LEVERAGE_DEV_AUTH=1</code>.
        </p>
        <Link
          href="/sign-in"
          className="mono mt-5 inline-block text-[13px] text-[var(--color-frosted-lilac)] underline"
        >
          How authentication works here
        </Link>
      </div>
    </div>
  );
}
