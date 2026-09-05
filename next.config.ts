import type { NextConfig } from 'next';

/**
 * The evidence files are read at request time with `fs.readFile`, which Next's
 * output tracing cannot see — a computed read has no import for the tracer to
 * follow. Without an explicit include they are absent from the serverless bundle
 * and every page that reads them silently renders its empty state, which on this
 * site means the landing page loses the recorded run it exists to show. Naming
 * them here is the supported way to say "this data ships with the function".
 *
 * `outputFileTracingRoot` is pinned because the repository sits below a directory
 * that has its own lockfile; without it Next picks the parent as the root and
 * warns on every build.
 */
/**
 * Hardening headers. The public deployment is read-only, so there is no state to
 * hijack, but a page that can be framed and a response that can be sniffed are
 * still weaknesses an outside tester will write down. Everything the app loads
 * is same-origin: fonts are self-hosted by next/font, the film and posters live in
 * /public, and the only client fetches are to the app's own routes. So the policy
 * can be strict. `unsafe-inline` for scripts is what Next's hydration payload
 * needs without a per-request nonce; `unsafe-eval` is dev-only, for Turbopack.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self'",
  // 'self', not 'none': the /demo page frames the site's own arcade build.
  "frame-ancestors 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
  },
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/': ['./demo/**/*.json'],
    '/demo': ['./demo/**/*.json'],
    '/benchmarks': ['./demo/**/*.json'],
    '/app/missions': ['./demo/**/*.json'],
    '/app/missions/[missionId]': ['./demo/**/*.json'],
    '/api/v1/missions': ['./demo/**/*.json'],
    '/api/v1/missions/[missionId]': ['./demo/**/*.json'],
    // A live run copies the fixture into the function's writable temp directory
    // and verifies against its own test files, so the fixture must ship too.
    '/api/v1/live/run': ['./benchmark/forge-app/**'],
  },
};

export default nextConfig;
