import Link from 'next/link';
import type { Metadata } from 'next';
import { Callout, Code, ContentPage, H2, Prose } from '@/components/marketing/page-shell';

export const metadata: Metadata = {
  title: 'Sign in · Leverage',
  description: 'How authentication works in Leverage, and its current state in this build.',
};

/**
 * Sign-in.
 *
 * There is no Privy app configured in this build, so there is nothing honest to put
 * behind a button. Rather than render a dead form, this states exactly where auth
 * stands and how to finish it. On a product whose whole argument is "check the
 * evidence", a fake sign-in would be the worst page in the site to invent.
 */
export default function SignInPage() {
  return (
    <ContentPage
      eyebrow="Sign in"
      title="Authentication is wired, not configured."
      intro="The verification path is built and every API route goes through it. What is missing is a Privy application, which needs an account this build does not have."
    >
      <H2>What exists</H2>
      <Prose>
        <p>
          Privy is the intended identity provider, and the rule that matters is that the server{' '}
          <em>verifies</em> the access token rather than decoding it. A decoded JWT is a claim,
          not an authentication, and trusting one is the difference between an auth system and a
          suggestion box.
        </p>
        <p>
          Every request resolves identity → workspace → resource, and the tenancy check lives in
          the mission store rather than in each route, so a new route cannot forget it. A mission
          belonging to another workspace returns 404 rather than 403. A 403 confirms the id
          exists, which is a free enumeration oracle.
        </p>
      </Prose>

      <H2>What is missing</H2>
      <Prose>
        <p>
          With no Privy credentials, the server falls back to a development identity. That
          fallback is deliberately hostile to being shipped by accident:
        </p>
      </Prose>
      <Code label="src/auth/identity.ts">{`if (isProduction) {
  // Deliberately fatal. Shipping dev identity to production would be the
  // single worst bug in this codebase, so it is impossible rather than
  // discouraged.
  throw new AuthError(
    'Authentication is not configured. Set NEXT_PUBLIC_PRIVY_APP_ID and PRIVY_APP_SECRET.',
    500,
  );
}`}</Code>
      <Prose>
        <p>
          It is gated behind <code className="mono">LEVERAGE_DEV_AUTH=1</code>, throws on any
          authenticated request when <code className="mono">NODE_ENV=production</code>, and is
          labelled in the UI and in <code className="mono">/api/v1/health</code>. A deployment
          that forgets to configure Privy fails loudly rather than quietly serving everyone the
          same workspace.
        </p>
      </Prose>

      <H2>Finishing it</H2>
      <Code>{`npm i @privy-io/server-auth

# .env.local
NEXT_PUBLIC_PRIVY_APP_ID=...
PRIVY_APP_SECRET=...
PRIVY_VERIFICATION_KEY=...
LEVERAGE_DEV_AUTH=0`}</Code>
      <Prose>
        <p>No code change beyond the install. The verification path is already in place.</p>
      </Prose>

      <Callout title="In the meantime">
        The app runs locally in development identity.{' '}
        <Link href="/app" className="text-[var(--color-frosted-lilac)] underline">
          Open Mission Control
        </Link>{' '}
        or{' '}
        <Link href="/app/new" className="text-[var(--color-frosted-lilac)] underline">
          start a mission
        </Link>
        . Everything is real except who you are.
      </Callout>
    </ContentPage>
  );
}
