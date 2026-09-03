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
const nextConfig: NextConfig = {
  outputFileTracingRoot: __dirname,
  outputFileTracingIncludes: {
    '/': ['./demo/**/*.json'],
    '/demo': ['./demo/**/*.json'],
    '/benchmarks': ['./demo/**/*.json'],
    '/app/missions': ['./demo/**/*.json'],
    '/app/missions/[missionId]': ['./demo/**/*.json'],
    '/api/v1/missions': ['./demo/**/*.json'],
    '/api/v1/missions/[missionId]': ['./demo/**/*.json'],
  },
};

export default nextConfig;
