/**
 * Token estimation.
 *
 * Deliberately crude and deliberately honest: every number derived from this is
 * labelled "approximate" in the UI. Leverage never claims a token saving it cannot
 * support, so where a provider reports real usage we use that instead and this
 * estimator is only for pre-flight decisions (context fit, cost estimate) where an
 * approximation is all a scheduler needs.
 *
 * ~3.6 characters per token is a reasonable average across code and English for the
 * model families in the pool. It is not a tokenizer and does not pretend to be.
 */
const CHARS_PER_TOKEN = 3.6;

export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function estimateTokensForFiles(files: { content?: string }[]): number {
  return files.reduce((sum, f) => sum + estimateTokens(f.content ?? ''), 0);
}

/** Format for display. Keeps the UI and the docs using the same rounding. */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
