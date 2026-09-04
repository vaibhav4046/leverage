import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
  // Vendored, minified third-party code. Linting it produces 8 errors about
  // someone else's build output and turns `npm run verify` red.
  'motion/**',
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The benchmark fixture's src/ is written by workers at run time. Linting it
    // would be linting the output of the thing under test.
    "benchmark/forge-app/src/**",
    "benchmark/arcade/src/**",
    "public/arcade/**",
    // CommonJS by design: a .cjs tool script, not app source.
    "scripts/*.cjs",
    ".leverage-state/**",
    "demo/**",
  ]),
]);

export default eslintConfig;
