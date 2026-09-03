import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The benchmark fixture's src/ is written by workers at run time. Linting it
    // would be linting the output of the thing under test.
    "benchmark/forge-app/src/**",
    ".leverage-state/**",
    "demo/**",
  ]),
]);

export default eslintConfig;
